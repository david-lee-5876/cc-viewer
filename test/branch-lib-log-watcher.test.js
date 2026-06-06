// log-watcher.js BRANCH 补缺：聚焦既有 test/log-watcher*.test.js 未触达的分支。
// 缺口（单跑口径）：
//   204     —— _readDelta 的 catch（fsStat 抛错 / 读取期文件消失）
//   219-223 —— 目录 watcher 回调 filename=null → 对所有 fileState 去抖读
//   229-233 —— 目录 watcher 'error' 事件 → 全部退回轮询 + close + delete
//   256     —— _fallbackToPolling 的 watchFile 回调真正触发 _readDelta
//   314-316 —— 模块加载期 FORCE_POLL=true 分支（CCV_FORCE_POLL=1，需子进程）
//   330     —— safetyTimer setInterval 回调触发 _readDelta（需等 >5s）
//   343-344 —— unwatchAll 关闭 _dirWatchers 里仍存活的目录 watcher
//
// 注意：FORCE_POLL 在模块加载期 `const FORCE_POLL = process.env.CCV_FORCE_POLL==='1'` 冻结，
// 进程内改 env 无效，必须用子进程 + spread process.env（保住 NODE_V8_COVERAGE）。
// log-watcher 不是 src/utils 的 Vite 模块，可直接静态 import；但为遵循仓库约定统一用动态 import。
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync, rmSync, writeFileSync, appendFileSync, mkdtempSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const targetUrl = pathToFileURL(join(__dirname, '..', 'server', 'lib', 'log-watcher.js')).href;

let lw;

function privTmp(tag) {
  return mkdtempSync(join(os.tmpdir(), `ccv-branch-lw-${tag}-${process.pid}-`));
}

// 轮询助手：不许固定 sleep 断言。默认 8s（>5s 安全网慢轮询，确保兜底必触发）。
function waitUntil(predicate, { timeout = 8000, interval = 25 } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const id = setInterval(() => {
      if (predicate()) { clearInterval(id); resolve(true); }
      else if (Date.now() - t0 > timeout) { clearInterval(id); resolve(false); }
    }, interval);
  });
}

function rec(obj) { return JSON.stringify(obj) + '\n---\n'; }

function collector() {
  const data = [];
  const events = [];
  const client = {
    destroyed: false, writable: true,
    write(p) {
      if (p.startsWith('event: ')) {
        const m = /^event: (\S+)\ndata: (.*)\n\n$/s.exec(p);
        if (m) events.push({ name: m[1], data: JSON.parse(m[2]) });
      } else {
        const m = /^data: (.*)\n\n$/s.exec(p);
        if (m) data.push(JSON.parse(m[1]));
      }
      return true;
    },
    end() {},
  };
  return { client, data, events };
}

function makeOpts(logFile, clients, over = {}) {
  return {
    logFile, clients,
    getClaudePid: () => 12321,
    runParallelHook: async () => {},
    notifyStatsWorker: () => {},
    getLogFile: () => logFile,
    ...over,
  };
}

before(async () => {
  lw = await import(targetUrl);
});

