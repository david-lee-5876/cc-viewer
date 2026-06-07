// server/lib/pty-flood-coalescer.js 单测：直通零延迟 / 阈值进限流 / 合并+单对 SYNC 重包裹 /
// pendingCap 截断走 findSafeSliceStart 且 2026 永远配对 / 连续 fallbackWins 桶回落 /
// flush 后 pending 必清（含下游 send 抛错跳发）/ reset / dispose。全程注入时钟驱动，零真实定时器。
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFloodCoalescer } from '../server/lib/pty-flood-coalescer.js';
import { findSafeSliceStart } from '../server/pty-manager.js';

const SYNC_BEGIN = '\x1b[?2026h';
const SYNC_END = '\x1b[?2026l';

/** 注入式假时钟：手动 fire 到期回调，断言 timer 生命周期 */
function makeFakeClock() {
  let nextId = 1;
  const timers = new Map();
  return {
    setTimer(fn, ms) {
      const id = nextId++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimer(id) { timers.delete(id); },
    /** 触发所有当前已排程的 timer（触发前先取出，模拟一次 tick） */
    tick() {
      const due = [...timers.entries()];
      timers.clear();
      for (const [, t] of due) t.fn();
    },
    count() { return timers.size; },
  };
}

function makeHarness(opts = {}) {
  const sent = [];
  const clock = makeFakeClock();
  const events = [];
  const c = createFloodCoalescer({
    send: opts.send || ((d) => sent.push(d)),
    findSafeSliceStart,
    onFloodStart: (b) => events.push(['start', b]),
    onFloodEnd: () => events.push(['end']),
    flushMs: 33,
    floodThresholdBytesPerWin: 100,
    fallbackWins: 3,
    pendingCap: 400,
    trimTo: 200,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    ...opts.overrides,
  });
  return { c, sent, clock, events };
}

describe('pty-flood-coalescer', () => {
  let h;
  beforeEach(() => { h = makeHarness(); });

  it('直通态：低于阈值的 chunk 立即原样发出，零延迟', () => {
    h.c.offer('hello');
    h.c.offer('world');
    assert.deepEqual(h.sent, ['hello', 'world']);
    assert.equal(h.c.isFlooding(), false);
    assert.deepEqual(h.events, []);
  });

  it('直通态桶边界 timer 到点清零计数，分散流量不会累计触发限流', () => {
    h.c.offer('x'.repeat(60));   // 桶内 60 < 100，直通
    h.clock.tick();              // 桶边界：计数清零
    h.c.offer('x'.repeat(60));   // 新桶 60 < 100，仍直通
    assert.equal(h.sent.length, 2);
    assert.equal(h.c.isFlooding(), false);
  });

  it('单桶累计超阈值 → 进入限流态，压垮桶的 chunk 进 pending 不直发', () => {
    h.c.offer('x'.repeat(60));   // 直通
    h.c.offer('y'.repeat(60));   // 60+60=120 > 100 → 限流，本条进 pending
    assert.deepEqual(h.sent, ['x'.repeat(60)]);
    assert.equal(h.c.isFlooding(), true);
    assert.deepEqual(h.events, [['start', 120]]);
    // flush tick：pending 以单对 SYNC 包裹发出
    h.clock.tick();
    assert.equal(h.sent.length, 2);
    assert.equal(h.sent[1], SYNC_BEGIN + 'y'.repeat(60) + SYNC_END);
  });

  it('限流态合并多 chunk 为一条，剥除自带 2026 标记后整体单对重包裹', () => {
    h.c.offer('x'.repeat(200)); // 直接超阈值进限流
    h.c.offer(SYNC_BEGIN + 'aaa' + SYNC_END);
    h.c.offer(SYNC_BEGIN + 'bbb' + SYNC_END);
    h.clock.tick();
    assert.equal(h.sent.length, 1);
    const out = h.sent[0];
    // 单对配平：恰好一个 BEGIN 开头、一个 END 结尾，内部无残留标记
    assert.ok(out.startsWith(SYNC_BEGIN) && out.endsWith(SYNC_END));
    assert.equal(out.split(SYNC_BEGIN).length - 1, 1, 'exactly one SYNC_BEGIN');
    assert.equal(out.split(SYNC_END).length - 1, 1, 'exactly one SYNC_END');
    assert.equal(out, SYNC_BEGIN + 'x'.repeat(200) + 'aaa' + 'bbb' + SYNC_END);
  });

  it('pending 超 cap 截断只留尾部（last-wins），且截断后 2026 仍配对', () => {
    h.c.offer('x'.repeat(200));            // 进限流，pending=200
    h.c.offer(SYNC_BEGIN + 'y'.repeat(300) + SYNC_END); // 剥标记后 pending=500 > 400 → 截到尾部 ~200
    h.clock.tick();
    assert.equal(h.sent.length, 1);
    const out = h.sent[0];
    const inner = out.slice(SYNC_BEGIN.length, -SYNC_END.length);
    // findSafeSliceStart 返回值 ≥ rawStart，tail 必 ≤ trimTo
    assert.ok(inner.length <= 200, `tail kept bounded by trimTo, got ${inner.length}`);
    assert.ok(inner.endsWith('y'.repeat(50)), 'tail is the newest data (last-wins)');
    assert.equal(out.split(SYNC_BEGIN).length - 1, 1, 'still exactly one SYNC_BEGIN after trim');
    assert.equal(out.split(SYNC_END).length - 1, 1, 'still exactly one SYNC_END after trim');
  });

  it('单次 flush 发送预算：超 flushBudgetBytes 截到尾部，洪泛期速率真正有界', () => {
    const hh = makeHarness({ overrides: { flushBudgetBytes: 150, pendingCap: 1000, trimTo: 500 } });
    hh.c.offer('x'.repeat(120)); // 120 > 100 阈值 → 进限流，pending=120
    hh.c.offer('y'.repeat(180)); // pending=300，未超 pendingCap(1000)
    hh.clock.tick();
    assert.equal(hh.sent.length, 1);
    const inner = hh.sent[0].slice(SYNC_BEGIN.length, -SYNC_END.length);
    // pending=300（x*120+y*180），预算 150 → 截到尾部恰为 y*150，最旧的 x 全部丢弃
    assert.equal(inner, 'y'.repeat(150), 'flush bounded by budget, tail is newest (last-wins)');
  });

  it('截断起点经 findSafeSliceStart：不会从 ANSI 序列中间开始', () => {
    h.c.offer('x'.repeat(200)); // 进限流
    // 构造截断点恰好落进一段长 CSI 序列内部：尾部前缀放转义序列
    const esc = '\x1b[38;5;196m';
    const payload = ('A'.repeat(190) + esc + 'B'.repeat(195));
    h.c.offer(payload); // pending = 200+385=585 > 400 → rawStart=385 落在尾部区域
    h.clock.tick();
    const inner = h.sent[0].slice(SYNC_BEGIN.length, -SYNC_END.length);
    // 不以裸序列残端开头（findSafeSliceStart 会跳过被切断的转义序列）
    assert.ok(!/^[0-9;]+m/.test(inner), `must not start inside a CSI sequence, got: ${JSON.stringify(inner.slice(0, 16))}`);
  });

  it('连续 fallbackWins 个低于阈值的桶后回落直通，残余 pending 先 flush', () => {
    h.c.offer('x'.repeat(200)); // 进限流
    h.clock.tick();             // 桶1结算（本桶 200>100 → calm=0）+ flush
    assert.equal(h.sent.length, 1);
    h.c.offer('q');             // 桶2 仅 1 字节
    h.clock.tick();             // 桶2:calm=1 + flush('q')
    h.clock.tick();             // 桶3:calm=2
    h.clock.tick();             // 桶4:calm=3 → 回落
    assert.equal(h.c.isFlooding(), false);
    assert.deepEqual(h.events, [['start', 200], ['end']]);
    assert.equal(h.sent[1], SYNC_BEGIN + 'q' + SYNC_END);
    // 回落后直通
    h.c.offer('after');
    assert.equal(h.sent.at(-1), 'after');
  });

  it('限流期间持续高流量不回落（calm 计数被重置）', () => {
    h.c.offer('x'.repeat(200)); // 进限流
    for (let i = 0; i < 5; i++) {
      h.clock.tick();
      h.c.offer('z'.repeat(150)); // 每桶都超阈值 → calm 归零
    }
    assert.equal(h.c.isFlooding(), true);
    assert.equal(h.events.filter((e) => e[0] === 'end').length, 0);
  });

  it('下游 send 抛错（bpGate 跳发场景）时 flush 仍清空 pending，不重试不累积', () => {
    let throwNext = false;
    const sent = [];
    const hh = makeHarness({ send: (d) => { if (throwNext) throw new Error('skip'); sent.push(d); } });
    hh.c.offer('x'.repeat(200)); // 进限流
    throwNext = true;
    hh.clock.tick();             // flush 抛错被吞，pending 已清
    throwNext = false;
    hh.c.offer('new');
    hh.clock.tick();
    // 只有 'new'，旧 200 字节不回灌
    assert.equal(sent.length, 1);
    assert.equal(sent[0], SYNC_BEGIN + 'new' + SYNC_END);
  });

  it('reset()：清 pending + timer + 回直通（bpGate onBehind/onResume 防回灌）', () => {
    h.c.offer('x'.repeat(200)); // 进限流，pending 有数据
    h.c.reset();
    assert.equal(h.c.isFlooding(), false);
    assert.equal(h.clock.count(), 0, 'flush timer cleared');
    h.clock.tick(); // 无残留 timer 可触发
    assert.deepEqual(h.sent, [], 'old pending never flushed after reset');
    // reset 后恢复正常直通
    h.c.offer('ok');
    assert.deepEqual(h.sent, ['ok']);
  });

  it('dispose()：终态，offer 不再发送，timer 清理', () => {
    h.c.offer('x'.repeat(200));
    h.c.dispose();
    assert.equal(h.clock.count(), 0);
    h.c.offer('ignored');
    h.clock.tick();
    assert.deepEqual(h.sent, []);
  });

  it('空 chunk 被忽略', () => {
    h.c.offer('');
    h.c.offer(null);
    assert.deepEqual(h.sent, []);
    assert.equal(h.c.isFlooding(), false);
  });

  it('CCV_FLOOD_* 环境变量覆盖默认常量（非法值回落默认）', async () => {
    process.env.CCV_FLOOD_FLUSH_MS = '50';
    process.env.CCV_FLOOD_THRESHOLD = 'not-a-number'; // 非法 → 回落 8192
    try {
      // ESM query 缓存击穿：以新 env 重新评估模块顶层常量
      const { createFloodCoalescer: cfc } = await import('../server/lib/pty-flood-coalescer.js?ccv-env-test');
      const timerMs = [];
      const c = cfc({
        send: () => {},
        findSafeSliceStart,
        setTimer: (fn, ms) => { timerMs.push(ms); return 0; },
        clearTimer: () => {},
      });
      c.offer('x'.repeat(9000)); // 9000 > 默认阈值 8192（非法 env 已回落）→ 进限流，armTimer
      assert.equal(c.isFlooding(), true, 'illegal CCV_FLOOD_THRESHOLD falls back to default 8KB');
      assert.deepEqual(timerMs, [50], 'CCV_FLOOD_FLUSH_MS=50 takes effect');
      c.dispose();
    } finally {
      delete process.env.CCV_FLOOD_FLUSH_MS;
      delete process.env.CCV_FLOOD_THRESHOLD;
    }
  });
});
