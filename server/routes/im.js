// Generic multi-IM bridge config + process-control API. Platform-parametric (keyed by descriptor id).
//
//   GET  /api/im/:platform/status  — public; remote callers get only enabled+hasSecret+connection,
//                                    the local (admin) caller additionally gets plaintext secrets + process info.
//   POST /api/im/:platform/config  — loopback-only; save creds, then drive the process manager
//                                    (enable→stop+spawn worker, disable→stop). Enabling requires a
//                                    non-empty allowlist (the worker runs with --dangerously-skip-permissions).
//   POST /api/im/:platform/test    — loopback-only; validate creds (fetch an access token).
//   POST /api/im/:platform/process — loopback-only; {action:start|stop|restart} the detached worker.
//   GET  /api/im/:platform/logs    — resolve the worker's latest .jsonl (for the records popup).
//
// Architecture: IM adapters no longer run in the main ccv. Each enabled IM runs as an independent
// detached ccv worker (im-process-manager). In the MAIN process, status/process routes go through the
// manager (lock + loopback probe of the worker). In a WORKER process (CCV_IM_PLATFORM set), status
// reports its own in-process adapter (deps.im.getBridgeStatus) — that's what the manager probes.
import { getDescriptor, loadConfig, loadState, saveConfig } from '../lib/im-config.js';
import { findRecentLog } from '../lib/interceptor-core.js';
import { LOG_DIR } from '../../findcc.js';
import { join, basename } from 'node:path';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const IM_RE = /^\/api\/im\/([a-z0-9_-]+)\/(status|config|test|process|logs)$/;

/** Resolve a known platform id from the URL, or null (→ 404) for an unknown one. */
function platformOf(url) {
  const m = IM_RE.exec(url);
  if (!m) return null;
  return getDescriptor(m[1]) ? m[1] : null;
}

function imPredicate(verb, method) {
  return (url, m) => {
    if (m !== method) return false;
    const x = IM_RE.exec(url);
    return !!x && x[2] === verb;
  };
}

function notFound(res) {
  res.writeHead(404, JSON_HEADERS);
  res.end(JSON.stringify({ error: 'Unknown IM platform' }));
}
function loopbackOnly(res) {
  res.writeHead(403, JSON_HEADERS);
  res.end(JSON.stringify({ error: 'Loopback only' }));
}

function secretKeys(id) {
  return getDescriptor(id).fields.filter((f) => f.type === 'secret').map((f) => f.key);
}

function readBody(req, deps, cb) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > deps.MAX_POST_BODY) req.destroy();
  });
  req.on('end', () => cb(body));
}

async function imStatus(req, res, parsedUrl, isLocal, deps) {
  const id = platformOf(parsedUrl.pathname);
  if (!id) { notFound(res); return; }
  const state = loadState(id);

  let connection;
  let processInfo = null;
  if (deps.im.isWorker) {
    // WORKER: report its own in-process adapter status — this is exactly what the main process's
    // manager probes over loopback to learn whether the bot is actually connected.
    connection = deps.im.getBridgeStatus(id);
  } else {
    // MAIN: the adapter runs in a detached worker, not here. Resolve process+connection via manager.
    processInfo = await deps.im.getProcessStatus(id);
    connection = { running: processInfo.running, connected: processInfo.connected };
  }

  res.writeHead(200, JSON_HEADERS);
  if (!isLocal) {
    // Loopback gate: a token-authorized LAN client sees only what the header chip needs.
    res.end(JSON.stringify({
      enabled: state.enabled,
      hasSecret: state.hasSecret,
      connection: { running: connection.running, connected: connection.connected },
    }));
    return;
  }
  // 本机(127.0.0.1)= admin / 或 manager 探活：附带明文密钥与 pid（供身份匹配），镜像旧策略。
  const cfg = loadConfig(id);
  const secrets = {};
  for (const k of secretKeys(id)) secrets[k] = cfg[k];
  res.end(JSON.stringify({
    ...state,
    ...secrets,
    connection,
    process: processInfo,
    pid: deps.im.isWorker ? process.pid : (processInfo?.pid ?? null),
  }));
}

