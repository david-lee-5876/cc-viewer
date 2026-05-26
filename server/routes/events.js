// SSE event stream + log-registration / resume / turn-end routes (moved verbatim from server.js).
import { existsSync, readFileSync } from 'node:fs';
import { LOG_FILE, _resumeState, resolveResumeChoice, _projectName } from '../interceptor.js';
import { LOG_DIR } from '../../findcc.js';
import { watchLogFile } from '../lib/log-watcher.js';
import { countLogEntries, streamRawEntriesAsync, readPagedEntries } from '../lib/log-stream.js';
import { awaitDrainOrClose } from '../lib/sse-backpressure.js';
import { enrichRawIfNeeded } from '../lib/enrich-plan-input.js';
import { isMainAgentEntry, extractCachedContent } from '../lib/kv-cache-analyzer.js';
import { CONTEXT_WINDOW_FILE, readModelContextSize, buildContextWindowEvent, getContextSizeForModel } from '../lib/context-watcher.js';

function turnEndNotify(req, res, parsedUrl, isLocal, deps) {
  if (!isLocal) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Loopback only' }));
    return;
  }
  if (req.headers['x-ccviewer-internal'] !== deps.INTERNAL_TOKEN) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid bridge token' }));
    return;
  }
  let body = '';
  let truncated = false;
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 16384) { truncated = true; req.destroy(); }
  });
  req.on('end', () => {
    if (truncated) {
      console.warn('[turn-end-notify] body exceeded 16KB cap — request destroyed');
      return; // socket already closed by destroy()
    }
    let payload = {};
    let badJson = false;
    try { payload = body ? JSON.parse(body) : {}; }
    catch { badJson = true; console.warn('[turn-end-notify] malformed JSON body'); }
    if (badJson) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'malformed JSON body' }));
      return;
    }
    deps.scheduleTurnEndBroadcast(payload.sessionId || null, payload.ts || Date.now());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
}

// 注册新的日志文件进行 watch（供新进程复用旧服务时调用）
function registerLog(req, res, parsedUrl, isLocal, deps) {
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > deps.MAX_POST_BODY) req.destroy(); });
  req.on('end', () => {
    try {
      const { logFile } = JSON.parse(body);
      if (logFile && typeof logFile === 'string' && logFile.startsWith(LOG_DIR) && existsSync(logFile)) {
        watchLogFile(deps.logWatcherOpts(logFile));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid log file path' }));
      }
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body' }));
    }
  });
}

// 用户选择继续/新开日志
function resumeChoice(req, res, parsedUrl, isLocal, deps) {
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > deps.MAX_POST_BODY) req.destroy(); });
  req.on('end', async () => {
    try {
      const { choice } = JSON.parse(body);
      if (choice !== 'continue' && choice !== 'new') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid choice' }));
        return;
      }
      const result = resolveResumeChoice(choice);
      if (!result) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Already resolved' }));
        return;
      }
      // 重新 watch 最终的日志文件
      watchLogFile(deps.logWatcherOpts(result.logFile));
      // 广播 resume_resolved + full_reload
      const resolvedData = JSON.stringify({ logFile: result.logFile });
      deps.clients.forEach(client => {
        try {
          client.write(`event: resume_resolved\ndata: ${resolvedData}\n\n`);
        } catch { }
      });
      // 流式分段广播 full_reload，避免全量加载 OOM
      const reloadTotal = countLogEntries(LOG_FILE);
      deps.clients.forEach(client => {
        try { client.write(`event: load_start\ndata: ${JSON.stringify({ total: reloadTotal, incremental: false })}\n\n`); } catch { }
      });
      await streamRawEntriesAsync(LOG_FILE, (raw) => {
        deps.clients.forEach(client => {
          try { client.write('event: load_chunk\ndata: ['); client.write(raw.replace(/\n/g, '')); client.write(']\n\n'); } catch { }
        });
      });
      deps.clients.forEach(client => {
        try { client.write(`event: load_end\ndata: {}\n\n`); } catch { }
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, logFile: result.logFile }));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body' }));
    }
  });
}

// SSE endpoint
// 构造「有新版」徽标的 SSE 帧（pending = {version, source}）。pending 为空返回 null。
// 抽成纯函数便于单测帧格式；events() 在新连接上调用它补推，使版本徽标跨刷新持续显示。
export function sseUpdateBadgeFrame(pending) {
  return pending
    ? `event: update_major_available\ndata: ${JSON.stringify(pending)}\n\n`
    : null;
}

