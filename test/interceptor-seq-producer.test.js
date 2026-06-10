/**
 * interceptor.js — `_seq`/`_seqEpoch` 生产端不变量（完成序倒置守卫的源头）。
 *
 * 重建端（delta-reconstructor）的守卫全部以这里的写入为前提，三个不变量必须钉死：
 *   1. mainAgent delta 请求 `_seq` 每请求单调递增（同步段内自增，与 Plan C eager 块同段）
 *   2. 进程内 `_seqEpoch` 稳定（同一写进程所有条目共享同一 epoch token）
 *   3. placeholder 与 completed 共享同一 `_seq`（同一 requestEntry 对象，重建端先跳
 *      inProgress 再做 seq 守卫依赖这一点）
 * teammate 子进程不写 _seq 的反向不变量在 interceptor-seq-teammate.test.js（argv 决定
 * _isTeammate 于模块求值期，需独立进程）。
 *
 * harness 复用 interceptor-fetch.test.js 的策略：env → 动态 import → setupInterceptor。
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ████ 数据安全死命令：env 必须先锁到进程私有临时目录，再动态 import interceptor ████
// 严禁把 ../server/interceptor.js 改成顶层静态 import。
process.env.CCV_PROXY_MODE = '1';      // 跳过模块自执行 setupInterceptor
process.env.CCV_SYNC_WRITES = '1';     // 同步写盘，便于读取断言
delete process.env.CCV_WORKSPACE_MODE;
delete process.env.CCV_DISABLE_DELTA;  // delta storage 必须开启（_seq 仅在 delta 块内写）
const __isoDir = mkdtempSync(join(tmpdir(), 'ccv-seqprod-'));
process.env.CCV_LOG_DIR = __isoDir;
process.env.CLAUDE_CONFIG_DIR = __isoDir;

let mod;

function readEntries() {
  if (!mod.LOG_FILE || !existsSync(mod.LOG_FILE)) return [];
  return readFileSync(mod.LOG_FILE, 'utf-8')
    .split('\n---\n')
    .filter(p => p.trim())
    .map(p => JSON.parse(p));
}

function makeMainAgentTools() {
  return [
    { name: 'Edit' }, { name: 'Bash' }, { name: 'Task' },
    { name: 'Read' }, { name: 'Write' }, { name: 'Glob' },
    { name: 'Grep' }, { name: 'Agent' }, { name: 'WebFetch' },
    { name: 'WebSearch' }, { name: 'NotebookEdit' }, { name: 'AskUser' },
  ];
}
function mainAgentBody(messages) {
  return {
    system: [{ type: 'text', text: 'You are Claude Code, the official CLI.' }],
    tools: makeMainAgentTools(),
    model: 'claude-test',
    messages,
  };
}

async function fireMainAgent(messages) {
  await globalThis.fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    body: JSON.stringify(mainAgentBody(messages)),
  });
}

before(async () => {
  globalThis.fetch = async () =>
    new Response('{"content":[{"type":"text","text":"ok"}]}', {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  mod = await import('../server/interceptor.js');
  mod.setupInterceptor();
  assert.ok(mod.LOG_FILE, 'LOG_FILE 应被自动初始化');
});

after(() => {
  // 顶层 watchFile(PROFILE_PATH) 会阻止进程退出，强制终止
  setTimeout(() => process.exit(0), 30).unref();
});

describe('interceptor — _seq/_seqEpoch 生产端不变量', () => {
  it('mainAgent 请求 _seq 每请求单调递增，进程内 _seqEpoch 稳定', async () => {
    await fireMainAgent([{ role: 'user', content: 'q1' }]);
    await fireMainAgent([
      { role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
    ]);
    await fireMainAgent([
      { role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' }, { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'q3' },
    ]);

    const completed = readEntries().filter(e => e.mainAgent && !e.inProgress);
    assert.equal(completed.length, 3, '应有 3 条 completed mainAgent 条目');

    const seqs = completed.map(e => e._seq);
    assert.ok(seqs.every(s => typeof s === 'number'), '每条 mainAgent 条目都应带数值 _seq');
    for (let i = 1; i < seqs.length; i++) {
      assert.equal(seqs[i], seqs[i - 1] + 1, `_seq 必须严格 +1 递增（${seqs[i - 1]} → ${seqs[i]}）`);
    }

    const epochs = new Set(completed.map(e => e._seqEpoch));
    assert.equal(epochs.size, 1, '同一写进程所有条目必须共享同一 _seqEpoch');
    const epoch = [...epochs][0];
    assert.ok(typeof epoch === 'string' && epoch.length > 0, '_seqEpoch 应为非空字符串 token');
  });

  it('placeholder 与 completed 共享同一 _seq（重建端先跳 inProgress 的前提）', async () => {
    const before = readEntries().length;
    await fireMainAgent([
      { role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' }, { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'q3' }, { role: 'assistant', content: 'a3' },
      { role: 'user', content: 'q4' },
    ]);
    const entries = readEntries().slice(before);
    const placeholder = entries.find(e => e.inProgress && e.mainAgent);
    const completed = entries.find(e => !e.inProgress && e.mainAgent);
    assert.ok(placeholder, '应写入 inProgress placeholder');
    assert.ok(completed, '应写入 completed 条目');
    assert.equal(typeof completed._seq, 'number');
    assert.equal(placeholder._seq, completed._seq,
      'placeholder 与 completed 必须共享同一 _seq（同一 requestEntry 对象）');
    assert.equal(placeholder._seqEpoch, completed._seqEpoch);
  });

  it('非 mainAgent 请求不写 _seq', async () => {
    const before = readEntries().length;
    // 无 Claude Code system/tools 特征 → isMainAgentRequest=false
    await globalThis.fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'claude-test', messages: [{ role: 'user', content: 'sub' }] }),
    });
    const entries = readEntries().slice(before);
    assert.ok(entries.length > 0, '非 mainAgent 请求仍应被记录');
    for (const e of entries) {
      assert.equal(e._seq, undefined, '非 mainAgent 条目不得携带 _seq');
      assert.equal(e._seqEpoch, undefined, '非 mainAgent 条目不得携带 _seqEpoch');
    }
  });
});
