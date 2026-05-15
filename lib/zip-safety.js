import { resolve, sep, posix } from 'node:path';

const MAX_PER_FILE_DEFAULT = 50 * 1024 * 1024;
const MAX_TOTAL_DEFAULT = 200 * 1024 * 1024;

function isSymlinkEntry(entry) {
  const unixMode = (entry.attr >>> 16) & 0xffff;
  return (unixMode & 0o170000) === 0o120000;
}

function toPosix(name) {
  return name.split('\\').join('/');
}

export function isSafeEntryName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.includes('\x00')) return false;
  const slashed = toPosix(name);
  if (slashed.startsWith('/')) return false;
  if (/^[A-Za-z]:/.test(slashed)) return false;
  const norm = posix.normalize(slashed);
  if (norm === '..' || norm.startsWith('../') || norm.includes('/../')) return false;
  return true;
}

export function isWithinTargetDir(entryName, targetDir) {
  const target = resolve(targetDir);
  const dest = resolve(target, toPosix(entryName));
  return dest === target || dest.startsWith(target + sep);
}

export function validateZipEntries(entries, targetDir, opts = {}) {
  const {
    maxEntries = Infinity,
    maxPerFile = MAX_PER_FILE_DEFAULT,
    maxTotal = MAX_TOTAL_DEFAULT,
    requireExtension = null,
  } = opts;
  let fileCount = 0;
  let totalSize = 0;
  for (const e of entries) {
    if (e.isDirectory) continue;
    fileCount++;
    if (fileCount > maxEntries) {
      throw Object.assign(new Error('Too many entries in zip'), { code: 'ZIP_TOO_MANY' });
    }
    if (isSymlinkEntry(e)) {
      throw Object.assign(new Error('Symlinks not allowed in zip'), { code: 'ZIP_UNSAFE' });
    }
    if (!isSafeEntryName(e.entryName)) {
      throw Object.assign(new Error(`Unsafe zip entry name: ${e.entryName}`), { code: 'ZIP_UNSAFE' });
    }
    if (!isWithinTargetDir(e.entryName, targetDir)) {
      throw Object.assign(new Error(`Zip entry escapes target dir: ${e.entryName}`), { code: 'ZIP_UNSAFE' });
    }
    if (requireExtension && !e.entryName.toLowerCase().endsWith(requireExtension.toLowerCase())) {
      throw Object.assign(new Error(`Disallowed extension: ${e.entryName}`), { code: 'ZIP_UNSAFE' });
    }
    const sizeRaw = e.header?.size || 0;
    if (sizeRaw > maxPerFile) {
      throw Object.assign(new Error('File too large in archive'), { code: 'ZIP_BOMB' });
    }
    totalSize += sizeRaw;
    if (totalSize > maxTotal) {
      throw Object.assign(new Error('Archive expands too large'), { code: 'ZIP_BOMB' });
    }
  }
}
