// 覆盖目标：server/routes/im.js 既有 api-im.test.js 未触达的零碎分支（92.17%）：
//   - 114-117  imConfigPost 坏 JSON body → 400
//   - 144-147  imConfigPost 进程操作（restart/stop）抛错 → catch 记日志但仍 200
//   - 194-199  imProcessPost action:'start' 正常臂 + 未知 action → 400
//   - 203-205  imProcessPost 进程操作抛错 → 500
//   - 242-244  imAppendSystemGet readImAppendSystem 抛非 ENOENT（EISDIR）→ 500
//   - 266-268  imAppendSystemPost writeImAppendSystem rename 抛错（EISDIR）→ 500
//
// 手法：沿用 api-im.test.js 的「直接调 route.handler + deps 替身 + fake req/res」模式（不起真 server）。
// 进程类分支用 deps.im 替身注入抛错；两个文件系统 catch 分支用真实临时 LOG_DIR——预先把
// IM_dingtalk/CC_APPEND_SYSTEM.md 造成一个「目录」，使 readFileSync 抛 EISDIR（非 ENOENT 不回 preset）
// 与 renameSyncWithRetry 抛 EISDIR，分别命中 GET/POST 的 catch。
//
// 放过（确认不可达）：287-289 imSkills 的 catch——listSkills 内部 scanDir 对 readdir 失败是空 catch
// 吞掉，imDir/filter 均不抛，故该 catch 在真实 listSkills 下无法触发（纯防御）。

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// 必须在任何拉起 findcc.js（→ LOG_DIR）的 import 之前设置临时 LOG_DIR。
const tmpDir = mkdtempSync(join(tmpdir(), 'ccv-im-gap-'));
process.env.CCV_LOG_DIR = tmpDir;
process.env.CLAUDE_CONFIG_DIR = tmpDir;
process.env.CCV_WORKSPACE_MODE = '1';
process.env.CCV_CLI_MODE = '0';

// 预置：把 IM_dingtalk/CC_APPEND_SYSTEM.md 造成一个目录 → readFileSync/rename 都会抛 EISDIR。
mkdirSync(join(tmpDir, 'IM_dingtalk'), { recursive: true });
mkdirSync(join(tmpDir, 'IM_dingtalk', 'CC_APPEND_SYSTEM.md'), { recursive: true });

/** fake req：按 readBody 约定投递 data/end。 */
const fakeReq = (bodyStr) => ({
  on(ev, cb) { if (ev === 'data' && bodyStr) cb(Buffer.from(bodyStr)); if (ev === 'end') cb(); return this; },
});

/** 直接调 route.handler，收集 status/payload。 */
function call(route, { pathname, body, isLocal = true, deps }) {
  let status = 0, payload = '';
  let resolveEnd; const done = new Promise((r) => { resolveEnd = r; });
  const res = { writeHead(s) { status = s; }, end(b) { payload = b || ''; resolveEnd(); } };
  route.handler(fakeReq(body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body))), res, { pathname }, isLocal, deps);
  return done.then(() => ({ status, payload, json: () => JSON.parse(payload) }));
}

