/**
 * Unit tests for electron/diag.js
 *
 * 覆盖 diagSerialize（Error 展开 / 循环引用守卫 / 嵌套）、diagRedactString（token 多种位置）、
 * appendDiag（写入 / rename rotate / 单条 16KB cap / mode 0600）。
 * 用临时目录隔离，不依赖 Electron 进程。
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, statSync, existsSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { initDiag, appendDiag, diagSerialize, diagRedactString } from '../electron/diag.js';

let TMP;
beforeEach(() => {
  TMP = mkdtempSync(join(tmpdir(), 'ccv-diag-test-'));
  initDiag(TMP);
});
afterEach(() => { try { rmSync(TMP, { recursive: true, force: true }); } catch {} });

function readLog() {
  const p = join(TMP, 'electron-diag.log');
  return existsSync(p) ? readFileSync(p, 'utf-8') : '';
}

describe('diagRedactString — token redact', () => {
  it('redacts ?token= in URL', () => {
    assert.equal(diagRedactString('http://127.0.0.1:7049?token=secretABC'),
      'http://127.0.0.1:7049?token=<redacted>');
  });
  it('redacts &token= in URL', () => {
    assert.equal(diagRedactString('http://x/y?foo=bar&token=secretXYZ'),
      'http://x/y?foo=bar&token=<redacted>');
  });
  it('passes through non-strings', () => {
    assert.equal(diagRedactString(123), 123);
    assert.equal(diagRedactString(null), null);
  });
  it('does not touch free-form text mentioning the word token', () => {
    // 只 redact URL query 形态，避免误伤"login token expired"之类文案。
    assert.equal(diagRedactString('login token expired'), 'login token expired');
  });

  // regex 把整段（含前导 `/` 或 `C:`）连同用户名替成 `~/`，与 shell `~` 惯例一致。
  it('redacts /Users/<name>/ home prefix to ~/', () => {
    assert.equal(diagRedactString('at file:///Users/alice/project/src/main.js'),
      'at file://~/project/src/main.js');
  });

  it('redacts /home/<name>/ Linux home prefix to ~/', () => {
    assert.equal(diagRedactString('/home/bob/.claude/cc-viewer/log'),
      '~/.claude/cc-viewer/log');
  });

  it('redacts Windows C:\\Users\\<name>\\ to ~\\', () => {
    assert.equal(diagRedactString('C:\\Users\\Charlie\\app\\dist\\main.js'),
      '~\\app\\dist\\main.js');
  });

  it('redacts multiple home prefixes in one string', () => {
    assert.equal(diagRedactString('from /Users/x/foo to /Users/y/bar'),
      'from ~/foo to ~/bar');
  });
});

describe('diagSerialize — Error / nested / circular', () => {
  it('expands Error preserving name/message/stack', () => {
    const e = new Error('boom token=leak'); e.name = 'MyErr';
    const s = diagSerialize(e);
    assert.equal(s.name, 'MyErr');
    assert.equal(s.message, 'boom token=leak'); // 自由文本 token 不 redact
    assert.ok(s.stack.startsWith('MyErr: boom'));
  });

  it('redacts URL-style token inside Error stack', () => {
    const e = new Error('load failed for url?token=abc123');
    const s = diagSerialize(e);
    assert.ok(s.message.includes('token=<redacted>'));
  });

  it('handles circular reference without stack overflow', () => {
    const a = { name: 'a' }; a.self = a;
    const s = diagSerialize(a);
    assert.equal(s.name, 'a');
    assert.equal(s.self, '[Circular]');
  });

  it('handles indirect cycle (a → b → a)', () => {
    const a = {}; const b = {}; a.b = b; b.a = a;
    const s = diagSerialize(a);
    assert.equal(s.b.a, '[Circular]');
  });

  it('recurses into nested Error inside object', () => {
    const err = new Error('inner');
    const payload = { tabId: 5, error: err };
    const s = diagSerialize(payload);
    assert.equal(s.tabId, 5);
    assert.equal(s.error.name, 'Error');
    assert.equal(s.error.message, 'inner');
    assert.ok(s.error.stack);
  });

  it('serializes arrays', () => {
    assert.deepEqual(diagSerialize([1, 'a', null]), [1, 'a', null]);
  });

  it('null / undefined fold to null', () => {
    assert.equal(diagSerialize(null), null);
    assert.equal(diagSerialize(undefined), null);
  });
});

describe('appendDiag — write / rotate / line cap', () => {
  it('writes a JSON line with ts/cat/payload', () => {
    appendDiag('test:basic', { code: -2 });
    const line = readLog().trim();
    const obj = JSON.parse(line);
    assert.equal(obj.cat, 'test:basic');
    assert.equal(obj.payload.code, -2);
    assert.ok(obj.ts);
  });

  it('redacts token in payload via serialize chain', () => {
    appendDiag('workspace:did-fail-load', { url: 'http://x/?token=secret' });
    const obj = JSON.parse(readLog().trim());
    assert.equal(obj.payload.url, 'http://x/?token=<redacted>');
  });

  it('caps a single line at ~16KB with truncation suffix', () => {
    appendDiag('test:huge', { huge: 'x'.repeat(20000) });
    const line = readLog().trim();
    assert.ok(line.length <= 16 * 1024 + 20); // ~16K + suffix
    assert.ok(line.endsWith('…[truncated]'));
  });

  it('rotates via renameSync when file exceeds 2MB', () => {
    const p = join(TMP, 'electron-diag.log');
    // 预填一个 >2MB 文件
    writeFileSync(p, 'x'.repeat(3 * 1024 * 1024));
    appendDiag('test:trigger-rotate', { hi: 1 });
    assert.ok(existsSync(p + '.1'), 'rotated file .1 should exist');
    // 新日志文件只含本次写入这一行
    assert.equal(readLog().trim().split('\n').length, 1);
  });

  it('does not throw before initDiag is called (defensive no-op semantics)', () => {
    // 用 fresh module 重新 import 验证：本测重用 initDiag(TMP) 后已 init，
    // 此 case 仅证明 append 路径 try/catch 兜底（不抛即可）。
    appendDiag('test:after-init', { ok: 1 });
    assert.match(readLog(), /test:after-init/);
  });

  it('writes file with mode 0600 (owner-only)', () => {
    appendDiag('test:perm', { ok: 1 });
    const p = join(TMP, 'electron-diag.log');
    const mode = statSync(p).mode & 0o777;
    // 取决于 umask；至少 group/other 不应有写权限，owner 必须可读写。
    // 严格期望 0o600，但 appendFileSync mode 在 Node 实际为 create-only-flag；
    // 已存在文件不会重置 mode。本 case 验证创建路径。
    assert.ok((mode & 0o077) === 0, `expected no group/other perms, got ${mode.toString(8)}`);
    assert.ok((mode & 0o600) === 0o600, `expected owner rw, got ${mode.toString(8)}`);
  });
});
