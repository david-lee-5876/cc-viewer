// Generic IM bridge orchestrator — platform-agnostic glue between one bound Claude Code PTY
// session and N IM platform adapters (DingTalk, Feishu, …).
//
// Inbound  (IM → session): adapter normalizes its platform event → onInbound(normalized, ackCtx)
//   → ack immediately → msgId dedup → access control → /stop interrupt OR inject the text as a
//   prompt (bracketed paste, ⟦im:<id>⟧ origin marker).
// Outbound (session → IM): on the debounced turn_end, read the Claude session transcript JSONL
//   (path forwarded from the Stop hook), assemble the last main-agent text turn, chunk it, and
//   push via the owning adapter's sendOne.
//
// SINGLE SHARED PTY ⇒ SINGLE-FLIGHT INJECTION. Only one adapter may have an injected turn in
// flight at a time (`activeInjection`, a core-global). It replaces the per-adapter pendingReply:
// one source of truth. notifyTurnEnd routes the reply solely to the owner; the slot releases on
// every terminal path (turn-end reply / /stop / inject-failure / timeout) and the release kicks
// ALL adapters' drains so a second platform's queued prompt can proceed.
//
// Design notes:
// - This module NEVER imports pty-manager / server.js. All PTY access + the streaming-busy probe
//   are injected per platform via `deps`, so unit tests mock them with zero node-pty / network.
// - Adapters get a `ctx` ({ fetch, store }) — `fetch` is the shared test-seam'd fetch; `store` is
//   a per-instance scratch object (token cache, send client) cleared on reset.
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOG_DIR } from '../../findcc.js';
import { t } from '../i18n.js';

// ─── tunables (shared across platforms; per-platform rate caps come from adapter.rateLimit) ───
const SEEN_MAX = 500;
const RATE_WINDOW_MS = 60_000;
const MAX_CHUNKS_PER_TURN = 5;
const MAX_QUEUE = 50;                    // cap inbound backlog so an authorized sender can't grow it unbounded
const PENDING_TIMEOUT_MS = 10 * 60_000;  // release a stuck injection so the queue can't wedge forever
const CONNECT_TIMEOUT_MS = 15_000;       // bound adapter.connect() so a hung start can't block others
const STOP_WORDS = new Set(['/stop', 'stop', '停止', 'esc', '/esc']);

// ─── registry + core-global single-flight ───
const instances = new Map();             // platformId → instance
let activeInjection = null;              // { platformId, since, target } — the one in-flight turn
let activeInjectionTimer = null;         // self-heal timer if a turn_end never arrives
let fetchImpl = null;                    // shared test seam

// ─── test seams ───
export function __setFetchForTests(fn) { fetchImpl = fn; }
export function coreFetch(...args) { return (fetchImpl || globalThis.fetch)(...args); }

function newInstance(adapter) {
  return {
    adapter,
    client: null,
    running: false,
    connected: false,
    lastError: null,
    bridgeDeps: null,
    boundConversation: null,
    lastRepliedTurnTs: null,
    maxQueueOverride: null,
    seenMsgIds: [],
    queue: [],
    sendTimes: [],
    store: {},                           // adapter scratch (token cache, send client)
  };
}

/**
 * The contract every platform adapter under server/lib/adapters/ must satisfy. The core owns all
 * generic orchestration (dedup, access control, queue, single-flight inject, chunk, turn-end
 * reply); an adapter only knows its platform's transport, payload shape, and send.
 *
 * @typedef {Object} ImAdapter
 * @property {string}  id            Platform id, also the preferences.json key (e.g. 'dingtalk').
 * @property {string}  i18nNs        i18n namespace for the core's user-facing replies (e.g. 'server.feishu').
 * @property {string}  allowListField  Config key holding the sender allowlist (e.g. 'allowStaffIds').
 * @property {{max:number,windowMs:number}} [rateLimit]  Per-platform outbound cap (defaults 18/60s).
 * @property {Object}  [capabilities]  Informational flags ({inboundAck, sdkManagesToken}); not read by the core.
 * @property {(cfg:Object)=>boolean}  hasCreds        True when cfg carries enough creds to connect.
 * @property {(cfg:Object)=>Object}   [statusFields]  Extra non-secret status fields for the admin API.
 * @property {(cfg:Object, hooks:{onInbound:(normalized:Object, ackCtx:*)=>void}, ctx:{fetch,store})=>Promise<*>} connect
 *           Open the long connection; return the live client. Call hooks.onInbound(normalized, ackCtx)
 *           per inbound message, where normalized = {text, conversationId, senderId, msgId, target}.
 * @property {(client:*, ctx:{fetch,store})=>Promise<void>} [disconnect]  Tear down the client (best-effort).
 * @property {(ackCtx:*, client:*)=>void} [ack]  Ack an inbound msg (platforms that redeliver if not acked).
 * @property {(cfg:Object, target:Object, content:string, ctx:{fetch,store})=>Promise<void>} sendOne  Send one chunk.
 * @property {(cfg:Object, ctx:{fetch,store})=>Promise<{ok:boolean, detail?:string}>} testConnection  Validate creds, no socket.
 */