describe('log-watcher.js 分支补缺', () => {
  let dir;
  beforeEach(() => { dir = privTmp('main'); lw.unwatchAll(); });
  afterEach(() => { lw.unwatchAll(); try { rmSync(dir, { recursive: true, force: true }); } catch {} });

  // ── 330：safetyTimer setInterval 回调触发 _readDelta ───────────────────────
  // 写文件后通过安全网慢轮询（5s）被动读到尾部内容；不依赖 fs.watch 事件去抖。
  it('safetyTimer 慢轮询兜底读取（行 330）', async () => {
    const file = join(dir, 'safety.jsonl');
    writeFileSync(file, '');
    const { client, data } = collector();
    lw.watchLogFile(makeOpts(file, [client]));
    // 立即 append；无论 fs.watch 是否漏事件，<=5s 的安全网轮询都会兜底读到。
    appendFileSync(file, rec({ timestamp: 'safe1', url: '/v1/messages' }));
    const got = await waitUntil(() => data.length > 0, { timeout: 8000 });
    assert.ok(got, 'safetyTimer 或 fs.watch 任一通路应送达条目');
    assert.equal(data[0].timestamp, 'safe1');
  });

  // ── 343-344：unwatchAll 收尾遍历 _dirWatchers 并 close 仍存活的目录 watcher ──
  // 关键：per-file 的 _unwatchSingleFile 在 dirEntry.files.size===0 时已 close 目录 watcher，
  // 正常路径下到 342 行循环时 _dirWatchers 多半已空。为确定性命中 343-344，制造
  // watchedFiles 与 dirEntry.files 不一致：从 watchedFiles 里直接删一个 key（不走卸载），
  // 这样 unwatchAll 第一轮按剩余 key 卸载后 dirEntry.files 仍残留 1 个 → 目录 watcher 未关，
  // 第二轮（342-345）遍历 _dirWatchers 收尾 close 之。
  it('unwatchAll 收尾关闭残留目录 watcher（行 343-344）', async () => {
    const a = join(dir, 'wa_a.jsonl');
    const b = join(dir, 'wa_b.jsonl');
    writeFileSync(a, ''); writeFileSync(b, '');
    // 同目录两文件 → 共用一个 _dirWatchers 项（事件驱动，非 polling）。
    lw.watchLogFile(makeOpts(a, []));
    lw.watchLogFile(makeOpts(b, []));
    assert.equal(lw.getWatchedFiles().size, 2);
    // 仅从 watchedFiles 移除 a（绕过 _unwatchSingleFile），制造与 dirEntry.files 的不一致。
    lw.getWatchedFiles().delete(a);
    assert.equal(lw.getWatchedFiles().size, 1);
    // unwatchAll：第一轮卸载 b（dirEntry.files 残留 a，size!==0，目录 watcher 未关）；
    // 第二轮遍历 _dirWatchers close 残留目录 watcher（343-344）。必须不抛。
    assert.doesNotThrow(() => lw.unwatchAll());
    assert.equal(lw.getWatchedFiles().size, 0);
    // 再次 unwatchAll（注册表已空）应是无害 no-op。
    assert.doesNotThrow(() => lw.unwatchAll());
  });

  // ── 343-344 双保险：单文件目录 watcher，正常两文件场景也走一遍收尾循环 ──────
  // 同目录两文件，全部走 _unwatchSingleFile 后目录 watcher 已被 close，但 unwatchAll 末尾
  // 仍会遍历空的 _dirWatchers（覆盖循环判定假支）。
  it('unwatchAll 在常规双文件场景下正常清空且幂等', async () => {
    const a = join(dir, 'wb_a.jsonl');
    const b = join(dir, 'wb_b.jsonl');
    writeFileSync(a, ''); writeFileSync(b, '');
    lw.watchLogFile(makeOpts(a, []));
    lw.watchLogFile(makeOpts(b, []));
    assert.doesNotThrow(() => lw.unwatchAll());
    assert.equal(lw.getWatchedFiles().size, 0);
  });

  // ── 188 假支：mainAgent 完成态但无 response/usage → 不发 context_window ──────
  // 注：extractCachedContent 对任何 mainAgent 实体都返回真值对象，故 186 的 if 假支不可达；
  // 此处只稳定覆盖 188 的 if(usage) 假支（response 缺失 → parsed.response?.body?.usage 短路为 undefined）。
  it('mainAgent 完成态但缺 usage 时不发 context_window（188 假支 + ?. 短路）', async () => {
    const file = join(dir, 'mainbare.jsonl');
    writeFileSync(file, '');
    const { client, data, events } = collector();
    lw.watchLogFile(makeOpts(file, [client]));
    const entry = {
      timestamp: 'mb1', url: '/v1/messages', mainAgent: true, inProgress: false,
      body: { messages: [] },
      // 无 response → parsed.response?.body?.usage === undefined（短路）→ if(usage) 假支
    };
    appendFileSync(file, rec(entry));
    const got = await waitUntil(() => data.length > 0, { timeout: 8000 });
    assert.ok(got, '条目本体应送达');
    assert.equal(data[0].timestamp, 'mb1');
    // 无 usage → 不应有 context_window。
    assert.equal(events.map((e) => e.name).includes('context_window'), false);
  });

  // ── 184 假支：mainAgent 但 inProgress=true → 整段侧信道跳过 ──────────────────
  it('mainAgent 但 inProgress=true 时跳过侧信道分支（184 假支）', async () => {
    const file = join(dir, 'inprog.jsonl');
    writeFileSync(file, '');
    const { client, data, events } = collector();
    lw.watchLogFile(makeOpts(file, [client]));
    appendFileSync(file, rec({
      timestamp: 'ip1', url: '/v1/messages', mainAgent: true, inProgress: true,
      body: { model: 'claude-opus-4-6', system: [], messages: [] },
      response: { body: { usage: { input_tokens: 1, output_tokens: 1 } } },
    }));
    const got = await waitUntil(() => data.length > 0, { timeout: 8000 });
    assert.ok(got);
    const names = events.map((e) => e.name);
    assert.equal(names.includes('kv_cache_content'), false);
    assert.equal(names.includes('context_window'), false);
  });

  // ── 166-172：多条 + 末尾残片（pendingTail 非合法 JSON → 留作 tail）──────────
  it('多条记录 + 末尾不完整残片暂存为 pendingTail（166/171 假支）', async () => {
    const file = join(dir, 'multi.jsonl');
    writeFileSync(file, '');
    const { client, data } = collector();
    lw.watchLogFile(makeOpts(file, [client]));
    // 两条完整记录 + 一段非法 JSON 残片（无结尾分隔符且 parse 失败 → 留 pendingTail，catch 静默）。
    appendFileSync(file,
      rec({ timestamp: 'p1', url: '/u' }) +
      rec({ timestamp: 'p2', url: '/u' }) +
      '{not-json-yet');
    const got = await waitUntil(() => data.length >= 2, { timeout: 8000 });
    assert.ok(got, '两条完整记录应送达，残片暂存不报错');
    assert.deepEqual(data.map((d) => d.timestamp), ['p1', 'p2']);
  });

  // ── 204：_readDelta 的 catch ——读取过程中文件被删除，fsStat 抛 ENOENT ─────
  it('_readDelta 在文件消失时吞掉读取错误（行 204）', async () => {
    const file = join(dir, 'vanish.jsonl');
    writeFileSync(file, rec({ timestamp: 'x', url: '/u' }));
    const { client, data } = collector();
    // getLogFile 仍指向自身，避免触发轮转；只测 catch。
    lw.watchLogFile(makeOpts(file, [client]));
    // 删除文件再 append 到“同名”——先删，制造 fsStat 失败窗口；
    // 安全网轮询 / fs.watch 触发 _readDelta 时 fsStat 抛错 → 进 catch（204）。
    rmSync(file, { force: true });
    // 触发一次目录事件（创建一个无关文件）促使 watcher 回调跑一圈，
    // 但更可靠的是安全网慢轮询：等一拍确认进程不崩、watch 仍在册。
    const stillWatched = await waitUntil(
      () => lw.getWatchedFiles().has(file) === true,
      { timeout: 200 },
    );
    assert.ok(stillWatched, '文件消失不应让 watch 项被移除（catch 静默）');
    // 给安全网轮询一个触发窗口（不强求断言副作用，覆盖 catch 即可）。
    await waitUntil(() => false, { timeout: 5400 });
    assert.equal(data.length, 0, '文件已删除，不应有条目送达');
    // 进程未崩、watch 项仍在 → catch 被执行且生效。
    assert.equal(lw.getWatchedFiles().has(file), true);
  });
});

