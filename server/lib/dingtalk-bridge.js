// DingTalk Stream bridge — connects one bound Claude Code PTY session to a DingTalk bot.
//
// Inbound  (DingTalk → session): TOPIC_ROBOT callback → ack immediately → msgId dedup →
//   access control → /stop interrupt OR inject the text as a prompt (bracketed paste).
// Outbound (session → DingTalk): on the debounced turn_end, read the Claude session
//   transcript JSONL (path forwarded from the Stop hook), assemble the last main-agent
//   text turn, chunk it, and push via the proactive App API (sessionWebhook is long expired).
//
// Design notes:
// - This module NEVER imports pty-manager / server.js. All PTY access + the streaming-busy
//   probe are injected via `deps`, so the unit test mocks them with zero node-pty / network.
// - The Stream client and outbound HTTP have test seams (__setClientFactory/__setFetchForTests).
// - Outbound text comes from the transcript JSONL on purpose: raw PTY bytes are ANSI/TUI
//   noise, and the live log-reconstruction path carries the known mainAgent-dedup bug.
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOG_DIR } from '../../findcc.js';
import { t } from '../i18n.js';

// ─── module-level singleton state (mirrors pty-manager's singleton style) ───
let client = null;
let running = false;
let connected = false;
let lastError = null;
let bridgeDeps = null;                 // saved for reloadBridge
let boundConversation = null;          // { conversationId, conversationType, robotCode }
let pendingReply = null;               // reply target for the in-flight turn
let lastRepliedTurnTs = null;          // ts of the last turn replied to — idempotency for a doubled turn_end (same ts), without suppressing later turns that repeat a short reply
let tokenCache = null;                 // { appKey, accessToken, expiresAt }
let pendingReplyTimer = null;          // self-heal timer if a turn_end never arrives
const seenMsgIds = [];                 // FIFO LRU for redelivery dedup
const SEEN_MAX = 500;
const queue = [];                      // inbound prompts waiting for the session to be free
const sendTimes = [];                  // outbound timestamps for the rate limiter
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 18;                   // stay under DingTalk's 20/min
const MAX_CHUNKS_PER_TURN = 5;
const MAX_QUEUE = 50;                  // cap inbound backlog so an authorized sender can't grow it unbounded (memory + amplified injection)
const PENDING_TIMEOUT_MS = 10 * 60_000; // clear a stuck pendingReply so the queue can't wedge forever
const STOP_WORDS = new Set(['/stop', 'stop', '停止', 'esc', '/esc']);

// ─── test seams ───
let clientFactory = null;
export function __setClientFactory(fn) { clientFactory = fn; }
let fetchImpl = null;
export function __setFetchForTests(fn) { fetchImpl = fn; }
function dtFetch(...args) { return (fetchImpl || globalThis.fetch)(...args); }
let maxQueueOverride = null;
export function __setMaxQueueForTests(n) { maxQueueOverride = n; } // lets tests exercise the cap without sending >RATE_MAX notices
function queueCap() { return maxQueueOverride ?? MAX_QUEUE; }
/** Reset all singleton state — test helper. */
export function __resetForTests() {
  client = null; running = false; connected = false; lastError = null; bridgeDeps = null;
  boundConversation = null; pendingReply = null; lastRepliedTurnTs = null; tokenCache = null;
  maxQueueOverride = null;
  if (pendingReplyTimer) { clearTimeout(pendingReplyTimer); pendingReplyTimer = null; }
  seenMsgIds.length = 0; queue.length = 0; sendTimes.length = 0;
}

// ─── pendingReply lifecycle ───
// pendingReply marks "a bridge-injected turn is in flight; the next turn_end is its reply".
// It is armed on injection and MUST be cleared on reply, /stop, or timeout — otherwise the
// one-at-a-time queue gate (which checks pendingReply) wedges the bridge forever.
function clearPending() {
  pendingReply = null;
  if (pendingReplyTimer) { clearTimeout(pendingReplyTimer); pendingReplyTimer = null; }
}
function armPending(target) {
  pendingReply = {
    conversationId: target.conversationId, conversationType: target.conversationType,
    robotCode: target.robotCode, senderStaffId: target.senderStaffId, since: Date.now(),
  };
  if (pendingReplyTimer) clearTimeout(pendingReplyTimer);
  pendingReplyTimer = setTimeout(() => {
    audit('reply-timeout', { conversationId: pendingReply?.conversationId });
    pendingReply = null; pendingReplyTimer = null;
    drainQueue(); // turn_end never came (hook missing, model awaiting input, …) → unwedge
  }, PENDING_TIMEOUT_MS);
  if (typeof pendingReplyTimer.unref === 'function') pendingReplyTimer.unref();
}

