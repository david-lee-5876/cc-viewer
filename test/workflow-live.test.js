/**
 * workflow-live + 逐帧 watcher 单元测试
 *
 * 合成 subagents/workflows/<runId>/（agent-*.jsonl + meta + journal.jsonl）+ scripts，
 * 验证 deriveLiveJournal 推导（token/工具/running·done/workflowName/status）与
 * armWorkflowLiveWatch 经 SSE 广播 workflow_update + 去重。
 */
import { describe, it, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SAVED = process.env.CCV_PROJECTS_DIR;
const TMP = mkdtempSync(join(tmpdir(), 'ccv-live-'));
process.env.CCV_PROJECTS_DIR = TMP;

const { deriveLiveJournal, resolveRunDir } = await import('../server/lib/workflow-live.js');
const { armWorkflowLiveWatch, unwatchAllWorkflows, __setWatchImplForTests, __triggerLiveScanForTests } =
  await import('../server/lib/workflow-watcher.js');

const ENC = '-proj';
const SID = 'sid-live';
const RUN = 'wf_live-1';

function sessionDir() { return join(TMP, ENC, SID); }
function runDir() { return join(sessionDir(), 'subagents', 'workflows', RUN); }

function agentLines({ prompt, model, tools, usage }) {
  const lines = [
    JSON.stringify({ type: 'user', timestamp: '2026-06-07T09:00:00.000Z', message: { role: 'user', content: prompt } }),
    JSON.stringify({ type: 'assistant', timestamp: '2026-06-07T09:00:05.000Z', message: { role: 'assistant', model, content: tools.map(n => ({ type: 'tool_use', name: n })), usage } }),
  ];
  return lines.join('\n') + '\n';
}

function setup({ doneA = true } = {}) {
  const rd = runDir();
  mkdirSync(rd, { recursive: true });
  mkdirSync(join(sessionDir(), 'workflows', 'scripts'), { recursive: true });
  writeFileSync(join(sessionDir(), 'workflows', 'scripts', `myflow-${RUN}.js`), '// script');

  writeFileSync(join(rd, 'agent-A.jsonl'), agentLines({
    prompt: 'Read server/foo.js and summarize its purpose',
    model: 'claude-haiku-4-5-20251001',
    tools: ['Read', 'Grep'],
    usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 5, cache_read_input_tokens: 9999 },
  }));
  writeFileSync(join(rd, 'agent-A.meta.json'), JSON.stringify({ agentType: 'Explore' }));

  writeFileSync(join(rd, 'agent-B.jsonl'), agentLines({
    prompt: 'Read server/bar.js',
    model: 'claude-haiku-4-5-20251001',
    tools: ['Read'],
    usage: { input_tokens: 100, output_tokens: 200, cache_creation_input_tokens: 0 },
  }));
  writeFileSync(join(rd, 'agent-B.meta.json'), JSON.stringify({ agentType: 'Explore' }));

  const jl = [JSON.stringify({ type: 'started', agentId: 'A' }), JSON.stringify({ type: 'started', agentId: 'B' })];
  if (doneA) jl.push(JSON.stringify({ type: 'result', agentId: 'A', result: 'ok' }));
  writeFileSync(join(rd, 'journal.jsonl'), jl.join('\n') + '\n');
  return rd;
}

after(() => {
  unwatchAllWorkflows();
  __setWatchImplForTests(null);
  rmSync(TMP, { recursive: true, force: true });
  if (SAVED === undefined) delete process.env.CCV_PROJECTS_DIR;
  else process.env.CCV_PROJECTS_DIR = SAVED;
});

afterEach(() => unwatchAllWorkflows());

