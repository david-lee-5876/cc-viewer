import { readFileSync, existsSync, watch, watchFile, unwatchFile, statSync } from 'node:fs';
import { open as fsOpen, stat as fsStat } from 'node:fs/promises';
import { dirname, basename } from 'node:path';
import { isMainAgentEntry, extractCachedContent } from './kv-cache-analyzer.js';
import { buildContextWindowEvent, getContextSizeForModel } from './context-watcher.js';
import { reconstructEntries, createIncrementalReconstructor } from './delta-reconstructor.js';
import { countLogEntries, streamReconstructedEntriesAsync } from './log-stream.js';
import { enrichEntry } from './enrich-plan-input.js';
import { resolveJsonlPath } from './jsonl-archive.js';

// 跟踪所有被 watch 的日志文件。value: fileState 对象（外部只用 .has()/.keys()）
const watchedFiles = new Map();

// 目录级 fs.watch 实例注册表（事件驱动，替代 per-file 轮询）
const _dirWatchers = new Map();

// Windows 单次 appendFileSync 触发 2+ 事件，防抖合并
const FSWATCH_DEBOUNCE_MS = 80;

// 安全网慢轮询：fs.watch 可能漏事件（buffer overflow 等），冷 fallback 兜底
const SAFETY_POLL_MS = 5000;

const FORCE_POLL = process.env.CCV_FORCE_POLL === '1';

/**
 * Read and parse a JSONL log file.
 * @param {string} logFile - absolute path to the log file
 * @returns {Array} parsed and deduplicated entries
 */
export function readLogFile(logFile) {
  logFile = resolveJsonlPath(logFile);
  if (!existsSync(logFile)) {
    return [];
  }

  try {
    const content = readFileSync(logFile, 'utf-8');
    const entries = content.split(/\r?\n---\r?\n/).filter(line => line.trim());
    const parsed = entries.map(entry => {
      try {
        return JSON.parse(entry);
      } catch {
        return null;
      }
    }).filter(Boolean);
    const map = new Map();
    for (const entry of parsed) {
      const key = `${entry.timestamp}|${entry.url}`;
      map.set(key, entry);
    }
    return reconstructEntries(Array.from(map.values()));
  } catch (err) {
    console.error('Error reading log file:', err);
    return [];
  }
}

// SSE 单客户端 backpressure 容忍上限：连续未排空 > 此时长则视为 dead 客户端剔除。
// 与 server.js 同名常量值保持一致（避免循环依赖，此处单独 mirror）。
// 30s：避免大会话/重连重放时把短暂忙碌的渲染器误判为 dead 并触发重连风暴，详见 server.js 注释。
const SSE_BACKPRESSURE_TIMEOUT_MS = 30000;

function _removeClient(clients, client) {
  const idx = clients.indexOf(client);
  if (idx !== -1) clients.splice(idx, 1);
}

function _safeSseWrite(clients, client, payload) {
  if (client.destroyed === true || client.writable === false) {
    _removeClient(clients, client);
    return false;
  }
  let ok;
  try {
    ok = client.write(payload);
  } catch {
    _removeClient(clients, client);
    return false;
  }
  if (!ok) {
    if (!client._sseBackpressureSince) {
      client._sseBackpressureSince = Date.now();
      client.once('drain', () => { client._sseBackpressureSince = 0; });
    } else if (Date.now() - client._sseBackpressureSince > SSE_BACKPRESSURE_TIMEOUT_MS) {
      _removeClient(clients, client);
      try { client.end(); } catch {}
      return false;
    }
  }
  return true;
}

export function sendToClients(clients, entry) {
  const payload = `data: ${JSON.stringify(entry)}\n\n`;
  for (let i = clients.length - 1; i >= 0; i--) {
    _safeSseWrite(clients, clients[i], payload);
  }
}

export function sendEventToClients(clients, eventName, data) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (let i = clients.length - 1; i >= 0; i--) {
    _safeSseWrite(clients, clients[i], payload);
  }
}

export function sendChunkToClients(clients, dataJson) {
  const payload = `event: load_chunk\ndata: ${dataJson}\n\n`;
  for (let i = clients.length - 1; i >= 0; i--) {
    _safeSseWrite(clients, clients[i], payload);
  }
}

// --- 轮转切换（抽取公共逻辑） ---

async function _switchToRotatedFile(logFile, currentLogFile, clients, opts) {
  _unwatchSingleFile(logFile);
  const total = await countLogEntries(currentLogFile);
  sendEventToClients(clients, 'load_start', { total, incremental: false });
  await streamReconstructedEntriesAsync(currentLogFile, (segment) => {
    sendChunkToClients(clients, JSON.stringify(segment));
  });
  sendEventToClients(clients, 'load_end', {});
  watchLogFile({ ...opts, logFile: currentLogFile });
}

// --- 增量读 + 解析 + 广播（独立于触发机制） ---