// ─── small helpers ───
function audit(event, data) {
  try {
    appendFileSync(join(LOG_DIR, 'dingtalk-audit.log'),
      JSON.stringify({ ts: new Date().toISOString(), event, ...data }) + '\n');
  } catch { /* best-effort */ }
}

/** Bracketed-paste + submit, matching the frontend's ptyChunkBuilder. Kept local so the
 *  bridge never imports pty-manager (which would pull node-pty into the unit test). */
function bracketPasteSubmit(text) {
  return ['\x1b[200~' + text + '\x1b[201~', '\r'];
}

// Leading sentinel prepended to injected prompts so the conversation view can show a DingTalk
// icon next to the message. KEEP IN SYNC with IM_ORIGIN_RE in src/utils/imOrigin.js.
const IM_ORIGIN_MARKER = '⟦im:dingtalk⟧';

/** Prepend the IM-origin marker, EXCEPT for slash commands (a marker prefix would stop the CLI
 *  from recognizing `/clear` etc.). trim() guards leading whitespace / full-width spaces. */
function markOrigin(content) {
  if (content.trim().startsWith('/')) return content;
  return IM_ORIGIN_MARKER + content;
}

/**
 * Strip the bracketed-paste terminator/initiator and all C0 control bytes (except newline
 * and tab) from untrusted inbound text. Without this, a crafted message containing
 * `\x1b[201~` (or other ESC sequences) would break out of the paste frame and inject raw
 * keystrokes into the Claude TUI. ESC itself (0x1b) is in the 0x0e–0x1f range so it's removed.
 */
function sanitizeInbound(text) {
  return String(text)
    .replace(/\x1b\[20[01]~/g, '')
    // Strip C0 controls EXCEPT tab(0x09)/newline(0x0a). CR(0x0d) is removed too: it is the
    // submit key in bracketPasteSubmit, so leaving it in inbound text would be a submit byte
    // smuggled into the paste frame — defense-in-depth, not relying on the TUI's paste mode.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
}

function remember(msgId) {
  if (!msgId) return false;
  if (seenMsgIds.includes(msgId)) return true;
  seenMsgIds.push(msgId);
  if (seenMsgIds.length > SEEN_MAX) seenMsgIds.shift();
  return false;
}

function ack(res) {
  try {
    const id = res?.headers?.messageId;
    if (!id || !client) return;
    if (typeof client.socketCallBackResponse === 'function') {
      client.socketCallBackResponse(id, { success: true });
    } else if (typeof client.send === 'function') {
      client.send(id, JSON.stringify({ status: 'SUCCESS', message: 'OK' }));
    }
  } catch { /* best-effort; ack failure only risks a redelivery, caught by dedup */ }
}

function isStopCommand(text) {
  return STOP_WORDS.has(text.trim().toLowerCase());
}

// ─── transcript extraction (the safe outbound text source) ───
function parseLine(line) {
  try { const o = JSON.parse(line); return o && typeof o === 'object' ? o : null; }
  catch { return null; }
}

function isRealUserPrompt(obj) {
  const c = obj.message?.content;
  if (typeof c === 'string') return c.trim().length > 0;
  if (Array.isArray(c)) return c.some(b => b && b.type !== 'tool_result'); // tool_result-only = continuation
  return false;
}

/**
 * Read the LAST main-agent text turn from a Claude Code transcript JSONL. Walks backward
 * from EOF, collecting contiguous assistant `text` blocks, stopping at the previous real
 * user prompt. Skips thinking/tool_use blocks, sidechain (subagent) entries, and any
 * non-message metadata sidecar lines.
 */
export function extractLastAssistantText(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return '';
  let lines;
  try { lines = readFileSync(transcriptPath, 'utf-8').split('\n'); }
  catch { return ''; }
  const parts = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    const obj = parseLine(line);
    if (!obj || !obj.type) continue;
    if (obj.type === 'assistant') {
      if (obj.isSidechain) continue;
      const content = obj.message?.content;
      if (Array.isArray(content)) {
        const txt = content.filter(b => b && b.type === 'text').map(b => b.text).join('\n').trim();
        if (txt) parts.unshift(txt);
      }
      continue;
    }
    if (obj.type === 'user') {
      if (obj.isSidechain) continue;    // subagent prompt — not the main-agent turn boundary
      if (isRealUserPrompt(obj)) break; // start of this turn — stop
      continue;                         // tool_result continuation — keep scanning
    }
    // system / summary / file-history-snapshot / metadata sidecars → skip
  }
  return parts.join('\n\n').trim();
}

