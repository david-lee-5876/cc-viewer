// 单测：server/lib/im-log-watcher.js
// 用注入的 watchImpl / mkdirImpl / existsImpl 驱动事件，避免真实 fs.watch 的跨平台时序抖动。
// 覆盖：惰性+幂等 ensure、.jsonl 过滤（含 _temp 排除 / null 放行 / 非 jsonl 拒绝）、debounce 合并、
//       watcher error 自撤销、目录删后重建恢复、dispose、守卫（空 id/空 logDir/dispose 后 no-op）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createImLogWatcher } from '../server/lib/im-log-watcher.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// 假 watcher 工厂：记录 watch/mkdir/close，捕获每个 dir 的 change 与 error 回调；exists 可切换。
function makeHarness() {
  const dirs = [];
  const mkdirs = [];
  const cbByDir = new Map();    // dir -> fs.watch change 回调
  const errCbByDir = new Map(); // dir -> error handler
  const closed = [];
  let exists = true;
  const watchImpl = (dir, cb) => {
    dirs.push(dir);
    cbByDir.set(dir, cb);
    return {
      on(evt, handler) { if (evt === 'error') errCbByDir.set(dir, handler); },
      close() { closed.push(dir); },
    };
  };
  const mkdirImpl = (d) => { mkdirs.push(d); };
  const existsImpl = () => exists;
  return { dirs, mkdirs, cbByDir, errCbByDir, closed, watchImpl, mkdirImpl, existsImpl, setExists(v) { exists = v; } };
}

// 用 harness 默认注入建 watcher，省去每个用例重复传参。
function build(h, opts = {}) {
  return createImLogWatcher({
    getLogDir: () => '/logs',
    onChange: opts.onChange || (() => {}),
    debounceMs: opts.debounceMs ?? 10,
    watchImpl: h.watchImpl,
    mkdirImpl: h.mkdirImpl,
    existsImpl: h.existsImpl,
  });
}

