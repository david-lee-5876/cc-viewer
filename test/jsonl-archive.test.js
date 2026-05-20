import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync, statSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { archiveJsonl, resolveJsonlPath, getExtractCacheRoot } from '../server/lib/jsonl-archive.js';
import { archiveLogFiles } from '../server/lib/log-management.js';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');

function makeJsonlContent(n = 3) {
  const lines = [];
  for (let i = 0; i < n; i++) {
    lines.push(JSON.stringify({ timestamp: `2026-05-01T00:00:0${i}Z`, url: '/v1/messages', i }));
  }
  return lines.join('\n---\n') + '\n---\n';
}

describe('jsonl-archive', { concurrency: false }, () => {
  let workDir;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'ccv-archive-test-'));
  });

  it('archiveJsonl 成功路径：zip 存在 + 原文件已删 + 内容可读', () => {
    const jsonl = join(workDir, 'session_20260501_120000.jsonl');
    writeFileSync(jsonl, makeJsonlContent(5));

    const result = archiveJsonl(jsonl);
    assert.equal(result.ok, true);
    assert.equal(result.zipPath, jsonl + '.zip');
    assert.equal(existsSync(jsonl), false, '原 .jsonl 文件应被删除');
    assert.equal(existsSync(result.zipPath), true, '.jsonl.zip 应存在');

    const zip = new AdmZip(result.zipPath);
    const entries = zip.getEntries();
    assert.equal(entries.length, 1);
    const content = entries[0].getData().toString('utf-8');
    assert.equal(content, makeJsonlContent(5));
  });

  it('目标 .jsonl.zip 已存在 → skipped + 原文件保留', () => {
    const jsonl = join(workDir, 'a.jsonl');
    writeFileSync(jsonl, makeJsonlContent(2));
    writeFileSync(jsonl + '.zip', 'pre-existing zip placeholder');

    const result = archiveJsonl(jsonl);
    assert.equal(result.ok, false);
    assert.equal(result.skipped, 'target-exists');
    assert.equal(existsSync(jsonl), true, '原文件应保留');
    assert.equal(readFileSync(jsonl + '.zip', 'utf-8'), 'pre-existing zip placeholder');
  });

  it('resolveJsonlPath 缓存命中：第二次调用不重新写文件', () => {
    const jsonl = join(workDir, 'cached.jsonl');
    writeFileSync(jsonl, makeJsonlContent(4));
    const archiveResult = archiveJsonl(jsonl);
    assert.equal(archiveResult.ok, true);

    const first = resolveJsonlPath(archiveResult.zipPath);
    assert.notEqual(first, archiveResult.zipPath, '应返回临时解压路径');
    const firstStat = statSync(first);

    // 再次调用应命中缓存（mtime + ctime 不变）
    const second = resolveJsonlPath(archiveResult.zipPath);
    assert.equal(second, first);
    const secondStat = statSync(second);
    assert.equal(secondStat.mtimeMs, firstStat.mtimeMs, '缓存命中：mtime 不变（未重写）');

    // 内容一致
    assert.equal(readFileSync(second, 'utf-8'), makeJsonlContent(4));
  });

  it('Zip Slip 防护：恶意 entry 名 "../evil.jsonl" 被拒绝', () => {
    const malicious = join(workDir, 'bad.jsonl.zip');
    const zip = new AdmZip();
    zip.addFile('placeholder.jsonl', Buffer.from('malicious'));
    // adm-zip 的 addFile 会主动 strip 路径穿越前缀；直接改 entryName 才能绕过它，
    // 模拟用户拿到的"已经构造好"的恶意 zip。
    zip.getEntries()[0].entryName = '../evil.jsonl';
    zip.writeZip(malicious);

    assert.throws(
      () => resolveJsonlPath(malicious),
      (err) => err.code === 'ZIP_UNSAFE',
    );
  });

  it('archiveJsonl 拒绝 symlink 源文件', () => {
    const target = join(workDir, 'real.jsonl');
    const link = join(workDir, 'link.jsonl');
    writeFileSync(target, makeJsonlContent(2));
    try { symlinkSync(target, link); } catch (err) {
      // 个别 CI 环境/Windows 无权限创建 symlink，跳过
      if (err.code === 'EPERM' || err.code === 'EACCES') return;
      throw err;
    }
    const result = archiveJsonl(link);
    assert.equal(result.ok, false);
    assert.match(result.error, /regular file/);
    assert.equal(existsSync(link), true, 'symlink 应保留');
    assert.equal(existsSync(target), true, 'target 应保留');
    assert.equal(existsSync(link + '.zip'), false, '不应生成 zip');
  });

  it('archiveLogFiles 拒绝每个 project 的最新文件', () => {
    // 模拟 logDir 结构
    const logDir = join(workDir, 'logs');
    const projectDir = join(logDir, 'demo');
    mkdirSync(projectDir, { recursive: true });
    const older = 'demo_20260101_120000.jsonl';
    const newer = 'demo_20260301_120000.jsonl';
    writeFileSync(join(projectDir, older), makeJsonlContent(2));
    writeFileSync(join(projectDir, newer), makeJsonlContent(3));

    const result = archiveLogFiles(logDir, [`demo/${older}`, `demo/${newer}`]);
    assert.deepEqual(result.archived, [`demo/${older}`]);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].file, `demo/${newer}`);
    assert.equal(result.skipped[0].reason, 'latest-not-allowed');
    assert.equal(existsSync(join(projectDir, older + '.zip')), true);
    assert.equal(existsSync(join(projectDir, older)), false);
    assert.equal(existsSync(join(projectDir, newer)), true, '最新文件应被保留');
  });
});

// 清理 OS tmpdir 下解压缓存（避免污染其他测试）
after(() => {
  try {
    const root = getExtractCacheRoot();
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  } catch { /* tolerant */ }
});