// ─── chunking + rate limiting ───
export function chunkText(text, max) {
  if (!text) return [];
  if (text.length <= max) return [text];
  const chunks = [];
  let buf = '';
  for (const seg of text.split(/(\n\n)/)) {
    if ((buf + seg).length <= max) { buf += seg; continue; }
    if (buf) { chunks.push(buf); buf = ''; }
    if (seg.length > max) {
      let rest = seg;
      while (rest.length > max) {
        let cut = rest.lastIndexOf('\n', max);
        if (cut <= 0) cut = rest.lastIndexOf(' ', max);
        if (cut <= 0) cut = max;
        chunks.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      buf = rest;
    } else {
      buf = seg;
    }
  }
  if (buf) chunks.push(buf);
  return chunks.map(c => c.trim()).filter(Boolean);
}

async function rateLimitGate() {
  const now = Date.now();
  while (sendTimes.length && now - sendTimes[0] > RATE_WINDOW_MS) sendTimes.shift();
  if (sendTimes.length >= RATE_MAX) {
    const wait = RATE_WINDOW_MS - (now - sendTimes[0]) + 50;
    await new Promise(r => setTimeout(r, wait));
    return rateLimitGate();
  }
  sendTimes.push(Date.now());
}

// ─── DingTalk App API (proactive send; sessionWebhook is expired by reply time) ───
const TOKEN_URL = 'https://api.dingtalk.com/v1.0/oauth2/accessToken';
const GROUP_SEND_URL = 'https://api.dingtalk.com/v1.0/robot/groupMessages/send';
const OTO_SEND_URL = 'https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend';

async function getAccessToken(cfg) {
  if (tokenCache && tokenCache.appKey === cfg.appKey && tokenCache.expiresAt > Date.now() + 300_000) {
    return tokenCache.accessToken;
  }
  const r = await dtFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appKey: cfg.appKey, appSecret: cfg.appSecret }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.accessToken) throw new Error(`token ${r.status}: ${j.message || j.code || 'failed'}`);
  tokenCache = { appKey: cfg.appKey, accessToken: j.accessToken, expiresAt: Date.now() + (j.expireIn || 7200) * 1000 };
  return j.accessToken;
}

async function sendOne(cfg, target, content) {
  await rateLimitGate();
  const token = await getAccessToken(cfg);
  const msgParam = JSON.stringify({ title: t('server.dingtalk.replyChunkTitle'), text: content });
  const isGroup = String(target.conversationType) === '2';
  const url = isGroup ? GROUP_SEND_URL : OTO_SEND_URL;
  const body = isGroup
    ? { robotCode: target.robotCode, openConversationId: target.conversationId, msgKey: 'sampleMarkdown', msgParam }
    : { robotCode: target.robotCode, userIds: [target.senderStaffId].filter(Boolean), msgKey: 'sampleMarkdown', msgParam };
  const r = await dtFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-acs-dingtalk-access-token': token },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(`send ${r.status}: ${j.message || j.code || 'failed'}`);
  }
}

async function sendReply(cfg, target, text) {
  let chunks = chunkText(text, cfg.maxChunkChars);
  if (chunks.length > MAX_CHUNKS_PER_TURN) {
    chunks = chunks.slice(0, MAX_CHUNKS_PER_TURN);
    chunks[MAX_CHUNKS_PER_TURN - 1] += '\n\n' + t('server.dingtalk.truncated');
  }
  for (const c of chunks) {
    try { await sendOne(cfg, target, c); }
    catch (e) { lastError = String(e?.message || e); audit('send-error', { error: lastError }); break; }
  }
  audit('out', { conversationId: target.conversationId, chunks: chunks.length });
}