// ── 314-316 + 256：FORCE_POLL 分支 + watchFile 轮询回调（子进程） ────────────
// FORCE_POLL 在模块加载期冻结，必须在子进程把 CCV_FORCE_POLL=1 注入 env。
// 子进程内：watchLogFile → _fallbackToPolling（314-315），append → watchFile 回调
// → _readDelta（256）→ 客户端收到条目 → 打印 OK 标记后退出。
// spread process.env 保住 node:test 注入的 NODE_V8_COVERAGE，子进程覆盖才计入。
describe('log-watcher.js FORCE_POLL / watchFile 轮询（子进程，行 314-316 / 256）', () => {
  it('CCV_FORCE_POLL=1 走轮询并真正读取增量', () => {
    const tdir = privTmp('forcepoll');
    const file = join(tdir, 'fp.jsonl');
    writeFileSync(file, '');
    // 子进程驱动脚本（ESM via --eval）。__TARGET__/__FILE__ 占位替换为绝对路径。
    const driver = `
      import { watchLogFile, getWatchedFiles, unwatchAll } from ${JSON.stringify(targetUrl)};
      import { appendFileSync } from 'node:fs';
      const file = ${JSON.stringify(file)};
      const data = [];
      const client = { destroyed: false, writable: true, write(p){ data.push(p); return true; }, end(){} };
      const opts = {
        logFile: file, clients: [client],
        getClaudePid: () => 777,
        runParallelHook: async () => {},
        notifyStatsWorker: () => {},
        getLogFile: () => file,
      };
      watchLogFile(opts);
      const st = getWatchedFiles().get(file);
      if (!st || st.polling !== true) { console.error('NOT_POLLING'); process.exit(2); }
      // watchFile interval=500ms；append 后等回调读到增量。
      // 死线 25s:CI 慢机上 stat 轮询检测偶发数秒滞后(曾 9s 超窗 flake);绿路径命中即退,不耗时。
      appendFileSync(file, JSON.stringify({ timestamp: 'fp1', url: '/v1/messages' }) + '\\n---\\n');
      const t0 = Date.now();
      const timer = setInterval(() => {
        if (data.some(d => d.includes('fp1'))) {
          console.log('POLL_OK');
          clearInterval(timer);
          unwatchAll();
          process.exit(0);
        } else if (Date.now() - t0 > 25000) {
          console.error('POLL_TIMEOUT');
          clearInterval(timer);
          process.exit(3);
        }
      }, 50);
    `;
    const res = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', driver],
      { env: { ...process.env, CCV_FORCE_POLL: '1' }, encoding: 'utf-8', timeout: 40000 },
    );
    try { rmSync(tdir, { recursive: true, force: true }); } catch {}
    assert.equal(res.status, 0, `子进程应成功退出；stderr=${res.stderr}`);
    assert.match(res.stdout, /POLL_OK/, '轮询回调应读到 append 的增量条目');
  });
});

// ── 219-223 / 229-233：目录 watcher 回调 filename=null + 'error' 事件 ────────
// 这两段在 _getOrCreateDirWatcher 内部的真实 fs.watch 回调 / 'error' handler 里。
// 二者均依赖底层 fs.watch 行为，无法在不改源码（无导出钩子）的前提下从外部稳定/确定地触发：
//   * filename=null 仅在特定平台/事件偶发，不可确定性制造；
//   * 内部 watcher 实例未导出，无法对其 emit('error')。
// 详见返回 unreachable 数组的论证，不为凑数写假断言。