async function events(req, res, parsedUrl, isLocal, deps) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // 注意：不要在此处 clients.push(res)！
  // 必须等 load_end + kv_cache + context_window 全部发送完毕后再加入广播列表，
  // 否则 streamRawEntriesAsync 的 setImmediate yield 间隙会让 watcher 的
  // sendToClients 向该客户端推送 live entry，而 load_end 的 setState 会覆盖这些
  // 已处理的 live entry，导致 对话条目"显示→消失→重现"闪烁。

  // SSE 心跳保活：每 30s 发送 ping 事件，防止连接被 OS/代理/浏览器静默断开
  const pingTimer = setInterval(() => {
    try { res.write('event: ping\ndata: {}\n\n'); } catch {}
  }, 30000);

  // server_config: 给前端推一次性的关键运行时常量，让前端 cooldown / debounce 等
  // 模块常量能跟随 server env 自动对齐（避免「server 改了 env、前端写死」漂移）。
  // 见 server.js 顶部 turnEnd debounce 的 SUNSET-MARKER 注释。
  // write 失败要 warn：之前静默吞会让 env override 漂移到前端硬常量 10s 而无人发觉。
  try {
    res.write(`event: server_config\ndata: ${JSON.stringify({ turnEndDebounceMs: deps.turnEndDebounceMs })}\n\n`);
  } catch (err) {
    console.warn(`[server_config] SSE write failed (turnEndDebounceMs=${deps.turnEndDebounceMs}):`, err && err.message);
  }

  // 如果有待决的 resume 选择，发送 resume_prompt 事件
  if (_resumeState) {
    res.write(`event: resume_prompt\ndata: ${JSON.stringify({ recentFileName: _resumeState.recentFileName })}\n\n`);
  }

  // 补推「有新版」徽标：复用启动检查缓存的结果，让刷新/新标签页连上即恢复徽标。
  // 置于 deps.clients.push(res) 之前 → 新客户端仅得一份，不与一次性广播竞态。
  const updFrame = sseUpdateBadgeFrame(deps.pendingMajorUpdate);
  if (updFrame) res.write(updFrame);

  // 增量加载参数：移动端带 since/cc/project 请求增量数据
  const sinceParam = parsedUrl.searchParams.get('since');
  const ccParam = parseInt(parsedUrl.searchParams.get('cc'), 10) || 0;
  const projectParam = parsedUrl.searchParams.get('project');
  const projectMatch = !projectParam || projectParam === (_projectName || '');
  const useIncremental = !!(sinceParam && ccParam > 0 && projectMatch && !isNaN(new Date(sinceParam).getTime()));

  // 分页参数：
  // - mobile 首次加载传 ?limit=200
  // - bare desktop 请求（无任何 query 参数）默认套 DEFAULT_EVENTS_LIMIT
  // - 显式 ?limit=0 表示"我要全量"（保留旧行为入口）
  const limitParamRaw = parsedUrl.searchParams.get('limit');
  const limitParamGiven = limitParamRaw !== null;
  const limitParamNum = parseInt(limitParamRaw, 10);
  let effectiveLimit = 0;
  if (!useIncremental) {
    if (limitParamGiven) {
      effectiveLimit = Number.isFinite(limitParamNum) && limitParamNum > 0 ? limitParamNum : 0;
    } else {
      effectiveLimit = deps.DEFAULT_EVENTS_LIMIT;
    }
  }
  const useLimit = effectiveLimit > 0;

  // KV-Cache / context_window 追踪（扫描全量条目，不受 since 过滤影响）
  let latestKvCache = null;
  let latestContextWindow = null;
  let pushedContextWindow = false;

  await streamRawEntriesAsync(LOG_FILE, async (raw) => {
    // 直接发送原始 JSON 字符串，不做 parse/reconstruct/stringify
    // ExitPlanMode V2 空 input 的条目按需补全 plan / planFilePath，其它原样透传
    if (res.destroyed || !res.writable) return;
    const out = enrichRawIfNeeded(raw);
    // SSE data 字段不允许裸换行，去除 pretty-printed JSON 的换行
    // 写入路径整体 try-catch 兜底：连接在 res.write 之间被对端 RST/destroy 时不至于
    // 把 EPIPE 抛穿 async callback；res.on('close'|'error') 已会做 clients 数组清理。
    let drained = true;
    try {
      res.write('event: load_chunk\ndata: [');
      drained = res.write(out.includes('\n') ? out.replace(/\n/g, '') : out);
      res.write(']\n\n');
    } catch {
      return;
    }
    // 写缓冲满则等 drain（或 close/error/超时任一 fulfill），防止浏览器侧 renderer OOM。
    // helper 内部会在 fulfill 时把另外两个监听器从 res 上摘掉，避免 N 次 backpressure
    // 累积出 N 个 stale close/error listener 触发 MaxListenersExceededWarning。
    if (!drained) {
      await awaitDrainOrClose(res, deps.SSE_BACKPRESSURE_TIMEOUT_MS);
    }
  }, {
    since: useIncremental ? sinceParam : undefined,
    limit: useLimit ? effectiveLimit : undefined,
    onScan: (raw) => {
      // 轻量追踪最新 MainAgent 的 KV-Cache 和 context_window（仅 regex 检测）
      if (raw.includes('"mainAgent":true') || raw.includes('"mainAgent": true')) {
        try {
          const entry = JSON.parse(raw);
          if (isMainAgentEntry(entry)) {
            const cached = extractCachedContent(entry);
            if (cached) latestKvCache = cached;
            const usage = entry.response?.body?.usage;
            if (usage) {
              const contextSize = getContextSizeForModel(entry.body?.model);
              const cw = buildContextWindowEvent(usage, contextSize);
              if (cw) latestContextWindow = cw;
            }
          }
        } catch { }
      }
    },
    onReady: ({ totalCount, hasMore, oldestTs }) => {
      // Pass 1 完成、Pass 2 开始前：发送 load_start
      // 增量模式下不显示 loading 遮罩，非增量模式显示进度
      const loadStartData = { total: totalCount, incremental: !!useIncremental };
      // 分页模式下附加 hasMore/oldestTs（增量模式由客户端从缓存自行判断）
      if (useLimit) {
        loadStartData.hasMore = !!hasMore;
        loadStartData.oldestTs = oldestTs || '';
      }
      res.write(`event: load_start\ndata: ${JSON.stringify(loadStartData)}\n\n`);
    },
  });

  res.write(`event: load_end\ndata: {}\n\n`);

  // 发送最新 MainAgent 的 KV-Cache 和 context_window
  if (latestKvCache) {
    res.write(`event: kv_cache_content\ndata: ${JSON.stringify(latestKvCache)}\n\n`);
  }
  if (latestContextWindow) {
    res.write(`event: context_window\ndata: ${JSON.stringify(latestContextWindow)}\n\n`);
    pushedContextWindow = true;
  }
  // Fallback: no MainAgent in log (e.g. fresh session after -c), read context-window.json
  if (!pushedContextWindow) {
    try {
      const cwRaw = readFileSync(CONTEXT_WINDOW_FILE, 'utf-8');
      const cwFile = JSON.parse(cwRaw);
      if (cwFile?.context_window) {
        // Recalculate with correct context size from model.id
        const { contextSize } = readModelContextSize();
        const cw = cwFile.context_window;
        const inputTokens = cw.total_input_tokens || 0;
        const outputTokens = cw.total_output_tokens || 0;
        const totalTokens = inputTokens + outputTokens;
        const usedPct = contextSize > 0 ? Math.round((totalTokens / contextSize) * 100) : 0;
        const data = { ...cw, context_window_size: contextSize, used_percentage: usedPct, remaining_percentage: 100 - usedPct };
        res.write(`event: context_window\ndata: ${JSON.stringify(data)}\n\n`);
      }
    } catch { }
  }

  // 历史数据 + KV-Cache + context_window 全部发送完毕后，才将客户端加入广播列表。
  // 这样 watcher 的 sendToClients 不会在 load 阶段向该客户端推送 live entry。
  deps.clients.push(res);

  // req.on('close') 在某些异常断连时不一定立即触发；res 端 close/error 兜底保证
  // 不会在 clients 数组里留下幽灵 res，防止 sendToClients 后续写入触发慢泄漏。
  const removeFromClients = () => {
    clearInterval(pingTimer);
    const idx = deps.clients.indexOf(res);
    if (idx !== -1) deps.clients.splice(idx, 1);
  };
  req.on('close', removeFromClients);
  res.on('close', removeFromClients);
  res.on('error', removeFromClients);
}

