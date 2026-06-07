/**
 * Workflow Live (运行中逐帧)
 *
 * workflow run journal（<sessionDir>/workflows/<runId>.json）只在「完成时」一次性落盘，
 * 运行中拿不到。但运行中以下文件在持续增长，可据此实时推导面板：
 *   <sessionDir>/subagents/workflows/<runId>/
 *     ├─ agent-<id>.jsonl        子代理转写（持续增长）→ token / 工具数 / model / prompt
 *     ├─ agent-<id>.meta.json    {"agentType":...}
 *     └─ journal.jsonl           started / result 事件（带 agentId）→ running / done 判定
 *
 * 推导出的模型与 normalizeWorkflowJournal 同形（phases 为空 → 前端走扁平 agent 列表），
 * 完成后由权威的 <runId>.json 快照接管（phase 分组）。
 *
 * token 口径：input + output + cache_creation（运行中单调增；与完成快照略有出入，完成时被
 * 权威值替换）。工具数与快照一致（统计 tool_use 块）。
 */

import { existsSync, readFileSync, statSync, readdirSync, realpathSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { getClaudeConfigDir } from '../../findcc.js';
import { findTranscriptPath } from './session-transcript-reader.js';
import { _RUN_ID_RE as RUN_ID_RE } from './workflow-journal.js';

const MAX_AGENT_BYTES = 64 * 1024 * 1024;
const LABEL_MAX = 80;

function projectsDir() {
  return process.env.CCV_PROJECTS_DIR || join(getClaudeConfigDir(), 'projects');
}

/** sessionId(+hint) → <sessionDir>/subagents/workflows/<runId>（可能不存在）。 */
export function resolveRunDir(sessionId, projectHint, runId) {
  if (!sessionId || !runId) return null;
  // 与完成态 journal 同一 runId 校验：拒绝含路径分隔符/`..` 的 runId，防穿越到其他 run/session 目录。
  if (!RUN_ID_RE.test(runId)) return null;
  const transcript = findTranscriptPath(sessionId, projectHint);
  if (!transcript) return null;
  return join(dirname(transcript), sessionId, 'subagents', 'workflows', runId);
}

function isInsideProjectsDir(realPath) {
  let root;
  try { root = realpathSync(projectsDir()); } catch { return false; }
  return realPath === root || realPath.startsWith(root + sep);
}

/** 从 workflows/scripts/<name>-<runId>.js 反推 workflowName（运行中即可拿到）。 */
function deriveWorkflowName(sessionDir, runId) {
  try {
    const scriptsDir = join(sessionDir, 'workflows', 'scripts');
    for (const f of readdirSync(scriptsDir)) {
      if (f.endsWith(`-${runId}.js`)) return f.slice(0, -(`-${runId}.js`.length));
    }
  } catch {}
  return '';
}

// 每文件解析缓存：filePath → { sig, parsed }，sig=mtimeMs:size，避免每帧重解析未变 agent。
const _agentParseCache = new Map();

function parseAgentFile(filePath) {
  let sig;
  try { const st = statSync(filePath); sig = `${st.mtimeMs}:${st.size}`; } catch { return null; }
  const cached = _agentParseCache.get(filePath);
  if (cached && cached.sig === sig) return cached.parsed;

  const parsed = { tokens: 0, toolCalls: 0, lastToolName: '', model: '', prompt: '', startedAt: null, lastProgressAt: null };
  try {
    if (statSync(filePath).size > MAX_AGENT_BYTES) return parsed;
    const lines = readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
      if (!line) continue;
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      const ts = Date.parse(o.timestamp || '');
      if (!Number.isNaN(ts)) {
        if (parsed.startedAt === null) parsed.startedAt = ts;
        parsed.lastProgressAt = ts;
      }
      const msg = o.message;
      if (!msg) continue;
      if (o.type === 'user' && !parsed.prompt && typeof msg.content === 'string') {
        parsed.prompt = msg.content;
      }
      if (typeof msg.model === 'string' && msg.model) parsed.model = msg.model;
      const u = msg.usage;
      if (u) parsed.tokens += (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0);
      if (Array.isArray(msg.content)) {
        for (const b of msg.content) {
          if (b && b.type === 'tool_use') { parsed.toolCalls++; if (b.name) parsed.lastToolName = b.name; }
        }
      }
    }
  } catch { /* 半写入/读错 → 返回已累计部分 */ }

  _agentParseCache.set(filePath, { sig, parsed });
  return parsed;
}

