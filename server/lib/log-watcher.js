import { readFileSync, existsSync, watchFile, unwatchFile, openSync, readSync, closeSync, statSync } from 'node:fs';
import { isMainAgentEntry, extractCachedContent } from './kv-cache-analyzer.js';
import { buildContextWindowEvent, getContextSizeForModel } from './context-watcher.js';
import { reconstructEntries, createIncrementalReconstructor } from './delta-reconstructor.js';
import { countLogEntries, streamReconstructedEntries } from './log-stream.js';
import { enrichEntry } from './enrich-plan-input.js';
import { resolveJsonlPath } from './jsonl-archive.js';

// 跟踪所有被 watch 的日志文件
const watchedFiles = new Map();

/**
 * Read and parse a JSONL log file.
 * @param {string} logFile - absolute path to the log file
 * @returns {Array} parsed and deduplicated entries
 */
export function readLogFile(logFile) {
  // 透明支持归档后的 .jsonl.zip。active log（被 watchLogFile 追加写入的文件）不会被归档
  // （archive 拒绝最新文件），watchLogFile 内部的 openSync/readSync 因此无需走 resolveJsonlPath。
  logFile = resolveJsonlPath(logFile);
  if (!existsSync(logFile)) {
    return [];
  }

  try {
    const content = readFileSync(logFile, 'utf-8');
    // Windows 上若 writer 使用 os.EOL，分隔符会变 \r\n---\r\n。固定 LF 切会失败 → 整文件
    // 解析成一条乱码或漏。CRLF-tolerant split 把两边都 cover 住。
    const entries = content.split(/\r?\n---\r?\n/).filter(line => line.trim());
    const parsed = entries.map(entry => {
      try {
        return JSON.parse(entry);
      } catch {
        return null;
      }
    }).filter(Boolean);
    // 去重：同一 timestamp+url 的条目，后出现的（带 response）覆盖先出现的（在途）
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
const SSE_BACKPRESSURE_TIMEOUT_MS = 5000;

function _removeClient(clients, client) {
  const idx = clients.indexOf(client);
  if (idx !== -1) clients.splice(idx, 1);
}

/**
 * 向单个 SSE client 安全写入 payload。
 * - 写错或 client.destroyed/!writable：立即从 clients 数组移除
 * - write 返回 false（写缓冲满）：标记时间戳，超过 SSE_BACKPRESSURE_TIMEOUT_MS 仍未排空则剔除并 end()
 * - drain 后重置 _sseBackpressureSince=0，下次 backpressure 重新计时
 */
function _safeSseWrite(clients, client, payload) {
  // 仅在显式标记 destroyed/writable=false 时剔除；undefined（如老 mock）按"活"处理。
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

/**
 * Send an SSE entry to all connected clients.
 * @param {Array} clients - SSE client array
 * @param {object} entry - parsed log entry
 */
export function sendToClients(clients, entry) {
  const payload = `data: ${JSON.stringify(entry)}\n\n`;
  // 倒序遍历允许循环内安全 splice
  for (let i = clients.length - 1; i >= 0; i--) {
    _safeSseWrite(clients, clients[i], payload);
  }
}

/**
 * Send a named SSE event to all connected clients.
 * @param {Array} clients - SSE client array
 * @param {string} eventName - SSE event name
 * @param {object} data - event payload
 */
export function sendEventToClients(clients, eventName, data) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (let i = clients.length - 1; i >= 0; i--) {
    _safeSseWrite(clients, clients[i], payload);
  }
}

/**
 * 旋转处理器专用：发送已序列化的 load_chunk segment 数据。
 * @param {Array} clients - SSE client array
 * @param {string} dataJson - segment 已被调用方 JSON.stringify
 */
export function sendChunkToClients(clients, dataJson) {
  const payload = `event: load_chunk\ndata: ${dataJson}\n\n`;
  for (let i = clients.length - 1; i >= 0; i--) {
    _safeSseWrite(clients, clients[i], payload);
  }
}

/**
 * Watch a log file for changes and broadcast new entries.
 * @param {object} opts
 * @param {string} opts.logFile - log file to watch
 * @param {Array} opts.clients - SSE clients array
 * @param {Function} opts.getClaudePid - returns Claude process PID
 * @param {Function} opts.runParallelHook - plugin hook runner
 * @param {Function} opts.notifyStatsWorker - stats worker notifier
 * @param {Function} opts.getLogFile - returns current LOG_FILE value
 */
export function watchLogFile(opts) {
  const { logFile, clients, getClaudePid, runParallelHook, notifyStatsWorker, getLogFile } = opts;
  if (watchedFiles.has(logFile)) return;

  // Track byte offset instead of string length — avoids full-file re-read on every poll
  let lastByteOffset = 0;
  let pendingTail = ''; // incomplete entry carried across polls
  // Delta storage: 增量重建器，用于逐条重建 mainAgent delta 条目
  const _reconstructor = createIncrementalReconstructor();
  try {
    if (existsSync(logFile)) {
      lastByteOffset = statSync(logFile).size;
    }
  } catch {}

  watchedFiles.set(logFile, true);
  watchFile(logFile, { interval: 500 }, () => {
    try {
      const currentSize = statSync(logFile).size;

      // File truncated (rotation or clear) — reset offset and check rotation immediately
      if (currentSize < lastByteOffset) {
        lastByteOffset = 0;
        pendingTail = '';
        _reconstructor.reset();

        // 文件被清空可能是轮转信号，立即检查是否已切换到新文件
        const currentLogFile = getLogFile();
        if (currentLogFile !== logFile && !watchedFiles.has(currentLogFile)) {
          unwatchFile(logFile);
          watchedFiles.delete(logFile);

          // 流式分段广播，避免全量加载 OOM；走 _safeSseWrite 包装做 backpressure / dead-client 清理
          const rotTotal = countLogEntries(currentLogFile);
          sendEventToClients(clients, 'load_start', { total: rotTotal, incremental: false });
          streamReconstructedEntries(currentLogFile, (segment) => {
            sendChunkToClients(clients, JSON.stringify(segment));
          });
          sendEventToClients(clients, 'load_end', {});
          watchLogFile({ ...opts, logFile: currentLogFile });
          return;
        }
      }

      if (currentSize <= lastByteOffset) return;

      // Read only the new bytes
      const bytesToRead = currentSize - lastByteOffset;
      const buf = Buffer.alloc(bytesToRead);
      const fd = openSync(logFile, 'r');
      try {
        readSync(fd, buf, 0, bytesToRead, lastByteOffset);
      } finally {
        closeSync(fd);
      }
      lastByteOffset = currentSize;

      const raw = pendingTail + buf.toString('utf-8');
      const parts = raw.split('\n---\n');

      // Last part may be incomplete — keep it for next poll
      pendingTail = parts.pop() || '';

      // If there's only the tail and no complete entries, check if tail is a complete entry
      // (happens when the file ends without a trailing \n---\n)
      if (parts.length === 0 && pendingTail.trim()) {
        try {
          JSON.parse(pendingTail);
          // Valid JSON — treat as complete entry
          parts.push(pendingTail);
          pendingTail = '';
        } catch {
          // Incomplete — keep in pendingTail for next poll
        }
      }

      const validParts = parts.filter(p => p.trim());
      if (validParts.length > 0) {
        validParts.forEach(entry => {
          try {
            const parsed = JSON.parse(entry);
            if (!parsed.pid) {
              parsed.pid = getClaudePid();
            }
            // Delta storage: reconstruct before push — 确保前端收到完整 messages
            _reconstructor.reconstruct(parsed);
            // ExitPlanMode V2 input 服务端补全（详见 enrich-plan-input.js#enrichEntry JSDoc）。
            // 同步实现：候选扫描天然廉价（无 ExitPlanMode 块直接 0ms 返回）；命中
            // 路径由 transcript 64MB 上限 + miss 30s TTL + path mtime 校验三层兜
            // 住，最坏 ~150ms。如未来 hit 比例显著上升再考虑 setImmediate 拆分。
            try { enrichEntry(parsed); } catch { /* 静默回退 */ }
            sendToClients(clients, parsed);
            runParallelHook('onNewEntry', parsed).catch(() => {});
            if (isMainAgentEntry(parsed) && !parsed.inProgress) {
              const cached = extractCachedContent(parsed);
              if (cached) {
                sendEventToClients(clients, 'kv_cache_content', cached);
              }
              const usage = parsed.response?.body?.usage;
              if (usage) {
                const contextSize = getContextSizeForModel(parsed.body?.model);
                const cwData = buildContextWindowEvent(usage, contextSize);
                if (cwData) {
                  sendEventToClients(clients, 'context_window', cwData);
                }
              }
            }
          } catch (err) {
            // Skip invalid entries
          }
        });
        notifyStatsWorker(logFile);
      }

      // 检测日志文件是否已轮转到新文件
      const currentLogFile = getLogFile();
      if (currentLogFile !== logFile && !watchedFiles.has(currentLogFile)) {
        // Unwatch old file to prevent watcher leak on rotation
        unwatchFile(logFile);
        watchedFiles.delete(logFile);

        // 流式分段广播，避免全量加载 OOM
        const endRotTotal = countLogEntries(currentLogFile);
        clients.forEach(client => {
          try { client.write(`event: load_start\ndata: ${JSON.stringify({ total: endRotTotal, incremental: false })}\n\n`); } catch { }
        });
        streamReconstructedEntries(currentLogFile, (segment) => {
          const data = JSON.stringify(segment);
          clients.forEach(client => {
            try { client.write(`event: load_chunk\ndata: ${data}\n\n`); } catch { }
          });
        });
        clients.forEach(client => {
          try { client.write(`event: load_end\ndata: {}\n\n`); } catch { }
        });
        watchLogFile({ ...opts, logFile: currentLogFile });
      }
    } catch (err) {
      // File not yet created, will retry on next poll
    }
  });
}

/**
 * Start watching the current log file + install statusLine + context window.
 * @param {object} opts
 * @param {string} opts.logFile - current LOG_FILE
 * @param {Array} opts.clients - SSE clients array
 * @param {Function} opts.getClaudePid
 * @param {Function} opts.runParallelHook
 * @param {Function} opts.notifyStatsWorker
 * @param {Function} opts.getLogFile
 */
export function startWatching(opts) {
  const { clients, ...watchOpts } = opts;
  watchLogFile({ ...watchOpts, clients });
}

/** Get the watchedFiles Map (for cleanup in stopViewer). */
export function getWatchedFiles() {
  return watchedFiles;
}
