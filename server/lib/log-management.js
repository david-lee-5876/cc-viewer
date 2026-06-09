import { existsSync, realpathSync, unlinkSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { readFile, writeFile, appendFile, stat, readdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { renameSyncWithRetry } from './file-api.js';
import { join, sep } from 'node:path';
import { reconstructEntries } from './delta-reconstructor.js';
import { streamReconstructedEntriesAsync } from './log-stream.js';
import { archiveJsonl, resolveJsonlPath } from './jsonl-archive.js';

export function validateLogPath(logDir, file) {
  const filePath = join(logDir, file);
  if (!existsSync(filePath)) {
    const err = new Error('File not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const realPath = realpathSync(filePath);
  const realLogDir = realpathSync(logDir);
  if (realPath !== realLogDir && !realPath.startsWith(realLogDir + sep)) {
    const err = new Error('Access denied');
    err.code = 'ACCESS_DENIED';
    throw err;
  }
  return realPath;
}

function isLogFileName(name) {
  return name.endsWith('.jsonl') || name.endsWith('.jsonl.zip');
}

export async function listLocalLogs(logDir, currentProjectName) {
  const grouped = {};
  if (!existsSync(logDir)) return { ...grouped, _currentProject: currentProjectName || '' };

  const entries = await readdir(logDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const project = entry.name;
    const projectDir = join(logDir, project);
    const files = (await readdir(projectDir))
      .filter(isLogFileName)
      .sort()
      .reverse();
    let statsFiles = null;
    try {
      const statsFile = join(projectDir, `${project}.json`);
      if (existsSync(statsFile)) {
        statsFiles = JSON.parse(await readFile(statsFile, 'utf-8')).files;
      }
    } catch { }
    for (const f of files) {
      const match = f.match(/^(.+?)_(\d{8}_\d{6})\.jsonl(\.zip)?$/);
      if (!match) continue;
      const ts = match[2];
      const archived = !!match[3];
      const filePath = join(projectDir, f);
      let size;
      try { size = (await stat(filePath)).size; } catch { continue; }
      if (size === 0) continue;
      const stats = statsFiles?.[f] || (archived ? statsFiles?.[f.slice(0, -4)] : null);
      const turns = stats?.summary?.sessionCount || 0;
      if (!grouped[project]) grouped[project] = [];
      grouped[project].push({ file: `${project}/${f}`, timestamp: ts, size, turns, preview: stats?.preview || [], archived });
    }
  }
  return { ...grouped, _currentProject: currentProjectName || '' };
}

export async function readLocalLog(logDir, file) {
  validateLogPath(logDir, file);
  const filePath = resolveJsonlPath(join(logDir, file));
  const content = await readFile(filePath, 'utf-8');
  const parsed = content.split('\n---\n').filter(line => line.trim()).map(entry => {
    try { return JSON.parse(entry); } catch { return null; }
  }).filter(Boolean);
  const map = new Map();
  for (const entry of parsed) {
    const key = `${entry.timestamp}|${entry.url}`;
    map.set(key, entry);
  }
  return reconstructEntries(Array.from(map.values()));
}

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
      if (realPath !== realLogDir && !realPath.startsWith(realLogDir + sep)) {
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

export async function mergeLogFiles(logDir, files) {
  if (!Array.isArray(files) || files.length < 2) {
    const err = new Error('At least 2 files required');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  for (const f of files) {
    if (typeof f === 'string' && f.endsWith('.jsonl.zip')) {
      const err = new Error('Cannot merge archived (.jsonl.zip) files');
      err.code = 'INVALID_INPUT';
      throw err;
    }
  }
  const projects = new Set(files.map(f => f.split(/[\\/]/)[0]));
  if (projects.size !== 1) {
    const err = new Error('All files must belong to the same project');
    err.code = 'INVALID_INPUT';
    throw err;
  }
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
  const MAX_MERGE_SIZE = 400 * 1024 * 1024;
  let totalSize = 0;
  for (const f of files) {
    totalSize += (await stat(join(logDir, f))).size;
  }
  if (totalSize > MAX_MERGE_SIZE) {
    const err = new Error(`Merged size (${(totalSize / 1024 / 1024).toFixed(1)}MB) exceeds ${MAX_MERGE_SIZE / 1024 / 1024}MB limit`);
    err.code = 'INVALID_INPUT';
    throw err;
  }
  const targetFile = files[0];
  const targetPath = join(logDir, targetFile);
  const tmpPath = `${targetPath}.merge-tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  await writeFile(tmpPath, '');
  for (const f of files) {
    const filePath = join(logDir, f);
    await streamReconstructedEntriesAsync(filePath, async (segment) => {
      let chunk = '';
      for (const entry of segment) {
        // 乱序/断裂条目若未被补偿回填（messages 仍是裸 delta 切片），丢弃不写：
        // 剥除 _deltaFormat 后它会伪装成旧格式全量条目，未来读取时把累积状态
        // 重置成几条切片，比丢掉这条（内容已被更新条目取代）破坏大得多
        if ((entry._staleReorder || entry._reconstructBroken) &&
            entry._totalMessageCount && Array.isArray(entry.body?.messages) &&
            entry.body.messages.length !== entry._totalMessageCount) {
          continue;
        }
        delete entry._deltaFormat;
        delete entry._totalMessageCount;
        delete entry._conversationId;
        delete entry._isCheckpoint;
        // 完成序倒置守卫的内部字段不落盘：合并产物是已重建的全量条目，
        // seq 序号与 stale/broken 标记只在重建期有意义，泄漏会让后续读取误判
        delete entry._seq;
        delete entry._seqEpoch;
        delete entry._staleReorder;
        delete entry._reconstructBroken;
        chunk += JSON.stringify(entry) + '\n---\n';
      }
      await appendFile(tmpPath, chunk);
    });
  }
  renameSyncWithRetry(tmpPath, targetPath);
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
      try {
        const zipStat = statSync(join(projectDir, newFileName));
        entry.size = zipStat.size;
        entry.lastModified = zipStat.mtime.toISOString();
      } catch {}
      stats.files[newFileName] = entry;
      delete stats.files[oldFileName];
      writeFileSync(statsFile, JSON.stringify(stats, null, 2));
    }
  } catch {}
}

export function archiveLogFiles(logDir, files) {
  const archived = [];
  const skipped = [];
  const failed = [];

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
    } catch {}

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
        if (realPath !== realLogDir && !realPath.startsWith(realLogDir + sep)) {
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
        failed.push({ file: f, reason: result.error || 'archive failed' });
      }
    }
  }

  return { archived, skipped, failed };
}