describe('im-log-watcher', () => {
  it('ensure 幂等：同平台只 mkdir+watch 一次', () => {
    const h = makeHarness();
    const w = build(h);
    w.ensure('dingtalk');
    w.ensure('dingtalk');
    assert.equal(h.dirs.length, 1);
    assert.equal(h.mkdirs.length, 1);
    assert.equal(h.dirs[0], '/logs/IM_dingtalk');
    assert.equal(w._watchers.size, 1);
    w.dispose();
  });

  it('.jsonl 写入 → debounce 后 onChange 带平台 id', async () => {
    const h = makeHarness();
    const hits = [];
    const w = build(h, { onChange: (p) => hits.push(p), debounceMs: 10 });
    w.ensure('feishu');
    h.cbByDir.get('/logs/IM_feishu')('change', 'IM_feishu_2026-06-09_10-00-00.jsonl');
    await delay(25);
    assert.deepEqual(hits, ['feishu']);
    w.dispose();
  });

  it('debounce 合并：连发多次只触发一次', async () => {
    const h = makeHarness();
    const hits = [];
    const w = build(h, { onChange: (p) => hits.push(p), debounceMs: 15 });
    w.ensure('wecom');
    const cb = h.cbByDir.get('/logs/IM_wecom');
    cb('change', 'a.jsonl'); cb('change', 'a.jsonl'); cb('change', 'a.jsonl');
    await delay(30);
    assert.equal(hits.length, 1);
    w.dispose();
  });

  it('过滤：_temp.jsonl 与非 .jsonl 不触发；filename=null 保守放行', async () => {
    const h = makeHarness();
    const hits = [];
    const w = build(h, { onChange: (p) => hits.push(p), debounceMs: 5 });
    w.ensure('discord');
    const cb = h.cbByDir.get('/logs/IM_discord');
    cb('change', 'x_temp.jsonl');   // 流式临时文件 → 忽略
    cb('change', 'senders.json');   // 非 jsonl → 忽略
    await delay(15);
    assert.equal(hits.length, 0);
    cb('rename', null);             // 部分平台不带 filename → 放行
    await delay(15);
    assert.deepEqual(hits, ['discord']);
    w.dispose();
  });

  it('watcher error → 自动 close 并撤销登记（下次 ensure 可重建）', () => {
    const h = makeHarness();
    const w = build(h);
    w.ensure('dingtalk');
    assert.equal(w._watchers.size, 1);
    // 触发 watcher error（目录被删等）
    h.errCbByDir.get('/logs/IM_dingtalk')();
    assert.equal(w._watchers.size, 0);
    assert.ok(h.closed.includes('/logs/IM_dingtalk'));
    // 下次 ensure 能重建
    w.ensure('dingtalk');
    assert.equal(w._watchers.size, 1);
    assert.equal(h.dirs.length, 2);
    w.dispose();
  });

  it('目录删后重建：ensure 复核 exists，关旧幽灵 watcher 并重建', () => {
    const h = makeHarness();
    const w = build(h);
    w.ensure('feishu');
    assert.equal(h.dirs.length, 1);
    // 目录消失但 watcher 未报 error（某些平台行为）→ 下次 ensure 应复核 exists 重建
    h.setExists(false);
    w.ensure('feishu');
    assert.equal(h.dirs.length, 2);             // 重新 watch
    assert.ok(h.closed.includes('/logs/IM_feishu')); // 旧的被关
    assert.equal(w._watchers.size, 1);
    // 目录恢复存在后再 ensure → 命中幂等，不重复
    h.setExists(true);
    w.ensure('feishu');
    assert.equal(h.dirs.length, 2);
    w.dispose();
  });

  it('platformId 校验：非 [a-z0-9_-] 字符（穿越尝试）不建 watcher', () => {
    const h = makeHarness();
    const w = build(h);
    w.ensure('../../etc');     // 含 . 和 /
    w.ensure('a/b');           // 含 /
    w.ensure('UPPER');         // 含大写
    w.ensure('x.y');           // 含 .
    assert.equal(w._watchers.size, 0);
    assert.equal(h.dirs.length, 0);
    // 合法 id 仍正常
    w.ensure('dingtalk');
    assert.equal(w._watchers.size, 1);
    w.dispose();
  });

  it('LOG_DIR 运行时切换：旧目录 watcher 关闭，新目录重新 watch', () => {
    const h = makeHarness();
    let logDir = '/proj-a';
    const w = createImLogWatcher({
      getLogDir: () => logDir,
      onChange: () => {},
      debounceMs: 5,
      watchImpl: h.watchImpl,
      mkdirImpl: h.mkdirImpl,
      existsImpl: h.existsImpl, // exists 恒 true：切换由 dir 变化驱动，而非目录消失
    });
    w.ensure('dingtalk');
    assert.deepEqual(h.dirs, ['/proj-a/IM_dingtalk']);
    // 切项目 → LOG_DIR 变
    logDir = '/proj-b';
    w.ensure('dingtalk');
    assert.deepEqual(h.dirs, ['/proj-a/IM_dingtalk', '/proj-b/IM_dingtalk']); // 新目录被 watch
    assert.ok(h.closed.includes('/proj-a/IM_dingtalk'));                       // 旧目录被关
    assert.equal(w._watchers.size, 1);
    // 切回后再 ensure → 命中幂等（dir 未变且 exists）
    w.ensure('dingtalk');
    assert.equal(h.dirs.length, 2);
    w.dispose();
  });

  it('ensure 守卫：空 platformId / 空 logDir / dispose 后均不建 watcher', () => {
    const h = makeHarness();
    const w1 = build(h);
    w1.ensure('');
    w1.ensure(null);
    assert.equal(w1._watchers.size, 0);

    const h2 = makeHarness();
    const w2 = createImLogWatcher({ getLogDir: () => '', onChange: () => {}, watchImpl: h2.watchImpl, mkdirImpl: h2.mkdirImpl, existsImpl: h2.existsImpl });
    w2.ensure('dingtalk');
    assert.equal(w2._watchers.size, 0);
    assert.equal(h2.dirs.length, 0);

    const h3 = makeHarness();
    const w3 = build(h3);
    w3.dispose();
    w3.ensure('dingtalk'); // dispose 后 no-op
    assert.equal(w3._watchers.size, 0);
    assert.equal(h3.dirs.length, 0);
  });

  it('dispose 后 pending debounce 不再触发 onChange', async () => {
    const h = makeHarness();
    const hits = [];
    const w = build(h, { onChange: (p) => hits.push(p), debounceMs: 20 });
    w.ensure('dingtalk');
    h.cbByDir.get('/logs/IM_dingtalk')('change', 'a.jsonl'); // 排了一个 debounce timer
    w.dispose();                                             // 立即 dispose
    await delay(35);
    assert.equal(hits.length, 0);
  });

  it('dispose：关闭所有 watcher 并清空登记', () => {
    const h = makeHarness();
    const w = build(h);
    w.ensure('dingtalk');
    w.ensure('feishu');
    assert.equal(w._watchers.size, 2);
    w.dispose();
    assert.equal(w._watchers.size, 0);
    assert.deepEqual(h.closed.sort(), ['/logs/IM_dingtalk', '/logs/IM_feishu']);
  });
});