function imConfigPost(req, res, parsedUrl, isLocal, deps) {
  const id = platformOf(parsedUrl.pathname);
  if (!id) { notFound(res); return; }
  if (!isLocal) { loopbackOnly(res); return; }
  readBody(req, deps, async (body) => {
    let incoming;
    try { incoming = JSON.parse(body); }
    catch {
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }
    // 发送者白名单为非必填：启用时若白名单为空，不再硬拦截，而是允许保存（前端会弹安全警告）。
    // 安全提示：worker 以 --dangerously-skip-permissions 运行；白名单为空时运行期退化为
    // bind-first-conversation（im-bridge-core.js）——首个向机器人发消息的会话被绑定，该会话内任何人
    // 都可无审批驱动本地会话。这里打一条服务端审计（curl/headless 启用走不到前端 toast），
    // PreToolUse permissions.deny 硬拦截（perm-bridge/im-deny，独立于白名单）仍然生效。
    if (incoming.enabled) {
      const allowField = getDescriptor(id).allowListField;
      // 过滤空白项后再判空：saveConfig 会 normalize（trim+丢空），若只看原始长度，[" "] 这类全空白
      // 白名单会被当成"已配置"而漏掉审计告警，但实际保存的是空名单（与 dingtalk 路由保持一致）。
      const raw = Array.isArray(incoming[allowField]) ? incoming[allowField] : [];
      const list = raw.filter((s) => typeof s === 'string' && s.trim());
      if (list.length === 0) {
        console.warn(`[CC Viewer] IM ${id} enabled with EMPTY allowlist — bind-first-conversation; the first conversation to message can drive this --dangerously-skip-permissions session`);
      }
    }
    const saved = saveConfig(id, incoming);
    // 驱动进程管理器（替代旧的在进程 reloadBridge）：启用→重启 worker（吸收新凭证），停用→停 worker。
    try {
      if (saved.enabled) await deps.im.restartProcess(id);
      else await deps.im.stopProcess(id);
    } catch (e) {
      // 进程操作失败不应阻塞配置保存的响应，但必须记录——否则 worker 起不来时用户看到乐观的
      // running:true 却毫无线索（spawn 失败 / EACCES on process.out.log 等）。
      console.error(`[CC Viewer] IM config apply failed for ${id}:`, e?.message || e);
    }
    res.writeHead(200, JSON_HEADERS);
    // 乐观返回：worker 刚 spawn 尚未就绪，避免回包瞬间显示"已停止"；chip 轮询会很快收敛到真实态。
    res.end(JSON.stringify({ ...loadState(id), connection: { running: !!saved.enabled, connected: false } }));
  });
}

function imTestPost(req, res, parsedUrl, isLocal, deps) {
  const id = platformOf(parsedUrl.pathname);
  if (!id) { notFound(res); return; }
  if (!isLocal) { loopbackOnly(res); return; }
  readBody(req, deps, async (body) => {
    let incoming = {};
    try { incoming = body ? JSON.parse(body) : {}; } catch { /* fall back to stored */ }
    const stored = loadConfig(id);
    const cfg = {};
    for (const f of getDescriptor(id).fields) cfg[f.key] = incoming[f.key] || stored[f.key];
    const missing = getDescriptor(id).fields
      .filter((f) => (f.type === 'cred' || f.type === 'secret') && !cfg[f.key])
      .map((f) => f.key);
    if (missing.length) {
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ ok: false, detail: `missing ${missing.join('/')}` }));
      return;
    }
    const result = await deps.im.testConnection(id, cfg);
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(result));
  });
}

function imProcessPost(req, res, parsedUrl, isLocal, deps) {
  const id = platformOf(parsedUrl.pathname);
  if (!id) { notFound(res); return; }
  if (!isLocal) { loopbackOnly(res); return; }
  // 只有主进程负责管理 worker；worker 自身不应被要求 spawn/stop（避免嵌套）。
  if (deps.im.isWorker) {
    res.writeHead(409, JSON_HEADERS);
    res.end(JSON.stringify({ error: 'Process control is only available in the main ccv process' }));
    return;
  }
  readBody(req, deps, async (body) => {
    let action;
    try { action = JSON.parse(body || '{}').action; } catch { /* invalid → handled below */ }
    try {
      if (action === 'stop') await deps.im.stopProcess(id);
      else if (action === 'restart') await deps.im.restartProcess(id);
      else if (action === 'start') await deps.im.startProcess(id);
      else {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'action must be start|stop|restart' }));
        return;
      }
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ ok: true, process: await deps.im.getProcessStatus(id) }));
    } catch (e) {
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
    }
  });
}

function imLogs(req, res, parsedUrl, isLocal, deps) {
  const id = platformOf(parsedUrl.pathname);
  if (!id) { notFound(res); return; }
  const project = `IM_${id}`;
  let latest = null;
  try {
    const abs = findRecentLog(join(LOG_DIR, project), project); // 已排除 *_temp.jsonl
    if (abs) latest = `${project}/${basename(abs)}`; // 相对 LOG_DIR，直接喂给 /api/local-log?file=
  } catch { /* 无目录/无日志 → latest=null */ }
  res.writeHead(200, JSON_HEADERS);
  res.end(JSON.stringify({ project, latest }));
}

export const imRoutes = [
  { predicate: imPredicate('status', 'GET'), handler: imStatus },
  { predicate: imPredicate('config', 'POST'), handler: imConfigPost },
  { predicate: imPredicate('test', 'POST'), handler: imTestPost },
  { predicate: imPredicate('process', 'POST'), handler: imProcessPost },
  { predicate: imPredicate('logs', 'GET'), handler: imLogs },
];
