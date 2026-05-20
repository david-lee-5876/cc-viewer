// Workspace Registry - 工作区持久化管理
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { renameSyncWithRetry } from './lib/file-api.js';
import { join, basename, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { LOG_DIR } from '../findcc.js';

// 动态获取（LOG_DIR 可能在运行时被 setLogDir 修改）
function getWorkspacesFile() { return join(LOG_DIR, 'workspaces.json'); }
function getLockFile() { return join(LOG_DIR, 'workspaces.lock'); }

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withLock(fn) {
  mkdirSync(LOG_DIR, { recursive: true });
  const deadline = Date.now() + 2000;
  // 如果锁文件超过 5 秒未更新，认为它是死锁（前一个进程崩溃）
  const STALE_THRESHOLD = 5000;

  while (true) {
    try {
      const fd = openSync(getLockFile(), 'wx');
      closeSync(fd);
      break;
    } catch (err) {
      if (err?.code === 'EEXIST') {
        if (Date.now() < deadline) {
          // 检查是否为陈旧锁
          try {
            const stats = statSync(getLockFile());
            if (Date.now() - stats.mtimeMs > STALE_THRESHOLD) {
              // 尝试强制移除锁
              try { unlinkSync(getLockFile()); } catch { }
              // 立即重试获取
              continue;
            }
          } catch {
            // stat 失败可能意味着锁刚被释放，继续循环尝试获取
          }
          sleep(25);
          continue;
        }
      }
      throw err;
    }
  }

  try {
    return fn();
  } finally {
    try { unlinkSync(getLockFile()); } catch { }
  }
}

export function loadWorkspaces() {
  try {
    if (!existsSync(getWorkspacesFile())) return [];
    const data = JSON.parse(readFileSync(getWorkspacesFile(), 'utf-8'));
    return Array.isArray(data.workspaces) ? data.workspaces : [];
  } catch {
    return [];
  }
}

export function saveWorkspaces(list) {
  const tmpFile = `${getWorkspacesFile()}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    writeFileSync(tmpFile, JSON.stringify({ workspaces: list }, null, 2));
    
    // Windows 上 renameSync 可能会因为目标文件存在或被占用而失败。统一走 server/lib/file-api.js
    // renameSyncWithRetry helper（同款重试策略，跟 interceptor / log-management 一致）。
    renameSyncWithRetry(tmpFile, getWorkspacesFile());
  } catch (err) {
    console.error('[CC Viewer] Failed to save workspaces:', err.message);
    // 尝试清理临时文件
    try { unlinkSync(tmpFile); } catch { }
  }
}

// 失效 file-access-policy 的 allowlist roots 缓存。lazy import 避免循环依赖。
function _invalidatePolicyCache() {
  import('./lib/file-access-policy.js')
    .then(m => m.bumpWorkspacesVersion?.())
    .catch(() => { /* policy 模块可能在某些 entry 下未加载,无副作用即可 */ });
}

export function registerWorkspace(absolutePath) {
  const result = withLock(() => {
    const resolvedPath = resolve(absolutePath);
    const projectName = basename(resolvedPath).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const list = loadWorkspaces();
    // Windows NTFS 不分大小写——`C:\App` 跟 `c:\app` 是同目录但 `===` 视为不同。
    // 仅 Win 下小写化比较；POSIX 保持原样不引入回归。
    const pathEq = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
    const existing = list.find(w => pathEq(w.path, resolvedPath));
    if (existing) {
      existing.lastUsed = new Date().toISOString();
      existing.projectName = projectName;
      saveWorkspaces(list);
      return existing;
    }
    const now = new Date().toISOString();
    const entry = {
      id: randomBytes(6).toString('hex'),
      path: resolvedPath,
      projectName,
      lastUsed: now,
      createdAt: now,
    };
    list.push(entry);
    saveWorkspaces(list);
    return entry;
  });
  _invalidatePolicyCache();
  return result;
}

export function removeWorkspace(id) {
  const result = withLock(() => {
    const list = loadWorkspaces();
    const filtered = list.filter(w => w.id !== id);
    if (filtered.length !== list.length) {
      saveWorkspaces(filtered);
      return true;
    }
    return false;
  });
  if (result) _invalidatePolicyCache();
  return result;
}

export function getWorkspaces() {
  const list = loadWorkspaces();
  return list
    .map(w => {
      let logCount = 0;
      let totalSize = 0;
      const logDir = join(LOG_DIR, w.projectName);
      try {
        if (existsSync(logDir)) {
          const files = readdirSync(logDir);
          for (const f of files) {
            if (f.endsWith('.jsonl')) {
              logCount++;
              try { totalSize += statSync(join(logDir, f)).size; } catch { }
            }
          }
        }
      } catch { }
      return { ...w, logCount, totalSize };
    })
    .sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed));
}