async function _readDelta(state) {
  if (state._reading) return; // 防止并发调用（debounce + safetyTimer 可能重叠）
  state._reading = true;
  const { logFile, opts, reconstructor } = state;
  const { clients, getClaudePid, runParallelHook, notifyStatsWorker, getLogFile } = opts;
  try {
    const st = await fsStat(logFile);
    const currentSize = st.size;

    if (currentSize < state.lastByteOffset) {
      state.lastByteOffset = 0;
      state.pendingTail = '';
      reconstructor.reset();

      const currentLogFile = getLogFile();
      if (currentLogFile !== logFile && !watchedFiles.has(currentLogFile)) {
        await _switchToRotatedFile(logFile, currentLogFile, clients, opts);
        return;
      }
    }

    if (currentSize <= state.lastByteOffset) return;

    const bytesToRead = currentSize - state.lastByteOffset;
    const buf = Buffer.alloc(bytesToRead);
    const fh = await fsOpen(logFile, 'r');
    try {
      await fh.read(buf, 0, bytesToRead, state.lastByteOffset);
    } finally {
      await fh.close();
    }
    state.lastByteOffset = currentSize;

    const raw = state.pendingTail + buf.toString('utf-8');
    const parts = raw.split('\n---\n');
    state.pendingTail = parts.pop() || '';

    if (parts.length === 0 && state.pendingTail.trim()) {
      try {
        JSON.parse(state.pendingTail);
        parts.push(state.pendingTail);
        state.pendingTail = '';
      } catch {}
    }

    const validParts = parts.filter(p => p.trim());
    if (validParts.length > 0) {
      validParts.forEach(entry => {
        try {
          const parsed = JSON.parse(entry);
          if (!parsed.pid) parsed.pid = getClaudePid();
          reconstructor.reconstruct(parsed);
          try { enrichEntry(parsed); } catch {}
          sendToClients(clients, parsed);
          runParallelHook('onNewEntry', parsed).catch(() => {});
          if (isMainAgentEntry(parsed) && !parsed.inProgress) {
            const cached = extractCachedContent(parsed);
            if (cached) sendEventToClients(clients, 'kv_cache_content', cached);
            const usage = parsed.response?.body?.usage;
            if (usage) {
              const contextSize = getContextSizeForModel(parsed.body?.model);
              const cwData = buildContextWindowEvent(usage, contextSize);
              if (cwData) sendEventToClients(clients, 'context_window', cwData);
            }
          }
        } catch {}
      });
      notifyStatsWorker(logFile);
    }

    const currentLogFile = getLogFile();
    if (currentLogFile !== logFile && !watchedFiles.has(currentLogFile)) {
      await _switchToRotatedFile(logFile, currentLogFile, clients, opts);
    }
  } catch {
    // File not yet created or transient read error
  } finally {
    state._reading = false;
  }
}

// --- 目录级 fs.watch 管理 ---

function _getOrCreateDirWatcher(dir) {
  if (_dirWatchers.has(dir)) return _dirWatchers.get(dir);

  try {
    const files = new Map();
    const watcher = watch(dir, (eventType, filename) => {
      if (!filename) {
        for (const [, fileState] of files) {
          _scheduleDebouncedRead(fileState);
        }
        return;
      }
      const fileState = files.get(filename);
      if (fileState) _scheduleDebouncedRead(fileState);
    });

    watcher.on('error', () => {
      for (const [, fileState] of files) {
        _fallbackToPolling(fileState);
      }
      try { watcher.close(); } catch {}
      _dirWatchers.delete(dir);
    });

    const entry = { watcher, files };
    _dirWatchers.set(dir, entry);
    return entry;
  } catch {
    return null;
  }
}

function _scheduleDebouncedRead(fileState) {
  if (fileState.debounceTimer) return;
  fileState.debounceTimer = setTimeout(() => {
    fileState.debounceTimer = null;
    _readDelta(fileState);
  }, FSWATCH_DEBOUNCE_MS);
}

function _fallbackToPolling(fileState) {
  if (fileState.polling) return;
  fileState.polling = true;
  watchFile(fileState.logFile, { interval: 500 }, () => {
    _readDelta(fileState);
  });
}

function _unwatchSingleFile(logFile) {
  const fileState = watchedFiles.get(logFile);
  watchedFiles.delete(logFile);

  if (!fileState) return;

  if (fileState.debounceTimer) clearTimeout(fileState.debounceTimer);
  if (fileState.safetyTimer) clearInterval(fileState.safetyTimer);

  if (fileState.polling) {
    try { unwatchFile(logFile); } catch {}
    return;
  }

  const dir = dirname(logFile);
  const filename = basename(logFile);
  const dirEntry = _dirWatchers.get(dir);
  if (dirEntry) {
    dirEntry.files.delete(filename);
    if (dirEntry.files.size === 0) {
      try { dirEntry.watcher.close(); } catch {}
      _dirWatchers.delete(dir);
    }
  }
}

// --- 公开 API ---

export function watchLogFile(opts) {
  const { logFile } = opts;
  if (watchedFiles.has(logFile)) return;

  let lastByteOffset = 0;
  const _reconstructor = createIncrementalReconstructor();
  try {
    if (existsSync(logFile)) {
      lastByteOffset = statSync(logFile).size;
    }
  } catch {}

  const fileState = {
    logFile,
    opts,
    reconstructor: _reconstructor,
    lastByteOffset,
    pendingTail: '',
    debounceTimer: null,
    safetyTimer: null,
    polling: false,
  };

  watchedFiles.set(logFile, fileState);

  if (FORCE_POLL) {
    _fallbackToPolling(fileState);
    return;
  }

  const dir = dirname(logFile);
  const filename = basename(logFile);
  const dirEntry = _getOrCreateDirWatcher(dir);

  if (!dirEntry) {
    _fallbackToPolling(fileState);
    return;
  }

  dirEntry.files.set(filename, fileState);

  fileState.safetyTimer = setInterval(() => {
    _readDelta(fileState);
  }, SAFETY_POLL_MS);
}

export function unwatchLogFile(logFile) {
  _unwatchSingleFile(logFile);
}

export function unwatchAll() {
  for (const logFile of watchedFiles.keys()) {
    _unwatchSingleFile(logFile);
  }
  for (const [, entry] of _dirWatchers) {
    try { entry.watcher.close(); } catch {}
  }
  _dirWatchers.clear();
  watchedFiles.clear();
}

export function startWatching(opts) {
  const { clients, ...watchOpts } = opts;
  watchLogFile({ ...watchOpts, clients });
}

export function getWatchedFiles() {
  return watchedFiles;
}
