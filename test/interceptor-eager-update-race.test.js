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
import { fingerprintMsg } from '../lib/interceptor-core.js';

const CHECKPOINT_INTERVAL = 10;

function makeRaceSimulator({ eagerUpdate = true, tailFpCheckEnabled = true } = {}) {
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
      // 模拟响应完成后的 _commitDeltaState（与 interceptor.js:_commitDeltaState 对齐：
      // `originalLength > _lastMessagesCount` 才更新）。eager 模式下 originalLength === _lastMessagesCount
      // 直接 no-op；旧模式（control case）下 commit 才是真正的状态更新点。
      commit: () => {
        if (originalLength > 0 && originalLength > _lastMessagesCount) {
          _lastMessagesCount = originalLength;
          if (originalTailFp !== '') _lastTailFp = originalTailFp;
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
});
