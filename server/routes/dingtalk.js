// DingTalk bridge config API. See server/lib/dingtalk-config.js (storage) and
// server/lib/dingtalk-bridge.js (the Stream client) for the underlying logic.
//
//   GET  /api/dingtalk/status — public; remote callers get only hasSecret, the local (admin)
//                               caller additionally gets the plaintext appSecret to view/copy.
//   POST /api/dingtalk/config — loopback-only (!isLocal → 403); save creds, reload bridge.
//   POST /api/dingtalk/test   — loopback-only; validate creds (fetch an access token).
import { loadDingTalkState, saveDingTalkConfig, loadDingTalkConfig } from '../lib/dingtalk-config.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function readBody(req, deps, cb) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > deps.MAX_POST_BODY) req.destroy();
  });
  req.on('end', () => cb(body));
}

function dingtalkStatus(req, res, parsedUrl, isLocal, deps) {
  const conn = deps.dingtalk.getBridgeStatus();
  res.writeHead(200, JSON_HEADERS);
  if (!isLocal) {
    // Loopback gate: a token-authorized LAN client must not see the appKey, the staffId
    // allowlist, the bound conversation id, or raw error strings. Expose only the minimum the
    // header status chip needs. (config/test are already loopback-only.)
    res.end(JSON.stringify({
      enabled: loadDingTalkState().enabled,
      hasSecret: loadDingTalkState().hasSecret,
      connection: { running: conn.running, connected: conn.connected },
    }));
    return;
  }
  // 本机(127.0.0.1)= admin：附带明文 appSecret 供本人查阅/复制（镜像 /api/auth/state 的密码、
  // /api/proxy-profiles 的 apiKey 策略）。上方 !isLocal 分支只下发 hasSecret，绝不下发 secret。
  res.end(JSON.stringify({ ...loadDingTalkState(), appSecret: loadDingTalkConfig().appSecret, connection: conn }));
}

function dingtalkConfigPost(req, res, parsedUrl, isLocal, deps) {
  // Loopback-only: an app_secret must never be settable over the LAN even with a valid token.
  if (!isLocal) {
    res.writeHead(403, JSON_HEADERS);
    res.end(JSON.stringify({ error: 'Loopback only' }));
    return;
  }
  readBody(req, deps, (body) => {
    let incoming;
    try { incoming = JSON.parse(body); }
    catch {
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }
    // saveDingTalkConfig preserves the stored secret when appSecret is empty/omitted.
    saveDingTalkConfig({
      enabled: incoming.enabled,
      appKey: incoming.appKey,
      appSecret: incoming.appSecret,
      allowStaffIds: incoming.allowStaffIds,
      maxChunkChars: incoming.maxChunkChars,
      blockOnSkipPermissions: incoming.blockOnSkipPermissions,
    });
    // Apply immediately: stop the old Stream connection and (re)start with the new config.
    Promise.resolve(deps.dingtalk.reloadBridge()).catch(() => {});
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({ ...loadDingTalkState(), connection: deps.dingtalk.getBridgeStatus() }));
  });
}

function dingtalkTestPost(req, res, parsedUrl, isLocal, deps) {
  if (!isLocal) {
    res.writeHead(403, JSON_HEADERS);
    res.end(JSON.stringify({ error: 'Loopback only' }));
    return;
  }
  readBody(req, deps, async (body) => {
    let incoming = {};
    try { incoming = body ? JSON.parse(body) : {}; } catch { /* fall back to stored */ }
    const stored = loadDingTalkConfig();
    const cfg = {
      appKey: incoming.appKey || stored.appKey,
      // empty appSecret → use the stored one (the UI masks it, so edits often omit it)
      appSecret: incoming.appSecret || stored.appSecret,
    };
    if (!cfg.appKey || !cfg.appSecret) {
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ ok: false, detail: 'missing appKey/appSecret' }));
      return;
    }
    const result = await deps.dingtalk.testConnection(cfg);
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(result));
  });
}

export const dingtalkRoutes = [
  { method: 'GET', match: 'exact', path: '/api/dingtalk/status', handler: dingtalkStatus },
  { method: 'POST', match: 'exact', path: '/api/dingtalk/config', handler: dingtalkConfigPost },
  { method: 'POST', match: 'exact', path: '/api/dingtalk/test', handler: dingtalkTestPost },
];
