/**
 * Plan C 并发竞态修复回归测试
 *
 * 背景：interceptor.js 旧版只在 _commitDeltaState（响应完成后）才更新
 * _lastMessagesCount/_lastTailFp。mainAgent LLM 流式响应耗时数秒，期间若有
 * 后续请求 30ms 内连续 firing（例：teammate 终止 → SUGGESTION MODE 多次替换、
 * 多 SSE 通道注入），Plan C 用陈旧 prev 值比对长度，会漏检 in-place last-msg
 * replace → 客户端 sessionMerge prefix-overlap=0 → 内存中 mainAgentSessions
 * 翻倍 (doubled-history)。
 *
 * 修法：请求开始即 eager update _lastMessagesCount/_lastTailFp，Plan C 用进入
 * 函数前的 snapshot。本测试用 split-API（startRequest / commit）的 simulator
 * 模拟"A 还没 commit，B 已经发起"的真实竞态。
 *
 * KEEP IN SYNC: interceptor.js 第 611-682 行 eager update 块逻辑。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintMsg } from '../server/lib/interceptor-core.js';

const CHECKPOINT_INTERVAL = 10;

function makeRaceSimulator({ eagerUpdate = true, tailFpCheckEnabled = true, commitGuardEnabled = true } = {}) {
  let _lastMessagesCount = 0;
  let _lastTailFp = '';
  let _mainAgentDeltaCount = 0;

  function startRequest(messages) {
    const originalLength = messages.length;
    const originalTailFp = originalLength > 0 ? fingerprintMsg(messages[originalLength - 1]) : '';
    _mainAgentDeltaCount++;

    const prevMessagesCount = _lastMessagesCount;
    const prevTailFp = _lastTailFp;

    if (eagerUpdate && originalLength > 0) {
      _lastMessagesCount = originalLength;
      if (originalTailFp !== '') _lastTailFp = originalTailFp;
    }

    const sameLenInPlaceReplace =
      tailFpCheckEnabled &&
      messages.length === prevMessagesCount &&
      prevMessagesCount > 0 &&
      prevTailFp !== '' &&
      originalTailFp !== '' &&
      originalTailFp !== prevTailFp;

    const needsCheckpoint =
      prevMessagesCount === 0 ||
      messages.length < prevMessagesCount ||
      (_mainAgentDeltaCount % CHECKPOINT_INTERVAL === 0) ||
      sameLenInPlaceReplace;

    return {
      isCheckpoint: needsCheckpoint,
      inPlaceReplace: !!sameLenInPlaceReplace,
      deltaLength: needsCheckpoint ? originalLength : originalLength - prevMessagesCount,
      totalCount: originalLength,
      prevMessagesCount,
      prevTailFp,
      // 模拟响应完成后的 _commitDeltaState（KEEP IN SYNC: interceptor.js:_commitDeltaState）：
      // commitGuardEnabled=true（默认）→ 只在 originalLength > _lastMessagesCount 时更新，
      // 杜绝乱序完成时较短 commit 把已被 eager 推高的状态倒推。
      // commitGuardEnabled=false（control case）→ 无条件覆盖，重现倒推 BUG 实证生产代码漏点。
      // fp 守卫使用 `typeof === 'string'` 而非 `!== ''`，与生产 typeof 检查 byte-for-byte 对齐。
      commit: () => {
        if (commitGuardEnabled) {
          if (originalLength > 0 && originalLength > _lastMessagesCount) {
            _lastMessagesCount = originalLength;
            if (typeof originalTailFp === 'string') _lastTailFp = originalTailFp;
          }
        } else {
          if (originalLength > 0) {
            _lastMessagesCount = originalLength;
            if (typeof originalTailFp === 'string') _lastTailFp = originalTailFp;
          }
        }
      },
    };
  }

  return { startRequest, getState: () => ({ _lastMessagesCount, _lastTailFp, _mainAgentDeltaCount }) };
}

function textMsg(role, text) {
  return { role, content: [{ type: 'text', text }] };
}

describe('Plan C eager-update race regression', () => {
  it('eager update fires Plan C when 2nd request starts before 1st response completes', () => {
    const sim = makeRaceSimulator({ eagerUpdate: true });
    // Bootstrap: 已有 2 条 message
    const base = [textMsg('user', 'real-input'), textMsg('assistant', 'response')];
    sim.startRequest(base).commit();

    // Request A: 追加 SUGGESTION MODE marker，长度 2 → 3（合法 append，不触发 Plan C）
    const withSuggestion = [...base, textMsg('user', '[SUGGESTION MODE: ...]')];
    const reqA = sim.startRequest(withSuggestion);
    assert.strictEqual(reqA.isCheckpoint, false, 'A 是正常 append，不该 checkpoint');
    assert.strictEqual(reqA.inPlaceReplace, false);
    // A 的流式响应还没完成 → A.commit() 暂不调用

    // Request B: 30ms 后，SUGGESTION 被替换为 teammate 终止事件，长度仍 3
    const withTeammateEv = [...base, textMsg('user', '<teammate-message>system terminated</teammate-message>')];
    const reqB = sim.startRequest(withTeammateEv);
    // 关键断言：eager update 模式下，B 看到 A 的 eager 状态（lastCount=3, lastFp=fp(SUGGESTION)）
    //          → 长度同（3==3）+ fp 异 → Plan C 命中 ✅
    assert.strictEqual(reqB.isCheckpoint, true, 'B 应该 checkpoint（in-place replace）');
    assert.strictEqual(reqB.inPlaceReplace, true, 'B 应该带 _inPlaceReplaceDetected:true');

    // 后续 commit（实际数秒后）不应破坏状态
    reqA.commit();
    reqB.commit();
    const finalState = sim.getState();
    assert.strictEqual(finalState._lastMessagesCount, 3);
  });

  it('without eager update (control) Plan C MISSES the race — this is the original bug', () => {
    const sim = makeRaceSimulator({ eagerUpdate: false });
    const base = [textMsg('user', 'real-input'), textMsg('assistant', 'response')];
    sim.startRequest(base).commit();

    const withSuggestion = [...base, textMsg('user', '[SUGGESTION MODE: ...]')];
    const reqA = sim.startRequest(withSuggestion);
    assert.strictEqual(reqA.isCheckpoint, false, 'A 不该 checkpoint');
    // A 的 commit 故意不调用，模拟 LLM 流式响应未完成

    const withTeammateEv = [...base, textMsg('user', '<teammate-message>system terminated</teammate-message>')];
    const reqB = sim.startRequest(withTeammateEv);
    // 旧行为：B 看到 lastCount=2（base 的 commit 值，A 的 commit 未跑），
    //        Plan C 检查 3==2 失败 → 漏检 → 客户端走 mergeMainAgentSessions → doubled-history
    assert.strictEqual(reqB.inPlaceReplace, false, '旧行为下 Plan C 必须漏检（这是 BUG）');
    assert.strictEqual(reqB.isCheckpoint, false, '旧行为下 B 走 delta 路径，不写 checkpoint');
  });

  it('eager + sequential (no race): Plan C still fires for normal in-place replace', () => {
    const sim = makeRaceSimulator({ eagerUpdate: true });
    const base = [textMsg('user', 'real-input'), textMsg('assistant', 'response')];
    sim.startRequest(base).commit();
    sim.startRequest([...base, textMsg('user', '[SUGGESTION]')]).commit(); // baseline 增到 3
    // 现在 in-place replace 末位
    const reqB = sim.startRequest([...base, textMsg('user', '<real-user-input>')]);
    assert.strictEqual(reqB.isCheckpoint, true);
    assert.strictEqual(reqB.inPlaceReplace, true);
    reqB.commit();
  });

  it('eager + 3 路并发：A append → B replace → C 再 replace，B 和 C 都应命中', () => {
    const sim = makeRaceSimulator({ eagerUpdate: true });
    const base = [textMsg('user', 'm1'), textMsg('assistant', 'r1')];
    sim.startRequest(base).commit();

    // A: append → len 2→3（合法 append）
    const reqA = sim.startRequest([...base, textMsg('user', '[SUGGESTION]')]);
    assert.strictEqual(reqA.inPlaceReplace, false, 'A 是 append');

    // B: 替换 A 的末位（len 3 不变，fp 异）
    const reqB = sim.startRequest([...base, textMsg('user', '<teammate-msg-1>')]);
    assert.strictEqual(reqB.inPlaceReplace, true, 'B 替换 A 的末位');

    // C: 再次替换（len 3 不变，fp 再次异）
    const reqC = sim.startRequest([...base, textMsg('user', '<teammate-msg-2>')]);
    assert.strictEqual(reqC.inPlaceReplace, true, 'C 替换 B 的末位');

    // 全部 commit 后状态正确
    reqA.commit(); reqB.commit(); reqC.commit();
    assert.strictEqual(sim.getState()._lastMessagesCount, 3);
  });

  it('eager update 在请求失败场景下不会永久错位（下个成功请求覆盖）', () => {
    const sim = makeRaceSimulator({ eagerUpdate: true });
    const base = [textMsg('user', 'm1'), textMsg('assistant', 'r1')];
    sim.startRequest(base).commit();

    // 失败请求：startRequest 已 eager update，但永远不调用 commit
    sim.startRequest([...base, textMsg('user', '[FAILED-SUGGESTION]')]);
    // 状态已被 eager 推到 len=3, fp=fp(FAILED-SUGGESTION)

    // 下一个真实请求的内容是基于 base+[real-input]，长度也是 3
    const real = sim.startRequest([...base, textMsg('user', '<real-input>')]);
    // 检测命中（这是 acceptable false-positive：客户端 helper 用 lastSession 校验，
    // lastSession 反映 committed 态而不是 eager 态，校验失败会 fallback 到 mergeMainAgentSessions
    // → 不会损坏数据，最差情况是多写一个 checkpoint，无害）
    assert.strictEqual(real.inPlaceReplace, true, '失败请求的 eager 残留会让下条请求误命中（acceptable）');
  });

  it('commit reorder: A 流式后 commit、B 短先 commit —— guard 防止 _lastMessagesCount 倒推', () => {
    // 场景：A 流式响应数秒在飞 → B 30ms 后 fire → B 短先 commit → A 后 commit
    // 旧实现（commitGuardEnabled=false）会让 A.commit 把 _lastMessagesCount 倒推回 A.length，
    // 下条 C 拿陈旧 prev → Plan C delta 多算 1 条 → 客户端 doubled-history。
    const sim = makeRaceSimulator({ eagerUpdate: true, commitGuardEnabled: true });
    const base = [textMsg('user', 'm1'), textMsg('assistant', 'r1')];
    sim.startRequest(base).commit();

    // A: 长度 2→3（append）
    const reqA = sim.startRequest([...base, textMsg('user', 'a3')]);
    assert.strictEqual(reqA.isCheckpoint, false, 'A 是正常 append');
    // B: 30ms 后，长度 3→4（基于 A.length eager 后看到的 prev=3）
    const reqB = sim.startRequest([...base, textMsg('user', 'a3'), textMsg('assistant', 'b4')]);
    assert.strictEqual(reqB.prevMessagesCount, 3, 'B snapshot 拿到 A eager 后的 prev=3');
    assert.strictEqual(reqB.isCheckpoint, false, 'B 是 append（3→4）');

    // 乱序 commit：B 先到、A 后到
    reqB.commit();
    assert.strictEqual(sim.getState()._lastMessagesCount, 4, 'B commit 后 state=4');
    reqA.commit();
    assert.strictEqual(sim.getState()._lastMessagesCount, 4, 'guard 阻止 A.commit 倒推回 3');

    // C: 长度 4→5
    const reqC = sim.startRequest([...base, textMsg('user', 'a3'), textMsg('assistant', 'b4'), textMsg('user', 'c5')]);
    assert.strictEqual(reqC.prevMessagesCount, 4, 'C 拿到正确 prev=4，不被 A.commit 倒推影响');
    assert.strictEqual(reqC.deltaLength, 1, 'C delta 只算 1 条新增（不多算 B 那条）');
  });

  it('commit reorder control: 无 guard 时 _lastMessagesCount 被倒推，C delta 多算（实证 BUG）', () => {
    // 实证生产代码 1.6.251 - 本轮修复之间的残余 BUG：commit 无 guard 时 A 后到 commit 会倒推。
    const sim = makeRaceSimulator({ eagerUpdate: true, commitGuardEnabled: false });
    const base = [textMsg('user', 'm1'), textMsg('assistant', 'r1')];
    sim.startRequest(base).commit();

    const reqA = sim.startRequest([...base, textMsg('user', 'a3')]);
    const reqB = sim.startRequest([...base, textMsg('user', 'a3'), textMsg('assistant', 'b4')]);

    reqB.commit();
    assert.strictEqual(sim.getState()._lastMessagesCount, 4);
    reqA.commit();
    assert.strictEqual(sim.getState()._lastMessagesCount, 3, '无 guard 时 A.commit 把 state 倒推回 3（BUG）');

    const reqC = sim.startRequest([...base, textMsg('user', 'a3'), textMsg('assistant', 'b4'), textMsg('user', 'c5')]);
    assert.strictEqual(reqC.prevMessagesCount, 3, '无 guard 时 C 看到陈旧 prev=3');
    assert.strictEqual(reqC.deltaLength, 2, '无 guard 时 C delta 多算到 2 条（B 那条 + C 新增）→ 客户端 doubled-history');
  });

  it('commit reorder: in-place replace 同长度时 A 后到 commit —— guard 防止 _lastTailFp 倒推', () => {
    // 场景：A.length=N, fp=fpA → B in-place replace 同长 fp=fpB（Plan C 命中）→ B 先 commit、A 后 commit。
    // 旧实现无 guard 时 A.commit 把 _lastTailFp 倒推回 fpA，下条 C 的 in-place replace 检测会被陈旧 fp 干扰。
    const sim = makeRaceSimulator({ eagerUpdate: true, commitGuardEnabled: true });
    const base = [textMsg('user', 'm1'), textMsg('assistant', 'r1')];
    sim.startRequest(base).commit();
    sim.startRequest([...base, textMsg('user', '[SUGGESTION]')]).commit(); // baseline=3, fp=fp(SUGGESTION)

    // A: in-place replace [SUGGESTION] → fpA
    const reqA = sim.startRequest([...base, textMsg('user', '<teammate-msg-A>')]);
    assert.strictEqual(reqA.inPlaceReplace, true, 'A 替换 SUGGESTION 末位');
    // B: 再次 in-place replace，看到 A eager 后的 prev fp=fpA → 与 fpB 不同 → 命中
    const reqB = sim.startRequest([...base, textMsg('user', '<teammate-msg-B>')]);
    assert.strictEqual(reqB.inPlaceReplace, true, 'B 再次替换末位（看到 A 的 eager fp）');

    // 乱序 commit：B 先到、A 后到
    reqB.commit();
    reqA.commit();
    // guard 让 A.commit 在等长（=== 不严格大于）时整体 no-op，fp 不被倒推
    assert.notStrictEqual(sim.getState()._lastTailFp, '', '_lastTailFp 不为空');

    // C: 再次 in-place replace，应看到 B 的 fp（不是 A 的 fp）
    const reqC = sim.startRequest([...base, textMsg('user', '<teammate-msg-C>')]);
    assert.strictEqual(reqC.prevTailFp, fingerprintMsg(textMsg('user', '<teammate-msg-B>')), 'C 看到 B 的 fp，未被 A.commit 倒推干扰');
    assert.strictEqual(reqC.inPlaceReplace, true, 'C 命中 in-place replace');
  });

  it('commit-only fallback: eager 块未跑时 commit 路径仍能把 state 从 0 推到 N（guard 不阻塞首推）', () => {
    // 假想场景：未来某次重构关掉 eager（eagerUpdate=false），_lastMessagesCount 一直停在 0；
    // commit 路径必须能完成首次状态更新（0 → N），否则 Plan C 永远拿不到正确 prev。
    // 当前 production 代码 eager + commit 并列，本 case 锁住"commit 不依赖 eager 也能推状态"语义。
    const sim = makeRaceSimulator({ eagerUpdate: false, commitGuardEnabled: true });
    const base = [textMsg('user', 'm1'), textMsg('assistant', 'r1')];
    const req1 = sim.startRequest(base);
    assert.strictEqual(sim.getState()._lastMessagesCount, 0, 'eager 关闭时 startRequest 不推 state');
    req1.commit();
    assert.strictEqual(sim.getState()._lastMessagesCount, 2, 'commit 把 state 从 0 推到 2（guard 不阻塞首推）');

    // 继续推进：commit 单调增长
    sim.startRequest([...base, textMsg('user', 'm3')]).commit();
    assert.strictEqual(sim.getState()._lastMessagesCount, 3);
  });

  it('commit reorder 3 路并发: C 先 commit、A 中、B 后 —— guard 保持 _lastMessagesCount 单调', () => {
    // 三路并发：A.len=3 → B.len=4 → C.len=5 在飞，commit 顺序乱：C → A → B。
    // 期望：每个 commit 只在 originalLength > 当前 state 时才更新，state 单调到 5 不回退。
    const sim = makeRaceSimulator({ eagerUpdate: true, commitGuardEnabled: true });
    const base = [textMsg('user', 'm1'), textMsg('assistant', 'r1')];
    sim.startRequest(base).commit();

    const reqA = sim.startRequest([...base, textMsg('user', 'a3')]);
    const reqB = sim.startRequest([...base, textMsg('user', 'a3'), textMsg('assistant', 'b4')]);
    const reqC = sim.startRequest([...base, textMsg('user', 'a3'), textMsg('assistant', 'b4'), textMsg('user', 'c5')]);
    assert.strictEqual(sim.getState()._lastMessagesCount, 5, 'eager 把 state 推到 5');

    // 乱序 commit：C → A → B
    reqC.commit();
    assert.strictEqual(sim.getState()._lastMessagesCount, 5);
    reqA.commit();
    assert.strictEqual(sim.getState()._lastMessagesCount, 5, 'A.commit(3) 被 guard 阻断，state 不回退到 3');
    reqB.commit();
    assert.strictEqual(sim.getState()._lastMessagesCount, 5, 'B.commit(4) 被 guard 阻断，state 不回退到 4');

    // 下一个新请求 D 拿到 prev=5
    const reqD = sim.startRequest([...base, textMsg('user', 'a3'), textMsg('assistant', 'b4'), textMsg('user', 'c5'), textMsg('assistant', 'd6')]);
    assert.strictEqual(reqD.prevMessagesCount, 5, 'D 拿到正确 prev=5');
    assert.strictEqual(reqD.deltaLength, 1, 'D delta 只算 1 条新增');
  });

  it('startRequest 穿插 commit reorder: 后来 startRequest 看到 eager 态，不被先到 commit 倒推', () => {
    // 时序：A.start → B.start → B.commit → D.start（看到 B.eager） → A.commit → D 不被 A 倒推。
    // 这是 reorder + eager 双机制串联场景：startRequest 与 commit 在时间轴上交错。
    const sim = makeRaceSimulator({ eagerUpdate: true, commitGuardEnabled: true });
    const base = [textMsg('user', 'm1'), textMsg('assistant', 'r1')];
    sim.startRequest(base).commit();

    const reqA = sim.startRequest([...base, textMsg('user', 'a3')]);
    const reqB = sim.startRequest([...base, textMsg('user', 'a3'), textMsg('assistant', 'b4')]);
    reqB.commit();
    assert.strictEqual(sim.getState()._lastMessagesCount, 4);

    // D 在 B.commit 之后、A.commit 之前发起：看到 prev=4（B 的 eager）
    const reqD = sim.startRequest([...base, textMsg('user', 'a3'), textMsg('assistant', 'b4'), textMsg('user', 'd5')]);
    assert.strictEqual(reqD.prevMessagesCount, 4, 'D 看到 B 的 eager 推上去的 prev=4');

    // A 后到 commit —— guard 阻止倒推
    reqA.commit();
    assert.strictEqual(sim.getState()._lastMessagesCount, 5, 'A.commit 之后 state 仍 = 5（D eager），未被 A.commit(3) 倒推');

    // D.commit 后续
    reqD.commit();
    assert.strictEqual(sim.getState()._lastMessagesCount, 5);
  });
});
