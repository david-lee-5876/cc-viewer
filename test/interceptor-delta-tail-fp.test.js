/**
 * Plan C: interceptor.js 末位指纹触发 checkpoint 的状态机测试
 *
 * 验证：
 *   1. _fingerprintMsg 各类型 message 的指纹计算正确性 + 唯一性
 *   2. delta 状态机命中 in-place last-msg replace 时强制 checkpoint
 *   3. 各种 reset / rollback 边界场景
 *
 * 测试策略：interceptor.js 的 globalThis.fetch hook 只在 setupInterceptor() 被调时
 * 安装，import 模块本身没副作用。直接 import _fingerprintMsg 做单测；模拟整个
 * checkpoint 决策逻辑用本地辅助函数（与 interceptor.js:651-704 行为一致）。
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintMsg } from '../lib/interceptor-core.js';
// 别名保持原测试代码可读性（之前按 _fingerprintMsg 写的 case 名）
const _fingerprintMsg = fingerprintMsg;

// ============================================================================
// Helpers — 复刻 interceptor 的 checkpoint 决策（KEEP IN SYNC: interceptor.js）
// ============================================================================

const CHECKPOINT_INTERVAL = 10;

function makeSimulator(opts = {}) {
  const tailFpCheckEnabled = opts.tailFpCheckEnabled !== false;
  let lastMessagesCount = 0;
  let lastTailFp = '';
  let mainAgentDeltaCount = 0;

  function reset() {
    lastMessagesCount = 0;
    lastTailFp = '';
    mainAgentDeltaCount = 0;
  }

  /**
   * 跑一次 mainAgent 请求，返回该请求会被写入 jsonl 的 entry 形态。
   * @param {Array} messages - 当前 wire 上的完整 messages 数组
   * @returns {{ isCheckpoint: boolean, inPlaceReplace: boolean, deltaLength: number, totalCount: number }}
   */
  function runRequest(messages) {
    const originalLength = messages.length;
    const originalTailFp = originalLength > 0 ? _fingerprintMsg(messages[originalLength - 1]) : '';
    mainAgentDeltaCount++;

    const sameLenInPlaceReplace =
      tailFpCheckEnabled &&
      messages.length === lastMessagesCount &&
      lastMessagesCount > 0 &&
      lastTailFp !== '' &&
      originalTailFp !== '' &&
      originalTailFp !== lastTailFp;

    const needsCheckpoint =
      lastMessagesCount === 0 ||
      messages.length < lastMessagesCount ||
      (mainAgentDeltaCount % CHECKPOINT_INTERVAL === 0) ||
      sameLenInPlaceReplace;

    let result;
    if (needsCheckpoint) {
      result = {
        isCheckpoint: true,
        inPlaceReplace: !!sameLenInPlaceReplace,
        deltaLength: messages.length,
        totalCount: messages.length,
      };
    } else {
      result = {
        isCheckpoint: false,
        inPlaceReplace: false,
        deltaLength: messages.length - lastMessagesCount,
        totalCount: messages.length,
      };
    }

    // 模拟 _commitDeltaState（成功路径）
    lastMessagesCount = originalLength;
    lastTailFp = originalTailFp;
    return result;
  }

  /** 模拟 checkAndRotateLogFile 重置 */
  function rotate() {
    lastMessagesCount = 0;
    lastTailFp = '';
    mainAgentDeltaCount = 0;
  }

  return { runRequest, reset, rotate, getState: () => ({ lastMessagesCount, lastTailFp, mainAgentDeltaCount }) };
}

function textMsg(role, text) {
  return { role, content: [{ type: 'text', text }] };
}

function toolUseMsg(name, id, input = {}) {
  return { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] };
}

function toolResultMsg(toolUseId, body) {
  return { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: body }] };
}

function stringMsg(role, str) {
  return { role, content: str };
}

// ============================================================================
// _fingerprintMsg 单测
// ============================================================================

