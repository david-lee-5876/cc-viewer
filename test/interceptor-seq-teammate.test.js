/**
 * interceptor.js — teammate 子进程不写 `_seq`/`_seqEpoch`（生产端反向不变量）。
 *
 * teammate 的 seq 空间属于它自己的进程；若误用 leader 的 _seqCounter，重建端会把
 * teammate 与 mainAgent 两条语义流混进同一 epoch 比较（§3.7 proxy 已知窗口的同源问题）。
 * `if (!_isTeammate)` 写入门是唯一防线，必须钉死。
 *
 * _isTeammate 由 process.argv 在模块求值期决定 → 独立测试文件（独立进程），argv 注入
 * 必须先于动态 import（同 interceptor-teammate-init.test.js 的策略）。
 * teammate + CCV_PROXY_MODE 组合下模块顶层 `(!CCV_PROXY_MODE || _isTeammate)` 为 true
 * → setupInterceptor 自执行，fake fetch 必须在 import 前就位。
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';

// ████ 数据安全死命令：env/argv 必须先锁好，再动态 import interceptor ████
const logDir = mkdtempSync(join(tmpdir(), 'ccv-seqtm-'));
process.env.CCV_LOG_DIR = logDir;
process.env.CLAUDE_CONFIG_DIR = logDir;
process.env.CCV_PROXY_MODE = '1';
process.env.CCV_SYNC_WRITES = '1';
delete process.env.CCV_WORKSPACE_MODE;
delete process.env.CCV_IM_PLATFORM;
delete process.env.CCV_DISABLE_DELTA; // delta 块必须开启（_seq 写入门在其内）

// teammate 复用 leader 日志：预置一份使 findRecentLog 命中
const workCwd = mkdtempSync(join(tmpdir(), 'ccv-seqtm-proj-'));
const projectName = basename(workCwd).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
const projLogDir = join(logDir, projectName);
mkdirSync(projLogDir, { recursive: true });
const leaderLog = join(projLogDir, `${projectName}_20260101_000000.jsonl`);
writeFileSync(leaderLog, JSON.stringify({ type: 'leader' }) + '\n---\n');

const savedArgv = process.argv.slice();
const savedCwd = process.cwd();

let mod;
before(async () => {
  // fake fetch 先于 import（teammate 模式 import 即自执行 setupInterceptor）
  globalThis.fetch = async () =>
    new Response('{"content":[{"type":"text","text":"ok"}]}', {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  process.argv = [process.argv[0], process.argv[1], '--agent-name', 'worker-1', '--team-name', 'fix-stuff'];
  process.chdir(workCwd);
  mod = await import('../server/interceptor.js');
});

after(() => {
  process.argv = savedArgv;
  try { process.chdir(savedCwd); } catch { /* noop */ }
  try { rmSync(logDir, { recursive: true, force: true }); } catch { /* noop */ }
  try { rmSync(workCwd, { recursive: true, force: true }); } catch { /* noop */ }
  setTimeout(() => process.exit(0), 30).unref(); // 顶层 watchFile 阻止退出
});

function readEntries() {
  if (!mod.LOG_FILE || !existsSync(mod.LOG_FILE)) return [];
  return readFileSync(mod.LOG_FILE, 'utf-8')
    .split('\n---\n')
    .filter(p => p.trim())
    .map(p => { try { return JSON.parse(p); } catch { return null; } })
    .filter(Boolean);
}

describe('interceptor — teammate 子进程 _seq 写入门', () => {
  it('teammate 的 mainAgent 双标请求：带 teammate 字段、绝不写 _seq/_seqEpoch', async () => {
    // mainAgent 形态 body（system 含 You are Claude Code + 12 tools）→ 双标场景
    const tools = ['Edit', 'Bash', 'Task', 'Read', 'Write', 'Glob', 'Grep', 'Agent',
      'WebFetch', 'WebSearch', 'NotebookEdit', 'AskUser'].map(name => ({ name }));
    await globalThis.fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        system: [{ type: 'text', text: 'You are Claude Code, the official CLI.' }],
        tools,
        model: 'claude-test',
        messages: [{ role: 'user', content: 'teammate task' }],
      }),
    });

    const logged = readEntries().filter(e => e.url);
    assert.ok(logged.length > 0, 'teammate 请求应被记录');
    for (const e of logged) {
      assert.equal(e.teammate, 'worker-1', '条目应带 teammate 字段（重建端隔离依据）');
      assert.equal(e._seq, undefined, 'teammate 条目绝不携带 _seq');
      assert.equal(e._seqEpoch, undefined, 'teammate 条目绝不携带 _seqEpoch');
    }
  });
});
