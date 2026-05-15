import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, unlinkSync, realpathSync, appendFileSync } from 'node:fs';
import { renameSyncWithRetry } from './file-api.js';
import { join } from 'node:path';
import { reconstructEntries } from './delta-reconstructor.js';
import { streamReconstructedEntries } from './log-stream.js';
import { archiveJsonl, resolveJsonlPath } from './jsonl-archive.js';

/**
 * Validate that a resolved file path is contained within logDir.
 * Throws on invalid path (not found or path traversal).
 * @param {string} logDir - base log directory
 * @param {string} file - relative file path (e.g. "project/file.jsonl")
 * @returns {string} the real (resolved) path
 */
export function validateLogPath(logDir, file) {
  const filePath = join(logDir, file);
  if (!existsSync(filePath)) {
    const err = new Error('File not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const realPath = realpathSync(filePath);
  const realLogDir = realpathSync(logDir);
  if (!realPath.startsWith(realLogDir)) {
    const err = new Error('Access denied');
    err.code = 'ACCESS_DENIED';
    throw err;
  }
  return realPath;
}

function isLogFileName(name) {
  return name.endsWith('.jsonl') || name.endsWith('.jsonl.zip');
}

/**
 * List local log files grouped by project.
 * @param {string} logDir - base log directory
 * @param {string} currentProjectName - current project name (may be empty)
 * @returns {{ [project: string]: Array, _currentProject: string }}
 */
export function listLocalLogs(logDir, currentProjectName) {
  const grouped = {};
  if (existsSync(logDir)) {
    const entries = readdirSync(logDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const project = entry.name;
      const projectDir = join(logDir, project);
      const files = readdirSync(projectDir)
        .filter(isLogFileName)
        .sort()
        .reverse();
      // 从项目统计缓存中读取 per-file 数据，避免逐文件扫描
      let statsFiles = null;
      try {
        const statsFile = join(projectDir, `${project}.json`);
        if (existsSync(statsFile)) {
          statsFiles = JSON.parse(readFileSync(statsFile, 'utf-8')).files;
        }
      } catch { }
      for (const f of files) {
        const match = f.match(/^(.+?)_(\d{8}_\d{6})\.jsonl(\.zip)?$/);
        if (!match) continue;
        const ts = match[2];
        const archived = !!match[3];
        const filePath = join(projectDir, f);
        const size = statSync(filePath).size;
        if (size === 0) continue; // 跳过空文件
        // 归档前的统计缓存 key 是 `.jsonl`；归档后切到 `.jsonl.zip`；两种都尝试
        const stats = statsFiles?.[f] || (archived ? statsFiles?.[f.slice(0, -4)] : null);
        const turns = stats?.summary?.sessionCount || 0;
        if (!grouped[project]) grouped[project] = [];
        grouped[project].push({ file: `${project}/${f}`, timestamp: ts, size, turns, preview: stats?.preview || [], archived });
      }
    }
  }
  return { ...grouped, _currentProject: currentProjectName || '' };
}

/**
 * Read and parse a local log file.
 * @param {string} logDir - base log directory
 * @param {string} file - relative file path (e.g. "project/file.jsonl")
 * @returns {Array<Object>} parsed entries
 */
export function readLocalLog(logDir, file) {
  validateLogPath(logDir, file);
  const filePath = resolveJsonlPath(join(logDir, file));
  const content = readFileSync(filePath, 'utf-8');
  const parsed = content.split('\n---\n').filter(line => line.trim()).map(entry => {
    try { return JSON.parse(entry); } catch { return null; }
  }).filter(Boolean);
  // Delta storage: 先去重（timestamp|url），再重建 delta 条目
  const map = new Map();
  for (const entry of parsed) {
    const key = `${entry.timestamp}|${entry.url}`;
    map.set(key, entry);
  }
  return reconstructEntries(Array.from(map.values()));
}

/**
 * Delete log files. Returns per-file results.
 * @param {string} logDir - base log directory
 * @param {string[]} files - array of relative file paths
 * @returns {Array<{ file: string, ok?: boolean, error?: string }>}
 */
export function deleteLogFiles(logDir, files) {
  const results = [];
  for (const file of files) {
    if (!file || file.includes('..') || !isLogFileName(file)) {
      results.push({ file, error: 'Invalid file name' });
      continue;
    }
    const filePath = join(logDir, file);
    try {
      if (!existsSync(filePath)) {
        results.push({ file, error: 'Not found' });
        continue;
      }
      const realPath = realpathSync(filePath);
      const realLogDir = realpathSync(logDir);
      if (!realPath.startsWith(realLogDir)) {
        results.push({ file, error: 'Access denied' });
        continue;
      }
      unlinkSync(realPath);
      results.push({ file, ok: true });
    } catch (err) {
      results.push({ file, error: err.message });
    }
  }
  return results;
}

/**
 * Merge multiple log files into the first one, deleting the rest.
 * @param {string} logDir - base log directory
 * @param {string[]} files - array of relative file paths (at least 2, same project, chronological order)
 * @returns {string} the merged target file path (relative)
 */
export function mergeLogFiles(logDir, files) {
  if (!Array.isArray(files) || files.length < 2) {
    const err = new Error('At least 2 files required');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  // 拒绝归档文件参与合并：mergeLogFiles 会以 files[0] 路径写入 plain jsonl 内容，若该路径
  // 是 .jsonl.zip 会把 zip 文件覆写成裸文本破坏归档；且合并产物语义上应该是可继续追加的
  // 活动文件，与"归档=只读快照"语义冲突。前端 UI 已 disabled，此处后端兜底。
  for (const f of files) {
    if (typeof f === 'string' && f.endsWith('.jsonl.zip')) {
      const err = new Error('Cannot merge archived (.jsonl.zip) files');
      err.code = 'INVALID_INPUT';
      throw err;
    }
  }
  // 校验所有文件属于同一 project
  // 兼容 Win backslash：files 内部可能是 `project\log.json`，按两种 sep 都切才能拿 project 段。
  const projects = new Set(files.map(f => f.split(/[\\/]/)[0]));
  if (projects.size !== 1) {
    const err = new Error('All files must belong to the same project');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  // 校验文件存在且无路径穿越
  for (const f of files) {
    if (f.includes('..')) {
      const err = new Error('Invalid file path');
      err.code = 'INVALID_INPUT';
      throw err;
    }
    if (!existsSync(join(logDir, f))) {
      const err = new Error(`File not found: ${f}`);
      err.code = 'NOT_FOUND';
      throw err;
    }
  }
  // 校验合并后总大小不超过 400MB
  const MAX_MERGE_SIZE = 400 * 1024 * 1024;
  let totalSize = 0;
  for (const f of files) {
    totalSize += statSync(join(logDir, f)).size;
  }
  if (totalSize > MAX_MERGE_SIZE) {
    const err = new Error(`Merged size (${(totalSize / 1024 / 1024).toFixed(1)}MB) exceeds ${MAX_MERGE_SIZE / 1024 / 1024}MB limit`);
    err.code = 'INVALID_INPUT';
    throw err;
  }
  // Delta storage: 流式合并 — 逐文件分段重建并直接写入目标文件，避免全量加载 OOM
  const targetFile = files[0];
  const targetPath = join(logDir, targetFile);
  // 先写到临时文件，成功后再覆盖目标
  const tmpPath = targetPath + '.merge-tmp';
  writeFileSync(tmpPath, ''); // 创建空临时文件
  for (const f of files) {
    const filePath = join(logDir, f);
    streamReconstructedEntries(filePath, (segment) => {
      let chunk = '';
      for (const entry of segment) {
        delete entry._deltaFormat;
        delete entry._totalMessageCount;
        delete entry._conversationId;
        delete entry._isCheckpoint;
        chunk += JSON.stringify(entry) + '\n---\n';
      }
      appendFileSync(tmpPath, chunk);
    });
  }
  // 临时文件写入成功后原子覆盖目标（POSIX renameSync 自动替换；Windows reader 持锁时 retry）
  renameSyncWithRetry(tmpPath, targetPath);
  // 删除其余文件
  for (let i = 1; i < files.length; i++) {
    unlinkSync(join(logDir, files[i]));
  }
  return targetFile;
}

function migrateStatsCacheKey(projectDir, projectName, oldFileName, newFileName) {
  const statsFile = join(projectDir, `${projectName}.json`);
  if (!existsSync(statsFile)) return;
  try {
    const stats = JSON.parse(readFileSync(statsFile, 'utf-8'));
    if (stats?.files?.[oldFileName]) {
      const entry = stats.files[oldFileName];
      // 同步用归档后 .zip 的 size / mtime 覆写 entry，避免 stats-worker 下次扫描时
      // 因 size/mtime 不匹配判定 cache stale 触发整文件重解析（大 jsonl 数秒 CPU）。
      try {
        const zipStat = statSync(join(projectDir, newFileName));
        entry.size = zipStat.size;
        entry.lastModified = zipStat.mtime.toISOString();
      } catch { /* zip 不可 stat 时不更新，让 stats 自然重建 */ }
      stats.files[newFileName] = entry;
      delete stats.files[oldFileName];
      writeFileSync(statsFile, JSON.stringify(stats, null, 2));
    }
  } catch { /* tolerant */ }
}

/**
 * 压缩归档多个 .jsonl 文件。每个 project 的最新文件（按文件名 desc 排序后的 logs[0]）
 * 被拒绝，复用 mergeLogFiles 的"最新不允许"语义。
 * @param {string} logDir
 * @param {string[]} files - 形如 "project/<name>.jsonl"
 * @returns {{ archived: string[], skipped: Array<{file:string,reason:string}>, failed: Array<{file:string,reason:string}> }}
 */
export function archiveLogFiles(logDir, files) {
  const archived = [];
  const skipped = [];
  const failed = [];

  // 按 project 分组以判定最新文件
  const byProject = new Map();
  for (const f of files) {
    if (!f || typeof f !== 'string' || f.includes('..') || !f.endsWith('.jsonl')) {
      failed.push({ file: f, reason: 'Invalid file name' });
      continue;
    }
    const parts = f.split(/[\\/]/);
    if (parts.length < 2) {
      failed.push({ file: f, reason: 'Invalid file path' });
      continue;
    }
    const project = parts[0];
    if (!byProject.has(project)) byProject.set(project, []);
    byProject.get(project).push(f);
  }

  let realLogDir;
  try { realLogDir = realpathSync(logDir); }
  catch (err) { return { archived, skipped, failed: files.map(f => ({ file: f, reason: err.message })) }; }

  for (const [project, projectFiles] of byProject) {
    const projectDir = join(logDir, project);
    let latest = null;
    try {
      const projectEntries = readdirSync(projectDir)
        .filter(isLogFileName)
        .sort()
        .reverse();
      latest = projectEntries[0] || null;
    } catch { /* directory missing => downstream calls will fail */ }

    for (const f of projectFiles) {
      const fileName = f.split(/[\\/]/).slice(1).join('/');
      if (latest && fileName === latest) {
        skipped.push({ file: f, reason: 'latest-not-allowed' });
        continue;
      }
      const filePath = join(logDir, f);
      let realPath;
      try {
        if (!existsSync(filePath)) { failed.push({ file: f, reason: 'Not found' }); continue; }
        realPath = realpathSync(filePath);
        if (!realPath.startsWith(realLogDir)) {
          failed.push({ file: f, reason: 'Access denied' });
          continue;
        }
      } catch (err) {
        failed.push({ file: f, reason: err.message });
        continue;
      }

      const result = archiveJsonl(realPath);
      if (result.ok) {
        archived.push(f);
        migrateStatsCacheKey(projectDir, project, fileName, fileName + '.zip');
      } else if (result.skipped) {
        skipped.push({ file: f, reason: result.skipped });
      } else {
        // archiveJsonl 内部已在 unlink 失败时回滚 zip，此处 fail 即原状态完整保留，用户可重试
        failed.push({ file: f, reason: result.error || 'archive failed' });
      }
    }
  }

  return { archived, skipped, failed };
}