describe('server/routes/im.js gap branches', { concurrency: false }, () => {
  let imRoutes;

  before(async () => {
    ({ imRoutes } = await import('../server/routes/im.js'));
  });

  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  // ── 114-117: config POST 坏 JSON ──
  it('config POST with malformed JSON body → 400 Invalid JSON', async () => {
    const route = imRoutes.find((r) => r.predicate('/api/im/feishu/config', 'POST'));
    const deps = { MAX_POST_BODY: 1e6, im: { isWorker: false, restartProcess: async () => {}, stopProcess: async () => {} } };
    const r = await call(route, { pathname: '/api/im/feishu/config', body: '{not valid json', deps });
    assert.equal(r.status, 400);
    assert.match(r.payload, /Invalid JSON/);
  });

  // ── 144-147: config POST 进程操作抛错 → 仍 200，记 console.error ──
  it('config POST whose restartProcess throws still returns 200 (error logged, save not blocked)', async () => {
    const route = imRoutes.find((r) => r.predicate('/api/im/feishu/config', 'POST'));
    const deps = {
      MAX_POST_BODY: 1e6,
      im: { isWorker: false, restartProcess: async () => { throw new Error('spawn EACCES'); }, stopProcess: async () => {} },
    };
    const origErr = console.error; let logged = '';
    console.error = (...a) => { logged += a.join(' '); };
    let r;
    try {
      r = await call(route, { pathname: '/api/im/feishu/config', body: { enabled: true, appId: 'a', appSecret: 'b', allowUserIds: ['ou_ok'] }, deps });
    } finally { console.error = origErr; }
    assert.equal(r.status, 200, 'process failure must not block the config-save 200');
    assert.equal(r.json().connection.running, true, 'optimistic running:true reflects saved.enabled');
    assert.match(logged, /IM config apply failed/, 'the apply failure must be logged');
  });

  // ── 194-199: process POST action:'start' 正常臂 + 未知 action → 400 ──
  it("process POST {action:'start'} drives startProcess and returns 200", async () => {
    const route = imRoutes.find((r) => r.predicate('/api/im/feishu/process', 'POST'));
    const calls = [];
    const deps = { MAX_POST_BODY: 1e6, im: { isWorker: false, startProcess: async (id) => calls.push(['start', id]), getProcessStatus: async () => ({ running: true, connected: false }) } };
    const r = await call(route, { pathname: '/api/im/feishu/process', body: { action: 'start' }, deps });
    assert.equal(r.status, 200);
    assert.equal(r.json().ok, true);
    assert.deepEqual(calls, [['start', 'feishu']]);
  });

  it('process POST with an unknown action → 400', async () => {
    const route = imRoutes.find((r) => r.predicate('/api/im/feishu/process', 'POST'));
    const deps = { MAX_POST_BODY: 1e6, im: { isWorker: false, startProcess: async () => {}, stopProcess: async () => {}, restartProcess: async () => {}, getProcessStatus: async () => ({}) } };
    const r = await call(route, { pathname: '/api/im/feishu/process', body: { action: 'frobnicate' }, deps });
    assert.equal(r.status, 400);
    assert.match(r.payload, /start\|stop\|restart/);
  });

  it('process POST with NO action (empty body) → 400 (default {} → action undefined)', async () => {
    const route = imRoutes.find((r) => r.predicate('/api/im/feishu/process', 'POST'));
    const deps = { MAX_POST_BODY: 1e6, im: { isWorker: false, startProcess: async () => {}, stopProcess: async () => {}, restartProcess: async () => {}, getProcessStatus: async () => ({}) } };
    const r = await call(route, { pathname: '/api/im/feishu/process', body: null, deps });
    assert.equal(r.status, 400);
  });

  // ── 203-205: process POST 进程操作抛错 → 500 ──
  it('process POST whose stopProcess throws → 500 with the error message', async () => {
    const route = imRoutes.find((r) => r.predicate('/api/im/feishu/process', 'POST'));
    const deps = { MAX_POST_BODY: 1e6, im: { isWorker: false, stopProcess: async () => { throw new Error('manager boom'); }, getProcessStatus: async () => ({}) } };
    const r = await call(route, { pathname: '/api/im/feishu/process', body: { action: 'stop' }, deps });
    assert.equal(r.status, 500);
    assert.equal(r.json().ok, false);
    assert.match(r.json().error, /manager boom/);
  });

  // ── 242-244: append-system GET readImAppendSystem 抛 EISDIR → 500 ──
  it('append-system GET → 500 when CC_APPEND_SYSTEM.md is a directory (readFileSync EISDIR, not ENOENT)', async () => {
    // IM_dingtalk/CC_APPEND_SYSTEM.md 已在 before-import 阶段造成目录 → readImAppendSystem 抛 EISDIR（非 ENOENT 不回 preset）。
    const route = imRoutes.find((r) => r.predicate('/api/im/dingtalk/append-system', 'GET'));
    const r = await call(route, { pathname: '/api/im/dingtalk/append-system', deps: { MAX_POST_BODY: 1e6 } });
    assert.equal(r.status, 500);
    assert.ok(r.json().error, 'error message surfaced');
    assert.match(r.json().error, /EISDIR|directory/i);
  });

  // ── 266-268: append-system POST writeImAppendSystem rename 抛 EISDIR → 500 ──
  it('append-system POST → 500 when target CC_APPEND_SYSTEM.md is a directory (rename EISDIR)', async () => {
    const route = imRoutes.find((r) => r.predicate('/api/im/dingtalk/append-system', 'POST'));
    const r = await call(route, { pathname: '/api/im/dingtalk/append-system', body: { content: '# persona' }, deps: { MAX_POST_BODY: 1e6 } });
    assert.equal(r.status, 500);
    assert.ok(r.json().error, 'rename failure surfaced as 500');
  });
});
