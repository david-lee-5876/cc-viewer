#!/usr/bin/env node
/**
 * ask-bridge.js — PreToolUse hook bridge for AskUserQuestion.
 *
 * Called by Claude Code when AskUserQuestion tool is about to execute.
 * Reads hook payload from stdin, forwards questions to cc-viewer server
 * via long-poll HTTP, waits for user answers, then outputs updatedInput
 * with answers to bypass the terminal UI.
 *
 * Exit 0 = success (stdout contains hookSpecificOutput with updatedInput)
 * Exit 1 = fallback (Claude Code proceeds with normal terminal UI)
 *
 * Hook config in ~/.claude/settings.json:
 * {
 *   "hooks": {
 *     "PreToolUse": [{
 *       "matcher": "AskUserQuestion",
 *       "hooks": [{ "type": "command", "command": "node /path/to/ask-bridge.js" }]
 *     }]
 *   }
 * }
 */

import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';

const port = process.env.CCVIEWER_PORT;
const rawProtocol = process.env.CCVIEWER_PROTOCOL;
if (rawProtocol && rawProtocol !== 'http' && rawProtocol !== 'https') {
  process.stderr.write(`ask-bridge: invalid CCVIEWER_PROTOCOL "${rawProtocol}" (expected "http" or "https")\n`);
  process.exit(1);
}
const isHttps = rawProtocol === 'https';
const httpClient = isHttps ? https : http;
if (!port) {
  // cc-viewer not running — fall back to terminal UI silently (exit 0)
  // exit(1) causes Claude Code to log "hook error" on every AskUserQuestion call
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
  process.exit(0);
}

let stdinData;
try {
  stdinData = readFileSync(0, 'utf-8');
} catch {
  process.stderr.write('ask-bridge: failed to read stdin\n');
  process.exit(1);
}

if (!stdinData || !stdinData.trim()) {
  process.stderr.write('ask-bridge: empty stdin\n');
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(stdinData);
} catch {
  process.exit(1);
}

const questions = payload?.tool_input?.questions;
if (!Array.isArray(questions) || questions.length === 0) {
  process.exit(1);
}

// 防御性 normalize：claude-code 当前版本会在 PreToolUse hook 之前做 Zod safeParse，所以 hook
// 缺必填字段时根本不会被调用——但为防上游修了 emit→model 的 schema 又把 hook 时序前移，
// 这里把 questions[].options[].description 缺失时补 ""，避免下游 server.js / 前端意外异常。
// 不动 label/question/header（缺这些更可能是上游 bug 而不是合法可补的可选字段）。
for (const q of questions) {
  if (!q || typeof q !== 'object') continue;
  if (!Array.isArray(q.options)) continue;
  for (const opt of q.options) {
    if (opt && typeof opt === 'object' && opt.description === undefined) {
      opt.description = '';
    }
  }
}

// Claude Code 的 PreToolUse hook payload 含 tool_use_id —— 跟 assistant message 里
// AskUserQuestion 那个 tool_use 块的 id 是同一个值。把这个 id 透传给 server 当 Map key，
// 前端 ChatMessage 渲染 inline form 时用同样的 toolId 做严格匹配，portal 才能绑到 modal askSlot。
// 缺失时 server 会 fallback 到自生成 ask_${ts}_${rand}（向后兼容老 Claude Code 版本）。
const toolUseId = payload?.tool_use_id || null;

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function postToViewer() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ questions, toolUseId });
    const req = httpClient.request({
      hostname: '127.0.0.1',
      port: Number(port),
      path: '/api/ask-hook',
      method: 'POST',
      rejectUnauthorized: false, // allow self-signed certs
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid response JSON'));
          }
        } else {
          const err = new Error(`HTTP ${res.statusCode}`);
          err.statusCode = res.statusCode;
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.write(body);
    req.end();
  });
}

try {
  const data = await postToViewer();
  if (!data.answers || typeof data.answers !== 'object' || Array.isArray(data.answers)) {
    // No valid answers → fall back to terminal UI
    process.stderr.write('ask-bridge: No answers in response (falling back to terminal UI)\n');
    process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
    process.exit(0);
  }

  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput: {
        questions,
        answers: data.answers,
      },
    },
  };

  process.stdout.write(JSON.stringify(output) + '\n');
  process.exit(0);
} catch (err) {
  // Server unreachable / saturated → fall back to terminal UI (not auto-allow).
  // 429 is distinct: cc-viewer's pendingAskHooks Map hit ASK_HOOK_MAP_MAX cap and the oldest
  // entry was evicted. Log specifically so users / ops can tell capacity issues from outages.
  if (err.statusCode === 429) {
    process.stderr.write('ask-bridge: cc-viewer ask-hook capacity saturated (HTTP 429), falling back to terminal UI\n');
  } else {
    process.stderr.write(`ask-bridge: ${err.message} (falling back to terminal UI)\n`);
  }
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
  process.exit(0);
}
