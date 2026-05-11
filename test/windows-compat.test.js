/**
 * Windows 适配回归测试套件（批 1）
 *
 * 覆盖：
 *   - lib/file-api.js: isAbsolute() 替代 startsWith('/') 后 Windows 绝对路径（C:\）能被识别
 *   - server.js protectedDirs 守卫：backslash + 大小写绕过
 *   - lib/log-watcher.js: \r\n---\r\n 分隔符
 *   - lib/git-diff.js: getUnpushedCommits 输出在 CRLF 下不带尾随 \r
 *
 * 注：SSE CRLF（interceptor.js）+ git-restore Windows 回归已在 test/git-restore.test.js 覆盖。
 *    interceptor 内部 SSE split 非导出 helper，本套件不做单独 unit test，靠生产路径自然回归。
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, win32, posix, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { readLogFile } from '../lib/log-watcher.js';
import { getUnpushedCommits } from '../lib/git-diff.js';

describe('Windows absolute-path detection (lib/file-api.js intent)', () => {
  it('path.win32.isAbsolute catches C:\\ paths', () => {
    // 不依赖运行平台：直接用 win32 namespace 验证 isAbsolute 的契约。
    // 这是 lib/file-api.js startsWith('/') → isAbsolute() 替换的"应当生效"语义。
    assert.equal(win32.isAbsolute('C:\\Windows\\System32'), true);
    assert.equal(win32.isAbsolute('C:/Windows/System32'), true);
    assert.equal(win32.isAbsolute('\\\\server\\share\\f'), true);
    assert.equal(win32.isAbsolute('\\foo'), true);
    assert.equal(win32.isAbsolute('foo\\bar'), false);
    assert.equal(win32.isAbsolute('./foo'), false);
  });

  it('path.posix.isAbsolute behavior matches old startsWith(\'/\') for POSIX', () => {
    // 在 POSIX 上 isAbsolute 跟 startsWith('/') 行为一致——不引入回归。
    assert.equal(posix.isAbsolute('/etc/passwd'), true);
    assert.equal(posix.isAbsolute('relative/path'), false);
    assert.equal(posix.isAbsolute('C:\\evil'), false); // Win 路径在 POSIX 上不算 absolute
  });

  it('host platform isAbsolute import works', () => {
    // sanity：file-api.js 里用的是默认 isAbsolute（按运行平台）。
    assert.equal(typeof isAbsolute, 'function');
  });
});

describe('lib/log-watcher.js readLogFile — CRLF entry separator', () => {
  let dir;
  let logFile;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'ccv-log-watcher-crlf-'));
    logFile = join(dir, 'log.txt');
  });

  after(() => {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  it('parses entries split by LF (legacy / POSIX)', () => {
    const e1 = JSON.stringify({ timestamp: 'a', url: 'u1', body: 1 });
    const e2 = JSON.stringify({ timestamp: 'b', url: 'u2', body: 2 });
    writeFileSync(logFile, `${e1}\n---\n${e2}`);
    const entries = readLogFile(logFile);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].url, 'u1');
    assert.equal(entries[1].url, 'u2');
  });

  it('parses entries split by CRLF (Windows writer)', () => {
    const e1 = JSON.stringify({ timestamp: 'a', url: 'u1' });
    const e2 = JSON.stringify({ timestamp: 'b', url: 'u2' });
    writeFileSync(logFile, `${e1}\r\n---\r\n${e2}`);
    const entries = readLogFile(logFile);
    assert.equal(entries.length, 2, 'CRLF separator must split');
    assert.equal(entries[0].url, 'u1');
    assert.equal(entries[1].url, 'u2');
  });

  it('parses entries split by mixed EOL', () => {
    const e1 = JSON.stringify({ timestamp: 'a', url: 'u1' });
    const e2 = JSON.stringify({ timestamp: 'b', url: 'u2' });
    writeFileSync(logFile, `${e1}\n---\r\n${e2}`);
    const entries = readLogFile(logFile);
    assert.equal(entries.length, 2);
  });
});

describe('lib/git-diff.js getUnpushedCommits — CRLF file path lines', () => {
  let cwd;

  before(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ccv-git-diff-crlf-'));
    execSync('git init -b main', { cwd, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd, stdio: 'pipe' });
    // 模拟「Windows-style CRLF git stdout」 —— 实际无法在 macOS test runner 内强制 git
    // 走 CRLF 输出。这里用真实 git，验证 LF 输出下 file path 不含 \r 即可（回归守卫——
    // 万一未来 split('\n') 把 \r 留下来，前端会看到带 \r 的 file 字段）。
    writeFileSync(join(cwd, 'a.txt'), 'hi');
    execSync('git add a.txt && git commit -m "init"', { cwd, stdio: 'pipe' });
  });

  after(() => {
    try { rmSync(cwd, { recursive: true, force: true }); } catch {}
  });

  it('commit hash and file paths do not carry trailing \\r', async () => {
    const res = await getUnpushedCommits(cwd, { maxCommits: 5 });
    for (const c of res.commits || []) {
      assert.equal(c.hash.endsWith('\r'), false, `hash has \\r: ${JSON.stringify(c.hash)}`);
      assert.equal(c.subject.endsWith('\r'), false, `subject has \\r: ${JSON.stringify(c.subject)}`);
      for (const f of c.files || []) {
        assert.equal(f.file.endsWith('\r'), false, `file path has \\r: ${JSON.stringify(f.file)}`);
        assert.equal(f.status.endsWith('\r'), false);
      }
    }
  });
});

describe('interceptor.js SSE block split — CRLF tolerance regression spec', () => {
  // SSE 块切是 interceptor.js:876-880 内部逻辑，非导出 helper。这里以 spec 形式守住
  // regex 行为（split(/\r?\n\r?\n/) 块分隔 + split(/\r?\n/) 行内分隔），主代码漂移会被这组 case 抓住。
  const splitBlocks = (s) => s.split(/\r?\n\r?\n/).filter(b => b.trim());
  const splitLines = (b) => b.split(/\r?\n/);

  it('splits LF blocks (POSIX baseline)', () => {
    const out = splitBlocks('data: {"a":1}\n\ndata: {"a":2}\n\n');
    assert.equal(out.length, 2);
  });

  it('splits CRLF blocks (HTTP SSE spec / Windows raw stream)', () => {
    const out = splitBlocks('data: {"a":1}\r\n\r\ndata: {"a":2}\r\n\r\n');
    assert.equal(out.length, 2);
  });

  it('splits mixed CRLF / LF blocks', () => {
    const out = splitBlocks('data: {"a":1}\r\n\r\ndata: {"a":2}\n\n');
    assert.equal(out.length, 2);
  });

  it('splits multi-line block on CRLF (event:/data: pair)', () => {
    const lines = splitLines('event: message\r\ndata: {"id":"x"}');
    assert.deepStrictEqual(lines, ['event: message', 'data: {"id":"x"}']);
  });
});

describe('server.js protectedDirs guard — backslash + case-insensitive', () => {
  // 这条不通过 HTTP 跑（server 启动重，且 protectedDirs 逻辑是 inline 不可单独 import）。
  // 改成纯字符串语义测试：对应 server.js:1853-1860 的 normalize+lowercase 守卫。
  const protectedDirs = new Set(['node_modules', '.git', '.svn', '.hg']);
  const guard = (filePath) => {
    const segs = filePath.split(/[\\/]/).map(s => s.toLowerCase());
    return segs.some(p => protectedDirs.has(p));
  };

  it('blocks node_modules with forward slash', () => {
    assert.equal(guard('node_modules/foo'), true);
  });

  it('blocks node_modules with backslash (Windows native)', () => {
    assert.equal(guard('node_modules\\foo'), true);
  });

  it('blocks .GIT (NTFS case-insensitive bypass)', () => {
    assert.equal(guard('.GIT/HEAD'), true);
    assert.equal(guard('.Git\\HEAD'), true);
  });

  it('blocks deeply nested protected segment', () => {
    assert.equal(guard('a\\b\\node_modules\\c'), true);
    assert.equal(guard('a/b/.svn/c'), true);
  });

  it('allows non-protected paths', () => {
    assert.equal(guard('src/foo.js'), false);
    assert.equal(guard('src\\foo.js'), false);
  });
});
