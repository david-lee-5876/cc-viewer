/**
 * workflow-journal 单元测试
 *
 * normalizeWorkflowJournal 字段映射 + resolveJournalPath/readNormalizedJournal 定位读取
 * （含 runId / taskId 两种解析、坏 runId 拒绝、穿越守卫由 RUN_ID_RE 保证）。
 */
import { describe, it, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SAVED_PROJECTS_DIR = process.env.CCV_PROJECTS_DIR;
const TMP = mkdtempSync(join(tmpdir(), 'ccv-wfj-'));
process.env.CCV_PROJECTS_DIR = TMP;

const { normalizeWorkflowJournal, resolveJournalPath, readNormalizedJournal, resolveWorkflowsDir } =
  await import('../server/lib/workflow-journal.js');
const { clearCache } = await import('../server/lib/session-transcript-reader.js');

const RAW_JOURNAL = {
  runId: 'wf_run-1',
  taskId: 'wt1',
  workflowName: 'demo-flow',
  summary: 'a demo',
  status: 'completed',
  durationMs: 1234,
  agentCount: 2,
  totalTokens: 5000,
  totalToolCalls: 7,
  defaultModel: 'claude-opus-4-8',
  startTime: 1700000000000,
  phases: [
    { title: 'Scan', detail: 'd1' },
    { title: 'Fix', detail: 'd2' },
  ],
  workflowProgress: [
    { type: 'workflow_phase', index: 1, title: 'Scan' },
    { type: 'workflow_agent', index: 1, label: 'scan:a', phaseIndex: 1, phaseTitle: 'Scan', agentId: 'a1', agentType: 'Explore', model: 'claude-haiku-4-5', state: 'done', tokens: 100, toolCalls: 3, durationMs: 500, lastToolName: 'Grep', startedAt: 1, lastProgressAt: 2 },
    { type: 'workflow_agent', index: 2, label: 'fix:b', phaseIndex: 2, phaseTitle: 'Fix', agentId: 'a2', agentType: 'general', model: 'claude-opus-4-8', state: 'running', tokens: 200, toolCalls: 4 },
  ],
};

function setupSession(dir, sid) {
  const projDir = join(TMP, dir);
  mkdirSync(join(projDir, sid, 'workflows'), { recursive: true });
  // 让 findTranscriptPath 解析到该 session
  writeFileSync(join(projDir, `${sid}.jsonl`), JSON.stringify({ type: 'user', sessionId: sid }) + '\n');
  return join(projDir, sid, 'workflows');
}

after(() => {
  rmSync(TMP, { recursive: true, force: true });
  if (SAVED_PROJECTS_DIR === undefined) delete process.env.CCV_PROJECTS_DIR;
  else process.env.CCV_PROJECTS_DIR = SAVED_PROJECTS_DIR;
});

beforeEach(() => clearCache());

describe('normalizeWorkflowJournal', () => {
  it('映射顶层 + phases + agents（仅 workflow_agent）', () => {
    const n = normalizeWorkflowJournal(RAW_JOURNAL);
    assert.equal(n.workflowName, 'demo-flow');
    assert.equal(n.status, 'completed');
    assert.equal(n.totalTokens, 5000);
    assert.equal(n.phases.length, 2);
    assert.deepEqual(n.phases[0], { index: 1, title: 'Scan', detail: 'd1' });
    assert.equal(n.agents.length, 2);
    assert.equal(n.agents[0].label, 'scan:a');
    assert.equal(n.agents[0].state, 'done');
    assert.equal(n.agents[1].state, 'running');
    assert.equal(n.agents[1].durationMs, null);
    assert.equal(n.live, false);   // 权威完成快照显式标记，供前端防 live 帧回退
  });

  it('坏输入 → null', () => {
    assert.equal(normalizeWorkflowJournal(null), null);
    assert.equal(normalizeWorkflowJournal(42), null);
  });

  it('缺 phases/progress → 空数组', () => {
    const n = normalizeWorkflowJournal({ workflowName: 'x' });
    assert.deepEqual(n.phases, []);
    assert.deepEqual(n.agents, []);
    assert.equal(n.agentCount, 0);
  });
});

describe('resolveJournalPath / readNormalizedJournal', () => {
  it('按 runId 定位并读取', () => {
    const wfDir = setupSession('-proj-a', 'sid-a');
    writeFileSync(join(wfDir, 'wf_run-1.json'), JSON.stringify(RAW_JOURNAL));
    const p = resolveJournalPath({ sessionId: 'sid-a', projectHint: 'a', runId: 'wf_run-1' });
    assert.ok(p && p.endsWith('wf_run-1.json'));
    const data = readNormalizedJournal(p);
    assert.equal(data.workflowName, 'demo-flow');
  });

  it('按 taskId 扫描定位', () => {
    const wfDir = setupSession('-proj-b', 'sid-b');
    writeFileSync(join(wfDir, 'wf_run-2.json'), JSON.stringify({ ...RAW_JOURNAL, runId: 'wf_run-2', taskId: 'wtB' }));
    const p = resolveJournalPath({ sessionId: 'sid-b', projectHint: 'b', taskId: 'wtB' });
    assert.ok(p && p.endsWith('wf_run-2.json'));
  });

  it('坏 runId（路径分隔符）→ null', () => {
    setupSession('-proj-c', 'sid-c');
    assert.equal(resolveJournalPath({ sessionId: 'sid-c', projectHint: 'c', runId: '../../etc/passwd' }), null);
    assert.equal(resolveJournalPath({ sessionId: 'sid-c', projectHint: 'c', runId: 'wf_/nope' }), null);
  });

  it('文件不存在 → null', () => {
    setupSession('-proj-d', 'sid-d');
    assert.equal(resolveJournalPath({ sessionId: 'sid-d', projectHint: 'd', runId: 'wf_missing' }), null);
  });

  it('resolveWorkflowsDir 指向 <session>/workflows', () => {
    setupSession('-proj-e', 'sid-e');
    const dir = resolveWorkflowsDir('sid-e', 'e');
    assert.ok(dir && dir.endsWith(join('sid-e', 'workflows')));
  });
});