describe('deriveLiveJournal', () => {
  it('推导 token(in+out+cc，排除 cache_read)/工具/状态/workflowName', () => {
    const rd = setup({ doneA: true });
    const d = deriveLiveJournal(rd, RUN);
    assert.ok(d);
    assert.equal(d.live, true);
    assert.equal(d.workflowName, 'myflow');
    assert.equal(d.status, 'running');           // B 仍 running
    assert.equal(d.agentCount, 2);
    assert.deepEqual(d.phases, []);              // 运行中无 phase
    const A = d.agents.find(a => a.agentId === 'A');
    const B = d.agents.find(a => a.agentId === 'B');
    assert.equal(A.state, 'done');
    assert.equal(B.state, 'running');
    assert.equal(A.tokens, 35);                  // 10+20+5（不含 cache_read 9999）
    assert.equal(A.toolCalls, 2);
    assert.equal(A.agentType, 'Explore');
    assert.equal(A.label, 'Read server/foo.js and summarize its purpose');
    assert.equal(d.totalTokens, 35 + 300);
    assert.equal(d.totalToolCalls, 3);
  });

  it('全部 done → status finishing', () => {
    const rd = setup({ doneA: true });
    writeFileSync(join(rd, 'journal.jsonl'),
      [JSON.stringify({ type: 'started', agentId: 'A' }), JSON.stringify({ type: 'started', agentId: 'B' }),
       JSON.stringify({ type: 'result', agentId: 'A' }), JSON.stringify({ type: 'result', agentId: 'B' })].join('\n') + '\n');
    const d = deriveLiveJournal(rd, RUN);
    assert.equal(d.status, 'finishing');
  });

  it('无 agent 文件 → null', () => {
    const empty = join(TMP, ENC, 'sid-empty', 'subagents', 'workflows', 'wf_x');
    mkdirSync(empty, { recursive: true });
    assert.equal(deriveLiveJournal(empty, 'wf_x'), null);
  });
});

describe('resolveRunDir 路径穿越防御', () => {
  it('合法 wf_ runId 拼出 run 目录；穿越/非法 runId 一律 null', () => {
    const SID2 = 'sid-guard';
    writeFileSync(join(TMP, ENC, `${SID2}.jsonl`), '{}\n');  // 让 findTranscriptPath 命中
    const good = resolveRunDir(SID2, undefined, 'wf_good-1');
    assert.ok(good && good.endsWith(join(SID2, 'subagents', 'workflows', 'wf_good-1')));
    // 复用与完成态 journal 相同的 RUN_ID_RE：含 ../ 或路径分隔符/无 wf_ 前缀 → null（不拼路径）
    assert.equal(resolveRunDir(SID2, undefined, '../evil'), null);
    assert.equal(resolveRunDir(SID2, undefined, 'wf_../escape'), null);
    assert.equal(resolveRunDir(SID2, undefined, 'no-prefix'), null);
    assert.equal(resolveRunDir(SID2, undefined, ''), null);
  });
});

describe('armWorkflowLiveWatch', () => {
  it('arm 即广播一帧；变更后再广播；无变化不广播', () => {
    const rd = setup({ doneA: false });
    __setWatchImplForTests(() => ({ close() {}, on() {} }));
    const writes = [];
    const clients = [{ write: (p) => { writes.push(p); return true; } }];

    armWorkflowLiveWatch({ runDir: rd, runId: RUN, sessionId: SID, clients });
    __triggerLiveScanForTests(rd);  // 强制首帧（绕过防抖）
    const evs1 = writes.filter(w => w.startsWith('event: workflow_update')).map(w => JSON.parse(w.match(/data: (.*)\n\n$/s)[1]));
    assert.ok(evs1.length >= 1);
    assert.equal(evs1[evs1.length - 1].runId, RUN);
    assert.equal(evs1[evs1.length - 1].data.live, true);

    const before = writes.length;
    __triggerLiveScanForTests(rd);  // 无变化
    assert.equal(writes.length, before);

    // A 完成 → 签名变化 → 广播
    writeFileSync(join(rd, 'journal.jsonl'),
      [JSON.stringify({ type: 'started', agentId: 'A' }), JSON.stringify({ type: 'started', agentId: 'B' }),
       JSON.stringify({ type: 'result', agentId: 'A' })].join('\n') + '\n');
    __triggerLiveScanForTests(rd);
    assert.ok(writes.length > before);
    const last = JSON.parse(writes[writes.length - 1].match(/data: (.*)\n\n$/s)[1]);
    assert.equal(last.data.agents.find(a => a.agentId === 'A').state, 'done');
  });
});