// API endpoint
async function requests(req, res) {
  // 异步流式 JSON 数组输出，不做 reconstruct，发原始条目
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.write('[');
  let first = true;
  await streamRawEntriesAsync(LOG_FILE, (raw) => {
    if (!first) res.write(',');
    res.write(enrichRawIfNeeded(raw));
    first = false;
  });
  res.write(']');
  res.end();
}

// 分页历史条目端点：移动端"加载更多"按需拉取
function entriesPage(req, res, parsedUrl) {
  const before = parsedUrl.searchParams.get('before');
  const limitVal = Math.min(parseInt(parsedUrl.searchParams.get('limit'), 10) || 100, 500);
  if (!before || isNaN(new Date(before).getTime())) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'missing or invalid "before" parameter' }));
    return;
  }
  try {
    const result = readPagedEntries(LOG_FILE, { before, limit: limitVal });
    // entries 是原始 JSON 字符串数组，parse 后返回给客户端
    // ExitPlanMode V2 空 input 的条目用 enrichRawIfNeeded 在 raw 阶段补全
    const entries = result.entries.map(raw => {
      try { return JSON.parse(enrichRawIfNeeded(raw)); } catch { return null; }
    }).filter(Boolean);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      entries,
      hasMore: result.hasMore,
      oldestTimestamp: result.oldestTimestamp,
      count: entries.length,
    }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

export const eventsRoutes = [
  { method: 'POST', match: 'exact', path: '/api/turn-end-notify', handler: turnEndNotify },
  { method: 'POST', match: 'exact', path: '/api/register-log', handler: registerLog },
  { method: 'POST', match: 'exact', path: '/api/resume-choice', handler: resumeChoice },
  { method: 'GET', match: 'exact', path: '/events', handler: events },
  { method: 'GET', match: 'exact', path: '/api/requests', handler: requests },
  { method: 'GET', match: 'exact', path: '/api/entries/page', handler: entriesPage },
];
