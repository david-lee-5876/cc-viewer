import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bridgePath = join(__dirname, '..', 'lib', 'ask-bridge.js');

function runBridge(stdin, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bridgePath], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    if (stdin !== null) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

describe('ask-bridge.js', () => {
  it('exits 0 silently when CCVIEWER_PORT is not set', async () => {
    const { code, stdout } = await runBridge('{}', { CCVIEWER_PORT: '' });
    assert.equal(code, 0);
    const output = JSON.parse(stdout.trim());
    assert.equal(output.continue, true);
    assert.equal(output.suppressOutput, true);
  });

  it('exits 1 when stdin is invalid JSON', async () => {
    const { code } = await runBridge('not-json', { CCVIEWER_PORT: '9999' });
    assert.equal(code, 1);
  });

  it('exits 1 when questions are missing', async () => {
    const input = JSON.stringify({ tool_input: {} });
    const { code } = await runBridge(input, { CCVIEWER_PORT: '9999' });
    assert.equal(code, 1);
  });

  it('exits 1 when questions array is empty', async () => {
    const input = JSON.stringify({ tool_input: { questions: [] } });
    const { code } = await runBridge(input, { CCVIEWER_PORT: '9999' });
    assert.equal(code, 1);
  });

  it('falls back to terminal UI when server is unreachable', async () => {
    const input = JSON.stringify({
      tool_input: {
        questions: [{ question: 'Q?', header: 'H', options: [{ label: 'A' }], multiSelect: false }],
      },
    });
    const { code, stdout, stderr } = await runBridge(input, { CCVIEWER_PORT: '19999' });
    assert.equal(code, 0);
    const output = JSON.parse(stdout.trim());
    assert.equal(output.continue, true);
    assert.ok(stderr.includes('ask-bridge'));
  });

  describe('with mock server', () => {
    let server;
    let port;

    beforeEach(async () => {
      server = createServer();
      await new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          port = server.address().port;
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise((resolve) => server.close(resolve));
    });

    it('exits 0 and outputs correct JSON when server returns answers', async () => {
      // 真实 Claude Code 调用都带 description（schema 必填）；这里也带上避免 normalize 改写 payload
      const questions = [
        { question: 'Which?', header: 'Q', options: [{ label: 'A', description: 'a' }, { label: 'B', description: 'b' }], multiSelect: false },
      ];
      const answers = { 'Which?': 'A' };

      server.on('request', (req, res) => {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          const data = JSON.parse(body);
          assert.deepEqual(data.questions, questions);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ answers }));
        });
      });

      const input = JSON.stringify({ tool_input: { questions } });
      const { code, stdout } = await runBridge(input, { CCVIEWER_PORT: String(port) });

      assert.equal(code, 0);
      const output = JSON.parse(stdout.trim());
      assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse');
      assert.equal(output.hookSpecificOutput.permissionDecision, 'allow');
      assert.deepEqual(output.hookSpecificOutput.updatedInput.answers, answers);
      assert.deepEqual(output.hookSpecificOutput.updatedInput.questions, questions);
    });

    it('normalizes options[].description to "" when missing before forwarding', async () => {
      // 防御 upstream schema 修了 / hook 移到 validation 前的兜底场景
      const questions = [
        { question: 'Q?', header: 'H', options: [{ label: 'X' }, { label: 'Y' }], multiSelect: false },
      ];
      const answers = { 'Q?': 'X' };

      let received;
      server.on('request', (req, res) => {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          received = JSON.parse(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ answers }));
        });
      });

      const input = JSON.stringify({ tool_input: { questions } });
      const { code } = await runBridge(input, { CCVIEWER_PORT: String(port) });

      assert.equal(code, 0);
      assert.equal(received.questions[0].options[0].description, '');
      assert.equal(received.questions[0].options[1].description, '');
      assert.equal(received.questions[0].options[0].label, 'X');
    });

    it('falls back to terminal UI when server returns non-200', async () => {
      server.on('request', (_req, res) => {
        res.writeHead(500);
        res.end('error');
      });

      const input = JSON.stringify({
        tool_input: {
          questions: [{ question: 'Q?', header: 'H', options: [{ label: 'A' }], multiSelect: false }],
        },
      });
      const { code, stdout } = await runBridge(input, { CCVIEWER_PORT: String(port) });
      assert.equal(code, 0);
      const output = JSON.parse(stdout.trim());
      assert.equal(output.continue, true);
    });

    it('falls back to terminal UI when server returns no answers', async () => {
      server.on('request', (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ noAnswers: true }));
      });

      const input = JSON.stringify({
        tool_input: {
          questions: [{ question: 'Q?', header: 'H', options: [{ label: 'A' }], multiSelect: false }],
        },
      });
      const { code, stdout } = await runBridge(input, { CCVIEWER_PORT: String(port) });
      assert.equal(code, 0);
      const output = JSON.parse(stdout.trim());
      assert.equal(output.continue, true);
    });

    it('outputs PreToolUse deny when server returns cancelled=true (web user cancelled the ask)', async () => {
      // 用户在 cc-viewer web UI 点 Cancel 或在输入框打字打断 → server.js ask-cancel handler
      // 给 hook res 回 200 + { cancelled: true, reason }。ask-bridge 必须把这个翻成 PreToolUse
      // hook deny，让 Claude Code 走兜底链：toolExecution.ts 把 deny.message 包装成
      // tool_result.is_error=true，配对完整后下一轮 API 不会 400。
      server.on('request', (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ cancelled: true, reason: 'User aborted' }));
      });

      const input = JSON.stringify({
        tool_input: {
          questions: [{ question: 'Q?', header: 'H', options: [{ label: 'A' }], multiSelect: false }],
        },
      });
      const { code, stdout } = await runBridge(input, { CCVIEWER_PORT: String(port) });
      assert.equal(code, 0);
      const output = JSON.parse(stdout.trim());
      assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse');
      assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
      // [cc-viewer:cancel] 前缀是协议级 sentinel，toolResultBuilder 用它区分 cancelled vs rejected
      assert.equal(output.hookSpecificOutput.permissionDecisionReason, '[cc-viewer:cancel] User aborted');
    });

    it('cancelled=true with no reason falls back to default reason text', async () => {
      // server 端 reason 字段缺失 / 空 → 用默认文案 "User aborted by cc-viewer"
      server.on('request', (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ cancelled: true }));
      });

      const input = JSON.stringify({
        tool_input: {
          questions: [{ question: 'Q?', header: 'H', options: [{ label: 'A' }], multiSelect: false }],
        },
      });
      const { code, stdout } = await runBridge(input, { CCVIEWER_PORT: String(port) });
      assert.equal(code, 0);
      const output = JSON.parse(stdout.trim());
      assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
      assert.match(output.hookSpecificOutput.permissionDecisionReason, /^\[cc-viewer:cancel\]/);
      assert.match(output.hookSpecificOutput.permissionDecisionReason, /cc-viewer/i);
    });
  });
});