/** Register a platform adapter (called at adapter-module import). Idempotent per id. */
export function registerAdapter(adapter) {
  if (!instances.has(adapter.id)) instances.set(adapter.id, newInstance(adapter));
  return instances.get(adapter.id);
}

function ctxFor(inst) {
  return { fetch: coreFetch, store: inst.store };
}

function queueCap(inst) {
  return inst.maxQueueOverride ?? MAX_QUEUE;
}

// ─── activeInjection lifecycle ───
function clearActiveInjection() {
  activeInjection = null;
  if (activeInjectionTimer) { clearTimeout(activeInjectionTimer); activeInjectionTimer = null; }
}
function armActiveInjection(inst, target, since) {
  activeInjection = { platformId: inst.adapter.id, since, target };
  if (activeInjectionTimer) clearTimeout(activeInjectionTimer);
  activeInjectionTimer = setTimeout(() => {
    // Only fire if THIS injection still owns the slot (symmetry with the inject-failure guard).
    if (!activeInjection || activeInjection.since !== since) return;
    audit(inst, 'reply-timeout', { conversationId: target?.conversationId });
    clearActiveInjection();              // turn_end never came → release the slot globally…
    drainAll();                          // …and let any platform's queue proceed
  }, PENDING_TIMEOUT_MS);
  if (typeof activeInjectionTimer.unref === 'function') activeInjectionTimer.unref();
}

// ─── small helpers ───
function audit(inst, event, data) {
  try {
    appendFileSync(join(LOG_DIR, `${inst.adapter.id}-audit.log`),
      JSON.stringify({ ts: new Date().toISOString(), event, ...data }) + '\n');
  } catch { /* best-effort */ }
}

/** Bracketed-paste + submit, matching the frontend's ptyChunkBuilder. Kept local so the core
 *  never imports pty-manager (which would pull node-pty into the unit test). */
function bracketPasteSubmit(text) {
  return ['\x1b[200~' + text + '\x1b[201~', '\r'];
}

/** Prepend the IM-origin marker `⟦im:<id>⟧`, EXCEPT for slash commands (a marker prefix would
 *  stop the CLI from recognizing `/clear` etc.). trim() guards leading whitespace / full-width
 *  spaces. KEEP IN SYNC with IM_ORIGIN_RE in src/utils/imOrigin.js. */
function markOrigin(id, content) {
  if (content.trim().startsWith('/')) return content;
  return `⟦im:${id}⟧` + content;
}

/**
 * Strip the bracketed-paste terminator/initiator and all C0 control bytes (except newline and
 * tab) from untrusted inbound text. Without this, a crafted message containing `\x1b[201~` (or
 * other ESC sequences) would break out of the paste frame and inject raw keystrokes into the
 * Claude TUI. CR is removed too: it is the submit key, so leaving it in inbound text would be a
 * submit byte smuggled into the paste frame.
 */