// ─── inbound ───
async function onInbound(res) {
  ack(res); // MUST be first: DingTalk redelivers if not acked within ~5-15s
  let msg;
  try { msg = JSON.parse(res?.data ?? '{}'); } catch { return; }
  const msgId = res?.headers?.messageId;
  if (remember(msgId)) return; // redelivery

  const text = sanitizeInbound(msg.text?.content ?? '').trim();
  const conversationId = msg.conversationId;
  const conversationType = msg.conversationType;
  const senderStaffId = msg.senderStaffId;
  const robotCode = msg.robotCode || msg.chatbotUserId;
  const cfg = bridgeDeps.getConfig();
  const target = { conversationId, conversationType, robotCode, senderStaffId };

  // access control: allowlist (if any) else bind-first-conversation
  if (cfg.allowStaffIds.length > 0) {
    if (!cfg.allowStaffIds.includes(senderStaffId)) {
      audit('reject-staff', { senderStaffId, conversationId });
      void sendReply(cfg, target, t('server.dingtalk.notAuthorized'));
      return;
    }
  } else if (!boundConversation) {
    boundConversation = { conversationId, conversationType, robotCode };
    audit('bind', { conversationId });
  } else if (conversationId !== boundConversation.conversationId) {
    audit('reject-conversation', { conversationId });
    void sendReply(cfg, target, t('server.dingtalk.notBound'));
    return;
  }

  audit('in', { msgId, senderStaffId, conversationId, len: text.length });
  if (!text) return; // non-text messages (image/voice/file) are ignored in v1

  if (isStopCommand(text)) {
    bridgeDeps.writeToPty('\x1b'); // ESC interrupts the current turn (NOT killPty)
    audit('stop', { conversationId });
    // Interrupting may mean the in-flight turn never emits a turn_end; clear the pending
    // reply and resume the queue so /stop can never wedge the bridge.
    clearPending();
    void sendReply(cfg, target, t('server.dingtalk.interrupted'));
    drainQueue();
    return;
  }

  if (queue.length >= queueCap()) {
    audit('queue-full', { conversationId, queued: queue.length });
    void sendReply(cfg, target, t('server.dingtalk.queueFull'));
    return;
  }
  queue.push({ ...target, content: text });
  if (pendingReply || bridgeDeps.isStreaming()) {
    void sendReply(cfg, target, t('server.dingtalk.busyQueued'));
  }
  drainQueue();
}

function drainQueue() {
  while (queue.length) {
    if (pendingReply || bridgeDeps.isStreaming()) return; // a turn is in flight
    const item = queue[0];
    const st = bridgeDeps.getPtyState();
    if (!st.running || bridgeDeps.getPtyKind() !== 'claude') {
      queue.shift();
      const cfg = bridgeDeps.getConfig();
      void sendReply(cfg, item, t('server.dingtalk.noSession'));
      continue;
    }
    queue.shift();
    const cfg = bridgeDeps.getConfig();
    const skipPerm = bridgeDeps.getPtySkipPermissions();
    // P2-5: optional hard block — when the session runs skip-permissions AND the admin opted
    // in, refuse to inject (remote input would execute with no approval) and tell the sender.
    if (skipPerm && cfg.blockOnSkipPermissions) {
      audit('skip-perm-blocked', { conversationId: item.conversationId });
      void sendReply(cfg, item, t('server.dingtalk.skipPermBlocked'));
      continue; // not armed, not injected — move to the next queued prompt
    }
    armPending(item);
    const injectedSince = pendingReply.since; // identity of this injection, for the failure guard
    if (skipPerm) {
      audit('skip-perm-warning', { conversationId: item.conversationId });
      void sendReply(cfg, item, t('server.dingtalk.skipPermWarning'));
    }
    // P1-1: react to a failed injection (PTY gone/died mid-write → onComplete(false)). Without
    // this the prompt never submits, no turn_end ever comes, and pendingReply wedges the queue
    // until the 10-min timeout. Only act if this same injection is still pending (a /stop or
    // timeout may have cleared it in the settle window).
    bridgeDeps.writeToPtySequential(bracketPasteSubmit(markOrigin(item.content)), (ok) => {
      if (ok) return;
      if (!pendingReply || pendingReply.since !== injectedSince) return;
      audit('inject-failed', { conversationId: item.conversationId });
      clearPending();
      void sendReply(bridgeDeps.getConfig(), item, t('server.dingtalk.injectFailed'));
      drainQueue();
    }, { settleMs: 250 });
    return; // one at a time; resume on the next turn_end
  }
}