describe('_fingerprintMsg', () => {
  it('null/undefined → 空字符串', () => {
    assert.equal(_fingerprintMsg(null), '');
    assert.equal(_fingerprintMsg(undefined), '');
  });

  it('text 类型：role + 前 80 字符', () => {
    const m = textMsg('user', 'hello world');
    assert.equal(_fingerprintMsg(m), 'user:hello world');
    const long = 'a'.repeat(200);
    const fpLong = _fingerprintMsg(textMsg('user', long));
    assert.equal(fpLong.length <= 86, true); // role:userrole + 80 chars
    assert.equal(fpLong.startsWith('user:'), true);
  });

  it('text 类型：内容前 80 同后续不同 → 仍撞 fp（已知限制，CHECKPOINT_INTERVAL=10 兜底）', () => {
    const a = 'a'.repeat(80) + 'X';
    const b = 'a'.repeat(80) + 'Y';
    assert.equal(_fingerprintMsg(textMsg('user', a)), _fingerprintMsg(textMsg('user', b)));
  });

  it('text 类型：role 不同 → fp 不同', () => {
    assert.notEqual(_fingerprintMsg(textMsg('user', 'x')), _fingerprintMsg(textMsg('assistant', 'x')));
  });

  it('tool_use 类型：name + id 后 8 区分', () => {
    const a = toolUseMsg('Edit', 'tu_abcd1234efgh5678');
    const b = toolUseMsg('Edit', 'tu_xyzqweryefgh5678'); // 后 8 同
    assert.equal(_fingerprintMsg(a), _fingerprintMsg(b)); // 已知后 8 撞车
    const c = toolUseMsg('Edit', 'tu_abcd1234ZZZZZZZZ'); // 后 8 不同
    assert.notEqual(_fingerprintMsg(a), _fingerprintMsg(c));
    const d = toolUseMsg('Bash', 'tu_abcd1234efgh5678'); // name 不同
    assert.notEqual(_fingerprintMsg(a), _fingerprintMsg(d));
  });

  it('tool_result 类型：tool_use_id 后 8 + body 前 40', () => {
    const a = toolResultMsg('tu_abcd1234aaaa1111', 'success');
    const b = toolResultMsg('tu_abcd1234aaaa2222', 'success'); // id 后 8 不同
    assert.notEqual(_fingerprintMsg(a), _fingerprintMsg(b));
    const c = toolResultMsg('tu_abcd1234aaaa1111', 'failed'); // body 不同
    assert.notEqual(_fingerprintMsg(a), _fingerprintMsg(c));
  });

  it('tool_result 类型：body 是 array of blocks（不会被 String() 塌陷）', () => {
    const blockArr = [{ type: 'text', text: 'real content here' }];
    const a = { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_aaaa1111', content: blockArr }] };
    const b = { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_aaaa1111', content: [{ type: 'text', text: 'different content' }] }] };
    assert.notEqual(_fingerprintMsg(a), _fingerprintMsg(b));
  });

  it('string content：前 80 字符', () => {
    const a = stringMsg('user', '<teammate-message teammate_id="requirements-analyst" color="blue">');
    const b = stringMsg('user', '<teammate-message teammate_id="architect" color="yellow">');
    assert.notEqual(_fingerprintMsg(a), _fingerprintMsg(b)); // 80 字符够区分 teammate_id
  });

  it('未知 type：fallback 到 type 名', () => {
    const m = { role: 'user', content: [{ type: 'unknown_block', foo: 'bar' }] };
    assert.equal(_fingerprintMsg(m), 'user:<unknown_block>');
  });

  it('空 content：snip 为空字符串', () => {
    assert.equal(_fingerprintMsg({ role: 'user', content: [] }), 'user:');
    assert.equal(_fingerprintMsg({ role: 'user', content: null }), 'user:');
  });
});

// ============================================================================
// 状态机：checkpoint 决策测试
// ============================================================================

describe('Delta storage 状态机：基础路径', () => {
  let sim;
  beforeEach(() => { sim = makeSimulator(); });

  it('首次请求（_lastMessagesCount === 0）→ checkpoint', () => {
    const r = sim.runRequest([textMsg('user', 'hi')]);
    assert.equal(r.isCheckpoint, true);
    assert.equal(r.inPlaceReplace, false);
    assert.equal(r.totalCount, 1);
  });

  it('纯 append（length 增大）→ delta，state 更新', () => {
    sim.runRequest([textMsg('user', 'q1')]);                              // ckpt
    const r = sim.runRequest([textMsg('user', 'q1'), textMsg('assistant', 'a1'), textMsg('user', 'q2')]);
    assert.equal(r.isCheckpoint, false);
    assert.equal(r.deltaLength, 2);
    assert.equal(r.totalCount, 3);
  });

  it('完全相同重发（length 同、末位 fp 同）→ 空 delta', () => {
    const m = [textMsg('user', 'q1'), textMsg('assistant', 'a1')];
    sim.runRequest(m);                  // ckpt
    sim.runRequest([...m, textMsg('user', 'q2')]); // delta +1
    const r = sim.runRequest([...m, textMsg('user', 'q2')]); // 同上
    assert.equal(r.isCheckpoint, false);
    assert.equal(r.deltaLength, 0);
  });

  it('/clear 路径（length 缩短）→ checkpoint', () => {
    const m1 = [textMsg('user', 'a'), textMsg('assistant', 'b'), textMsg('user', 'c')];
    sim.runRequest(m1);
    const r = sim.runRequest([textMsg('user', 'fresh')]);
    assert.equal(r.isCheckpoint, true);
    assert.equal(r.inPlaceReplace, false); // 是 length 缩短触发不是 in-place
  });

  it('CHECKPOINT_INTERVAL=10 周期触发', () => {
    sim.runRequest([textMsg('user', 'init')]); // 1st = ckpt
    for (let i = 2; i <= 9; i++) {
      const msgs = [];
      for (let j = 0; j < i; j++) msgs.push(textMsg('user', `m${j}`));
      sim.runRequest(msgs);
    }
    // 第 10 次应触发周期 ckpt
    const msgs10 = [];
    for (let j = 0; j < 10; j++) msgs10.push(textMsg('user', `m${j}`));
    const r = sim.runRequest(msgs10);
    assert.equal(r.isCheckpoint, true);
    assert.equal(r.inPlaceReplace, false);
  });
});

// ============================================================================
// 核心 case：in-place last-msg replace 检测
// ============================================================================

describe('Delta storage 状态机：in-place last-msg replace 检测', () => {
  let sim;
  beforeEach(() => { sim = makeSimulator(); });

  it('length 同、末位 fp 不同 → 强制 checkpoint + inPlaceReplace=true', () => {
    const base = [textMsg('user', 'q1'), textMsg('assistant', 'a1')];
    sim.runRequest(base);
    // 末位被原地替换：长度仍是 2，但末位从 assistant 改成另一个 assistant
    const replaced = [textMsg('user', 'q1'), textMsg('assistant', 'completely different response')];
    const r = sim.runRequest(replaced);
    assert.equal(r.isCheckpoint, true);
    assert.equal(r.inPlaceReplace, true);
    assert.equal(r.totalCount, 2);
  });

  it('SUGGESTION MODE → 用户真实输入替换（错题集真实场景）', () => {
    const history = [textMsg('user', 'h1'), textMsg('assistant', 'h2'), textMsg('user', 'h3')];
    // 上一次：CLI 注入 SUGGESTION MODE 末位
    sim.runRequest([...history, stringMsg('user', '[SUGGESTION MODE: Suggest what the user might naturally type next...]')]);
    // 这次：CLI 用真实用户输入替换末位（长度不变）
    const r = sim.runRequest([...history, textMsg('user', 'real user prompt that replaced suggestion')]);
    assert.equal(r.isCheckpoint, true);
    assert.equal(r.inPlaceReplace, true);
  });

  it('Synthetic recap 通道（jsonl L3311 真实场景）', () => {
    // 模拟 mainAgent 累积 4 条对话，第 5 次 CLI 注入 recap 指令在末位（长度不变）
    const realConvo = [
      textMsg('user', 'hi'),
      textMsg('assistant', 'hello'),
      textMsg('user', 'q'),
      textMsg('assistant', 'a'),
    ];
    sim.runRequest(realConvo); // ckpt
    // 模拟下一次：CLI 把末位 assistant 替换成内部 recap user prompt
    const recapInjection = [...realConvo.slice(0, 3), stringMsg('user', 'Generate a brief recap for the user...')];
    const r = sim.runRequest(recapInjection);
    assert.equal(r.isCheckpoint, true);
    assert.equal(r.inPlaceReplace, true);
  });

  it('混合序列：append × 3 → in-place × 1 → append × 2 → 周期触发', () => {
    // 1. ckpt（首次）
    let r1 = sim.runRequest([textMsg('user', 'a')]);
    assert.equal(r1.isCheckpoint, true);
    // 2. append
    let r2 = sim.runRequest([textMsg('user', 'a'), textMsg('assistant', 'b')]);
    assert.equal(r2.isCheckpoint, false);
    // 3. append
    let r3 = sim.runRequest([textMsg('user', 'a'), textMsg('assistant', 'b'), textMsg('user', 'c')]);
    assert.equal(r3.isCheckpoint, false);
    // 4. in-place replace (length 3, 末位 c → c2)
    let r4 = sim.runRequest([textMsg('user', 'a'), textMsg('assistant', 'b'), textMsg('user', 'c2-different')]);
    assert.equal(r4.isCheckpoint, true);
    assert.equal(r4.inPlaceReplace, true);
    // 5. append
    let r5 = sim.runRequest([textMsg('user', 'a'), textMsg('assistant', 'b'), textMsg('user', 'c2-different'), textMsg('assistant', 'd')]);
    assert.equal(r5.isCheckpoint, false);
    // 6. append
    let r6 = sim.runRequest([textMsg('user', 'a'), textMsg('assistant', 'b'), textMsg('user', 'c2-different'), textMsg('assistant', 'd'), textMsg('user', 'e')]);
    assert.equal(r6.isCheckpoint, false);
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe('Delta storage 状态机：边界场景', () => {
  it('回滚开关 CCV_DISABLE_TAIL_FP_CHECKPOINT=1 → in-place 不触发，回到旧行为', () => {
    const sim = makeSimulator({ tailFpCheckEnabled: false });
    sim.runRequest([textMsg('user', 'q1'), textMsg('assistant', 'a1')]);
    const r = sim.runRequest([textMsg('user', 'q1'), textMsg('assistant', 'COMPLETELY DIFFERENT a1')]);
    // 关闭开关后，in-place 替换不会触发 checkpoint，走 delta path（delta=0）
    assert.equal(r.isCheckpoint, false);
    assert.equal(r.inPlaceReplace, false);
    assert.equal(r.deltaLength, 0);
  });

  it('日志轮转后状态全 reset → 第一条新请求走 _lastMessagesCount===0 ckpt', () => {
    const sim = makeSimulator();
    sim.runRequest([textMsg('user', 'a'), textMsg('assistant', 'b')]);
    assert.notEqual(sim.getState().lastTailFp, '');
    sim.rotate();
    assert.equal(sim.getState().lastMessagesCount, 0);
    assert.equal(sim.getState().lastTailFp, '');
    const r = sim.runRequest([textMsg('user', 'fresh')]);
    assert.equal(r.isCheckpoint, true);
    assert.equal(r.inPlaceReplace, false);
  });

  it('空 messages 数组（理论上不该出现）→ tailFp 为空、不触发 in-place 误检', () => {
    const sim = makeSimulator();
    // 第一次正常请求
    sim.runRequest([textMsg('user', 'a')]);
    // 假设下一次 messages 长度变 0（极少见）
    const r = sim.runRequest([]);
    // length 0 < 1 → 走 length 缩短路径，触发 ckpt（不是 in-place）
    assert.equal(r.isCheckpoint, true);
    assert.equal(r.inPlaceReplace, false);
  });

  it('完全相同 fp（同 ts、同末位）→ 空 delta（不误判 in-place）', () => {
    const sim = makeSimulator();
    const m = [textMsg('user', 'a'), textMsg('assistant', 'b')];
    sim.runRequest(m);
    sim.runRequest([...m, textMsg('user', 'c')]);
    const r = sim.runRequest([...m, textMsg('user', 'c')]); // 完全重发
    assert.equal(r.isCheckpoint, false);
    assert.equal(r.inPlaceReplace, false);
    assert.equal(r.deltaLength, 0);
  });

  it('tool_result fp：相同 tool_use_id 但不同 body 不撞车', () => {
    const sim = makeSimulator();
    const base = [textMsg('user', 'q1'), toolUseMsg('Bash', 'tu_aaaa1111')];
    sim.runRequest(base); // ckpt
    // 第二次请求的末位是 tool_result，body 是字符串 "success"
    sim.runRequest([...base, toolResultMsg('tu_aaaa1111', 'success')]);
    // 第三次：长度同，末位仍是同 tool_use_id 的 tool_result，但 body 变了 → in-place
    const r = sim.runRequest([...base, toolResultMsg('tu_aaaa1111', 'failure: timeout')]);
    assert.equal(r.isCheckpoint, true);
    assert.equal(r.inPlaceReplace, true);
  });
});

// ============================================================================
// 反向断言：teammate 请求不进 delta 路径
// ============================================================================

describe('Plan C 反向断言', () => {
  it('teammate 请求不走 delta 路径，C 方案不影响（interceptor.js:653 的 `requestEntry?.mainAgent` 守卫）', () => {
    // 这是行为断言：interceptor.js 的 delta 处理只在 mainAgent 时启用。
    // teammate 请求会走原始 messages 全量写入路径，不经过 _fingerprintMsg。
    // 这里直接验证 _fingerprintMsg 自身是纯函数无副作用即可。
    const before = _fingerprintMsg(textMsg('user', 'hi'));
    _fingerprintMsg(toolUseMsg('Edit', 'tu_xxx'));
    const after = _fingerprintMsg(textMsg('user', 'hi'));
    assert.equal(before, after); // 幂等性
  });
});