function readResumeJournal(runDir) {
  const started = new Set();
  const done = new Set();
  try {
    const lines = readFileSync(join(runDir, 'journal.jsonl'), 'utf-8').split('\n');
    for (const line of lines) {
      if (!line) continue;
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      if (!o.agentId) continue;
      if (o.type === 'started') started.add(o.agentId);
      else if (o.type === 'result') done.add(o.agentId);
    }
  } catch {}
  return { started, done };
}

function labelFromPrompt(prompt, agentType) {
  if (prompt) {
    const firstLine = prompt.split('\n').map(s => s.trim()).find(Boolean) || '';
    if (firstLine) return firstLine.length > LABEL_MAX ? firstLine.slice(0, LABEL_MAX) + '…' : firstLine;
  }
  return agentType || '';
}

/**
 * 从 runDir 实时推导面板模型（与 normalizeWorkflowJournal 同形，phases 为空）。
 * 无 agent 文件 → null。
 */
export function deriveLiveJournal(runDir, runId) {
  if (!runDir || !existsSync(runDir)) return null;
  let real;
  try { real = realpathSync(runDir); } catch { return null; }
  if (!isInsideProjectsDir(real)) return null;

  let files;
  try { files = readdirSync(runDir); } catch { return null; }
  const agentFiles = files.filter(f => f.startsWith('agent-') && f.endsWith('.jsonl'));
  if (agentFiles.length === 0) return null;

  const { started, done } = readResumeJournal(runDir);
  // sessionDir = runDir 上溯三级（runId → workflows → subagents → sessionDir）
  const sessionDir = dirname(dirname(dirname(runDir)));
  const workflowName = deriveWorkflowName(sessionDir, runId);

  const agents = [];
  let totalTokens = 0, totalToolCalls = 0;
  for (const f of agentFiles) {
    const agentId = f.slice('agent-'.length, -'.jsonl'.length);
    const parsed = parseAgentFile(join(runDir, f));
    if (!parsed) continue;
    let agentType = '';
    try { agentType = JSON.parse(readFileSync(join(runDir, `agent-${agentId}.meta.json`), 'utf-8')).agentType || ''; } catch {}
    const state = done.has(agentId) ? 'done' : (started.has(agentId) ? 'running' : 'running');
    totalTokens += parsed.tokens;
    totalToolCalls += parsed.toolCalls;
    agents.push({
      index: null,
      label: labelFromPrompt(parsed.prompt, agentType),
      phaseIndex: null,
      phaseTitle: '',
      agentId,
      agentType,
      model: parsed.model,
      state,
      tokens: parsed.tokens,
      toolCalls: parsed.toolCalls,
      durationMs: (parsed.startedAt && parsed.lastProgressAt) ? (parsed.lastProgressAt - parsed.startedAt) : null,
      lastToolName: parsed.lastToolName,
      lastToolSummary: '',
      startedAt: parsed.startedAt,
      lastProgressAt: parsed.lastProgressAt,
    });
  }

  agents.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  const allDone = agents.length > 0 && agents.every(a => a.state === 'done');
  const startTime = agents.reduce((min, a) => (a.startedAt && (min === null || a.startedAt < min)) ? a.startedAt : min, null);

  return {
    runId: runId || '',
    taskId: '',
    workflowName,
    summary: '',
    status: allDone ? 'finishing' : 'running',
    durationMs: null,
    agentCount: agents.length,
    totalTokens,
    totalToolCalls,
    defaultModel: '',
    startTime,
    phases: [],
    agents,
    live: true,
  };
}