// ─── outbound trigger (called from server.js _emitTurnEnd) ───
export async function notifyTurnEnd(sessionId, ts, transcriptPath) {
  if (!pendingReply) { drainQueue(); return; } // only reply to turns the bridge initiated
  // A turn_end whose turn ended before we injected belongs to an earlier (e.g. local) turn,
  // not ours — don't consume our pending slot or leak that turn's text. (Narrow window;
  // full per-turn correlation is a v2 item.)
  if (ts && pendingReply.since && ts < pendingReply.since) { drainQueue(); return; }
  const target = pendingReply;
  clearPending();
  // Idempotency for a doubled turn_end of the SAME turn (a re-broadcast carries the same ts).
  // Keyed on ts, NOT reply text — the old text signature wrongly suppressed a later turn whose
  // reply happened to repeat a short confirmation (e.g. "完成。").
  if (ts && ts === lastRepliedTurnTs) { drainQueue(); return; }
  lastRepliedTurnTs = ts || null;
  let text = extractLastAssistantText(transcriptPath);
  if (!text) text = t('server.dingtalk.noTextReply');
  try { await sendReply(bridgeDeps.getConfig(), target, text); }
  catch (e) { lastError = String(e?.message || e); audit('send-error', { error: lastError }); }
  drainQueue(); // process the next queued prompt, if any
}

// ─── lifecycle ───
export async function startBridge(deps) {
  if (deps) bridgeDeps = deps;
  if (running) return;
  // Guard: reloadBridge() (from the config route) calls startBridge with no deps. If the
  // bridge was never primed with deps (non-CLI mode, where no singleton PTY exists), refuse
  // to start — otherwise onInbound would dereference a null bridgeDeps.
  if (!bridgeDeps || typeof bridgeDeps.getConfig !== 'function') { audit('start-skipped', { reason: 'no-deps' }); return; }
  const cfg = bridgeDeps.getConfig();
  if (!cfg || !cfg.enabled || !cfg.appKey || !cfg.appSecret) return; // off / incomplete → no-op
  try {
    if (clientFactory) {
      client = clientFactory({ clientId: cfg.appKey, clientSecret: cfg.appSecret });
      if (typeof client.registerCallbackListener === 'function') client.registerCallbackListener('__test__', onInbound);
    } else {
      const mod = await import('dingtalk-stream');
      const { DWClient, TOPIC_ROBOT } = mod;
      client = new DWClient({ clientId: cfg.appKey, clientSecret: cfg.appSecret });
      client.registerCallbackListener(TOPIC_ROBOT, onInbound);
    }
    await client.connect?.();
    running = true;
    connected = true;
    lastError = null;
    audit('start', { appKeyTail: cfg.appKey.slice(-4) });
  } catch (e) {
    lastError = String(e?.message || e);
    connected = false;
    audit('start-error', { error: lastError });
  }
}

export async function stopBridge() {
  try { await client?.disconnect?.(); } catch { /* best-effort */ }
  client = null;
  running = false;
  connected = false;
  boundConversation = null;
  clearPending();
  queue.length = 0;
}

export async function reloadBridge(deps) {
  await stopBridge();
  await startBridge(deps);
}

export function isBridgeRunning() { return running; }

export function getBridgeStatus() {
  const tail = bridgeDeps?.getConfig?.()?.appKey?.slice(-4) || '';
  return {
    running,
    connected,
    lastError,
    boundConversationId: boundConversation?.conversationId || null,
    appKeyTail: tail,
  };
}

/** Validate credentials without opening a Stream connection (the Test button). */
export async function testConnection(cfg) {
  try {
    tokenCache = null; // force a fresh fetch
    await getAccessToken(cfg);
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: String(e?.message || e) };
  }
}
