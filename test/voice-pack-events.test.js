// Regression net: lock the EVENT_KEYS set in place so any future "let's add timeoutWarning
// back" PR fails CI loudly instead of silently reactivating events that have no UI hook
// (倒计时已 24h 实质无超时，AskTimeoutCountdown isInfiniteTimeout return null 不再触发预警).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_KEYS, DEFAULT_BINDINGS } from '../lib/voice-pack-events.js';

describe('voice-pack-events.js EVENT_KEYS 不变量', () => {
  it('当前 EVENT_KEYS 锁定为 3 项 (planApproval / askQuestion / turnEnd)', () => {
    assert.equal(EVENT_KEYS.length, 3, `EVENT_KEYS 长度必须为 3，实测 ${EVENT_KEYS.length}: ${EVENT_KEYS.join(',')}`);
    assert.deepEqual(
      [...EVENT_KEYS].sort(),
      ['askQuestion', 'planApproval', 'turnEnd'],
      'EVENT_KEYS 内容必须严格匹配（防 typo / 误增 / 误删）',
    );
  });

  it('timeoutWarning5min / timeoutWarning60s 已彻底剔除（防回滚）', () => {
    assert.ok(!EVENT_KEYS.includes('timeoutWarning5min'),
      'timeoutWarning5min 已删除（24h 无超时后无意义），不应回滚到 EVENT_KEYS');
    assert.ok(!EVENT_KEYS.includes('timeoutWarning60s'),
      'timeoutWarning60s 已删除（24h 无超时后无意义），不应回滚到 EVENT_KEYS');
  });

  it('DEFAULT_BINDINGS 与 EVENT_KEYS 一一对应（防 schema 漂移）', () => {
    const bindingKeys = Object.keys(DEFAULT_BINDINGS).sort();
    const eventKeys = [...EVENT_KEYS].sort();
    assert.deepEqual(bindingKeys, eventKeys,
      'DEFAULT_BINDINGS 的 keys 必须与 EVENT_KEYS 严格一致（任一处漏改都会让用户绑定/默认值不一致）');
  });

  it('DEFAULT_BINDINGS 值合法（"default" 或 null）', () => {
    for (const [key, val] of Object.entries(DEFAULT_BINDINGS)) {
      assert.ok(
        val === 'default' || val === null,
        `DEFAULT_BINDINGS.${key} = ${JSON.stringify(val)} 非法（仅允许 "default" 或 null）`,
      );
    }
  });
});
