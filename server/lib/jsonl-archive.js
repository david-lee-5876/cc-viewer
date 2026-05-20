import {
  existsSync, statSync, lstatSync, mkdirSync, renameSync, unlinkSync,
  writeFileSync, readFileSync, readdirSync, rmSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { validateZipEntries } from './zip-safety.js';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');

const CACHE_ROOT_NAME = 'ccv-extract';
const RENAME_RETRY = 3;
const RENAME_DELAY_MS = 50;
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
// 与 server/lib/log-management.js 的 MAX_MERGE_SIZE 对齐：merge 上限 400MB，归档 / 读回 zip
// 必须容纳这一规模，否则自家产物会被 zip-safety 默认 50MB 阈值拦住造成永久不可读。
const ARCHIVE_MAX_BYTES = 400 * 1024 * 1024;

function syncSleep(ms) {
  // Atomics.wait 在主线程上真睡眠（不像 busy-wait 占满 CPU 或阻塞 event-loop heuristics）
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function renameWithRetry(from, to) {
  let lastErr;
  for (let i = 0; i < RENAME_RETRY; i++) {
    try { renameSync(from, to); return; }
    catch (err) {
      lastErr = err;
      if (i < RENAME_RETRY - 1 && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES')) {
        syncSleep(RENAME_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export function getExtractCacheRoot() {
  return join(tmpdir(), CACHE_ROOT_NAME);
}

function pathHash(absPath) {
  return createHash('sha1').update(absPath).digest('hex').slice(0, 16);
}

export function archiveJsonl(absJsonlPath) {
  if (!absJsonlPath.endsWith('.jsonl')) return { ok: false, error: 'Not a .jsonl file' };
  if (!existsSync(absJsonlPath)) return { ok: false, error: 'Source file not found' };

  // 拒绝 symlink 源：避免归档目标外文件并删除链接造成信息错乱
  try {
    const lst = lstatSync(absJsonlPath);
    if (!lst.isFile()) return { ok: false, error: 'Source is not a regular file' };
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const zipPath = absJsonlPath + '.zip';
  if (existsSync(zipPath)) {
    return { ok: false, skipped: 'target-exists', error: 'Target .zip already exists' };
  }

  const tmpPath = `${zipPath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  try {
    const zip = new AdmZip();
    zip.addLocalFile(absJsonlPath);
    for (const e of zip.getEntries()) {
      if (e.header) e.header.flags = (e.header.flags || 0) | 0x800;
    }
    zip.writeZip(tmpPath);

    if (!existsSync(tmpPath) || statSync(tmpPath).size === 0) {
      throw new Error('Generated zip is empty');
    }

    renameWithRetry(tmpPath, zipPath);
    try { unlinkSync(absJsonlPath); }
    catch (err) {
      // 罕见：zip 已 rename 成功但原 .jsonl 删除失败（AV 扫描 / Windows 句柄占用 / 权限）。
      // 此时两份共存，下次列表 regex 会同时显示，再次归档会撞"Target exists"死锁。
      // 回滚策略：删掉刚 rename 出来的 zip，原文件原位保留，调用方收到 failed → 用户可重试。
      try { unlinkSync(zipPath); } catch { /* zip rollback 失败也容忍：极端边界 */ }
      return { ok: false, error: `archived but failed to delete source: ${err.message}` };
    }
    return { ok: true, zipPath };
  } catch (err) {
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch { /* ignore */ }
    return { ok: false, error: err.message };
  }
}

export function resolveJsonlPath(absPath) {
  if (typeof absPath !== 'string') return absPath;
  if (absPath.endsWith('.jsonl') && existsSync(absPath)) return absPath;

  let zipPath = null;
  if (absPath.endsWith('.jsonl.zip')) zipPath = absPath;
  else if (absPath.endsWith('.jsonl')) {
    const candidate = absPath + '.zip';
    if (existsSync(candidate)) zipPath = candidate;
  }

  if (!zipPath || !existsSync(zipPath)) return absPath;
  return extractZipSync(zipPath);
}

function extractZipSync(zipPath) {
  const cacheKey = pathHash(zipPath);
  const cacheDir = join(getExtractCacheRoot(), cacheKey);
  const targetName = basename(zipPath, '.zip');
  const tmpFile = join(cacheDir, targetName);
  const sidecar = join(cacheDir, '.meta.json');

  const zipStat = statSync(zipPath);
  const expectedMeta = { srcMtimeMs: zipStat.mtimeMs, srcSize: zipStat.size };

  if (existsSync(tmpFile) && existsSync(sidecar)) {
    try {
      const meta = JSON.parse(readFileSync(sidecar, 'utf-8'));
      if (meta.srcMtimeMs === expectedMeta.srcMtimeMs && meta.srcSize === expectedMeta.srcSize) {
        return tmpFile;
      }
    } catch { /* fall through to re-extract */ }
  }

  mkdirSync(cacheDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  validateZipEntries(entries, cacheDir, {
    maxEntries: 5,
    requireExtension: '.jsonl',
    maxPerFile: ARCHIVE_MAX_BYTES,
    maxTotal: ARCHIVE_MAX_BYTES,
  });

  const fileEntry = entries.find(e => !e.isDirectory && e.entryName.toLowerCase().endsWith('.jsonl'));
  if (!fileEntry) {
    throw Object.assign(new Error('No .jsonl entry found in zip'), { code: 'ZIP_UNSAFE' });
  }

  const partial = `${tmpFile}.partial.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  try {
    writeFileSync(partial, fileEntry.getData());
    renameWithRetry(partial, tmpFile);
    writeFileSync(sidecar, JSON.stringify(expectedMeta));
  } catch (err) {
    try { if (existsSync(partial)) unlinkSync(partial); } catch { /* ignore */ }
    throw err;
  }

  return tmpFile;
}

export function cleanupExtractCache() {
  try {
    const root = getExtractCacheRoot();
    if (!existsSync(root)) return;
    const now = Date.now();
    for (const ent of readdirSync(root, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const subDir = join(root, ent.name);
      try {
        const stat = statSync(subDir);
        // 用 mtimeMs（解压完成时间）而非 atimeMs：macOS / Linux 默认 noatime/relatime
        // 下 atime 几乎不更新，会让 cache 永不过期或被错误提前回收。mtime 由 mkdirSync /
        // 重新解压 rename 触发，能准确反映"最近一次解压时间"。
        if (now - stat.mtimeMs > CACHE_TTL_MS) {
          rmSync(subDir, { recursive: true, force: true });
        }
      } catch { /* tolerate one bad entry */ }
    }
  } catch (err) {
    console.warn('[ccv-extract] cleanup failed:', err.message);
  }
}