function sanitizeInbound(text) {
  return String(text)
    .replace(/\x1b\[20[01]~/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
}

function remember(inst, msgId) {
  if (!msgId) return false;
  if (inst.seenMsgIds.includes(msgId)) return true;
  inst.seenMsgIds.push(msgId);
  if (inst.seenMsgIds.length > SEEN_MAX) inst.seenMsgIds.shift();
  return false;
}

function isStopCommand(text) {
  return STOP_WORDS.has(text.trim().toLowerCase());
}

function tr(inst, key) {
  return t(`${inst.adapter.i18nNs}.${key}`);
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
 * Read the LAST main-agent text turn from a Claude Code transcript JSONL. Walks backward from
 * EOF, collecting contiguous assistant `text` blocks, stopping at the previous real user prompt.
 * Skips thinking/tool_use blocks, sidechain (subagent) entries, and non-message sidecar lines.
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

async function rateLimitGate(inst) {
  const max = inst.adapter.rateLimit?.max ?? 18;
  const windowMs = inst.adapter.rateLimit?.windowMs ?? RATE_WINDOW_MS;
  const now = Date.now();
  while (inst.sendTimes.length && now - inst.sendTimes[0] > windowMs) inst.sendTimes.shift();
  if (inst.sendTimes.length >= max) {
    const wait = windowMs - (now - inst.sendTimes[0]) + 50;
    await new Promise(r => setTimeout(r, wait));
    return rateLimitGate(inst);
  }
  inst.sendTimes.push(Date.now());
}

async function sendReply(inst, target, text) {
  const cfg = inst.bridgeDeps.getConfig();
  let chunks = chunkText(text, cfg.maxChunkChars);
  if (chunks.length > MAX_CHUNKS_PER_TURN) {
    chunks = chunks.slice(0, MAX_CHUNKS_PER_TURN);
    chunks[MAX_CHUNKS_PER_TURN - 1] += '\n\n' + tr(inst, 'truncated');
  }
  for (const c of chunks) {
    try {
      await rateLimitGate(inst);
      await inst.adapter.sendOne(cfg, target, c, ctxFor(inst));
    } catch (e) {
      inst.lastError = String(e?.message || e);
      audit(inst, 'send-error', { error: inst.lastError });
      break;
    }
  }
  audit(inst, 'out', { conversationId: target.conversationId, chunks: chunks.length });
}

// ─── inbound ───
function handleInbound(inst, normalized, ackCtx) {
  // ACK first: some platforms (DingTalk) redeliver if not acked within ~5-15s.
  try { inst.adapter.ack?.(ackCtx, inst.client); } catch { /* best-effort; dedup catches a redelivery */ }
  try { handleInboundInner(inst, normalized); }
  catch (e) { audit(inst, 'inbound-error', { error: String(e?.message || e) }); }
}

function handleInboundInner(inst, normalized) {
  if (!normalized) return;
  const msgId = normalized.msgId;
  if (remember(inst, msgId)) return; // redelivery

  const text = sanitizeInbound(normalized.text ?? '').trim();
  const conversationId = normalized.conversationId;
  const senderId = normalized.senderId;
  const target = normalized.target;
  const cfg = inst.bridgeDeps.getConfig();
  const allowList = cfg[inst.adapter.allowListField] || [];

  // access control: allowlist (if any) else bind-first-conversation
  if (allowList.length > 0) {
    if (!allowList.includes(senderId)) {
      audit(inst, 'reject-sender', { senderId, conversationId });
      void sendReply(inst, target, tr(inst, 'notAuthorized'));
      return;
    }
  } else if (!inst.boundConversation) {
    inst.boundConversation = { conversationId };
    audit(inst, 'bind', { conversationId });
  } else if (conversationId !== inst.boundConversation.conversationId) {
    audit(inst, 'reject-conversation', { conversationId });
    void sendReply(inst, target, tr(inst, 'notBound'));
    return;
  }

  audit(inst, 'in', { msgId, senderId, conversationId, len: text.length });
  if (!text) return; // non-text messages (image/voice/file) are ignored in v1

  if (isStopCommand(text)) {
    inst.bridgeDeps.writeToPty('\x1b'); // ESC interrupts the current turn (NOT killPty)
    audit(inst, 'stop', { conversationId });
    // ESC interrupts whatever turn is live on the shared PTY (possibly another platform's), which
    // may mean its turn_end never fires. Release the global slot and resume all queues so /stop
    // can never wedge the bridge.
    clearActiveInjection();
    void sendReply(inst, target, tr(inst, 'interrupted'));
    drainAll();
    return;
  }

  if (inst.queue.length >= queueCap(inst)) {
    audit(inst, 'queue-full', { conversationId, queued: inst.queue.length });
    void sendReply(inst, target, tr(inst, 'queueFull'));
    return;
  }
  inst.queue.push({ ...target, content: text });
  if (activeInjection || inst.bridgeDeps.isStreaming()) {
    void sendReply(inst, target, tr(inst, 'busyQueued'));
  }
  drainQueue(inst);
}

function drainQueue(inst) {
  const d = inst.bridgeDeps;
  if (!d) return;
  while (inst.queue.length) {
    if (activeInjection || d.isStreaming()) return; // a turn is in flight (any platform)
    const item = inst.queue[0];
    const st = d.getPtyState();
    if (!st.running || d.getPtyKind() !== 'claude') {
      inst.queue.shift();
      void sendReply(inst, item, tr(inst, 'noSession'));
      continue;
    }
    inst.queue.shift();
    const cfg = d.getConfig();
    const skipPerm = d.getPtySkipPermissions();
    // 独立 IM worker 模型下，worker 本就以 --dangerously-skip-permissions 自主运行（安全由
    // 强制 allowlist + PreToolUse 硬拦截 + 注入的 permissions.deny 保证）。因此对 IM worker：
    //   - 不应用 blockOnSkipPermissions（否则 skipPerm 恒真 → 拦下每条消息让机器人彻底失能，
    //     尤其坑迁移用户：旧设置里若开了此项，升级后机器人将完全不回复）；
    //   - 不再逐条发送 skip-perm 警告（worker 恒为 skip-perm，逐条警告纯噪声）。
    // 仅在非 worker 场景保留旧硬阻/告警语义（防御性；新模型下适配器只在 worker 内运行）。
    const isImWorker = !!process.env.CCV_IM_PLATFORM;
    if (!isImWorker && skipPerm && cfg.blockOnSkipPermissions) {
      audit(inst, 'skip-perm-blocked', { conversationId: item.conversationId });
      void sendReply(inst, item, tr(inst, 'skipPermBlocked'));
      continue; // not armed, not injected — move to the next queued prompt
    }
    const since = Date.now();
    armActiveInjection(inst, item, since);
    if (!isImWorker && skipPerm) {
      audit(inst, 'skip-perm-warning', { conversationId: item.conversationId });
      void sendReply(inst, item, tr(inst, 'skipPermWarning'));
    }
    // React to a failed injection (PTY gone/died mid-write → onComplete(false)). Without this the
    // prompt never submits, no turn_end ever comes, and the slot wedges until the timeout. Only
    // act if THIS injection still owns the slot (a /stop or timeout may have released it).
    d.writeToPtySequential(bracketPasteSubmit(markOrigin(inst.adapter.id, item.content)), (ok) => {
      if (ok) return;
      if (!activeInjection || activeInjection.platformId !== inst.adapter.id || activeInjection.since !== since) return;
      audit(inst, 'inject-failed', { conversationId: item.conversationId });
      clearActiveInjection();
      void sendReply(inst, item, tr(inst, 'injectFailed'));
      drainAll();
    }, { settleMs: 250 });
    return; // one at a time; resume on the next turn_end
  }
}

/** Resume every platform's queue (used after the in-flight slot is released). */
function drainAll() {
  for (const inst of instances.values()) {
    if (inst.running) drainQueue(inst);
  }
}

// ─── outbound trigger (called from server.js _emitTurnEnd) ───
export async function notifyTurnEnd(sessionId, ts, transcriptPath) {
  if (!activeInjection) { drainAll(); return; } // only reply to turns a bridge initiated
  const inst = instances.get(activeInjection.platformId);
  if (!inst) { clearActiveInjection(); drainAll(); return; }
  // A turn_end whose turn ended before we injected belongs to an earlier (e.g. local) turn, not
  // ours — don't consume our slot or leak that turn's text. (Narrow window; full per-turn
  // correlation is a v2 item.)
  if (ts && activeInjection.since && ts < activeInjection.since) { drainAll(); return; }
  const target = activeInjection.target;
  clearActiveInjection();
  // Idempotency for a doubled turn_end of the SAME turn (a re-broadcast carries the same ts).
  // Keyed on ts, NOT reply text.
  if (ts && ts === inst.lastRepliedTurnTs) { drainAll(); return; }
  inst.lastRepliedTurnTs = ts || null;
  // Resume every platform's queue NOW (the slot is already released). The reply send below is
  // independent of the single-flight slot, so a slow/rate-limited sendOne must not starve the
  // other platform's queued prompt behind this await.
  drainAll();
  let text = extractLastAssistantText(transcriptPath);
  if (!text) text = tr(inst, 'noTextReply');
  try { await sendReply(inst, target, text); }
  catch (e) { inst.lastError = String(e?.message || e); audit(inst, 'send-error', { error: inst.lastError }); }
}

// ─── per-platform lifecycle ───
export async function startBridge(id, deps) {
  const inst = instances.get(id);
  if (!inst) return;
  if (deps) inst.bridgeDeps = deps;
  if (inst.running) return;
  // Guard: reloadBridge (from the config route) calls startBridge with no deps. If the instance
  // was never primed with deps (non-CLI mode, no singleton PTY), refuse to start — otherwise the
  // inbound handler would dereference a null bridgeDeps.
  if (!inst.bridgeDeps || typeof inst.bridgeDeps.getConfig !== 'function') { audit(inst, 'start-skipped', { reason: 'no-deps' }); return; }
  const cfg = inst.bridgeDeps.getConfig();
  if (!cfg || !cfg.enabled || !inst.adapter.hasCreds(cfg)) return; // off / incomplete → no-op
  try {
    const hooks = { onInbound: (normalized, ackCtx) => handleInbound(inst, normalized, ackCtx) };
    // Bound the connect so a hung adapter (e.g. Feishu WSClient.start() on a misconfigured app)
    // becomes a lastError instead of blocking the whole startup chain.
    inst.client = await Promise.race([
      inst.adapter.connect(cfg, hooks, ctxFor(inst)),
      new Promise((_, reject) => { const tm = setTimeout(() => reject(new Error('connect timeout')), CONNECT_TIMEOUT_MS); if (typeof tm.unref === 'function') tm.unref(); }),
    ]);
    inst.running = true;
    inst.connected = true;
    inst.lastError = null;
    audit(inst, 'start', inst.adapter.statusFields ? inst.adapter.statusFields(cfg) : {});
  } catch (e) {
    inst.lastError = String(e?.message || e);
    inst.connected = false;
    audit(inst, 'start-error', { error: inst.lastError });
  }
}

export async function stopBridge(id) {
  const inst = instances.get(id);
  if (!inst) return;
  try { await inst.adapter.disconnect?.(inst.client, ctxFor(inst)); } catch { /* best-effort */ }
  inst.client = null;
  inst.running = false;
  inst.connected = false;
  inst.boundConversation = null;
  if (activeInjection && activeInjection.platformId === id) clearActiveInjection();
  inst.queue.length = 0;
}

export async function reloadBridge(id, deps) {
  await stopBridge(id);
  await startBridge(id, deps);
}

export function isBridgeRunning(id) {
  const inst = instances.get(id);
  return !!(inst && inst.running);
}

export function getBridgeStatus(id) {
  const inst = instances.get(id);
  if (!inst) return { running: false, connected: false, lastError: null, boundConversationId: null };
  const base = {
    running: inst.running,
    connected: inst.connected,
    lastError: inst.lastError,
    boundConversationId: inst.boundConversation?.conversationId || null,
  };
  const cfg = inst.bridgeDeps?.getConfig?.();
  return inst.adapter.statusFields ? { ...base, ...inst.adapter.statusFields(cfg) } : base;
}

/** Validate credentials without opening a Stream connection (the Test button). */
export async function testConnection(id, cfg) {
  const inst = instances.get(id);
  if (!inst) return { ok: false, detail: 'unknown platform' };
  try {
    return await inst.adapter.testConnection(cfg, ctxFor(inst));
  } catch (e) {
    return { ok: false, detail: String(e?.message || e) };
  }
}

// ─── multi-platform fan-out (server.js startup/shutdown) ───
export async function startAll(makeDeps) {
  // Start adapters independently so one platform's slow/failed connect can't block the others
  // (and, via server.js, the whole server bring-up). startBridge self-catches; the connect
  // timeout bounds a hang.
  await Promise.allSettled([...instances.keys()].map((id) => startBridge(id, makeDeps(id))));
}

export async function stopAll() {
  for (const id of instances.keys()) {
    await stopBridge(id);
  }
}

// ─── test seams ───
export function __setMaxQueueForTests(id, n) {
  const inst = instances.get(id);
  if (inst) inst.maxQueueOverride = n;
}

/** Reset one platform's singleton state (and release the global slot if it owns it). */
export function __resetForTests(id) {
  const inst = instances.get(id);
  if (!inst) return;
  inst.client = null; inst.running = false; inst.connected = false; inst.lastError = null;
  inst.bridgeDeps = null; inst.boundConversation = null; inst.lastRepliedTurnTs = null;
  inst.maxQueueOverride = null;
  inst.seenMsgIds.length = 0; inst.queue.length = 0; inst.sendTimes.length = 0;
  inst.store = {};
  if (activeInjection && activeInjection.platformId === id) clearActiveInjection();
}

/** Whole-core reset across all platforms — for cross-adapter tests. */
export function __resetAllForTests() {
  for (const id of instances.keys()) __resetForTests(id);
  clearActiveInjection();
  fetchImpl = null;
}
