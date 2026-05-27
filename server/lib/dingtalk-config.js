// DingTalk bridge config — pure storage logic, unit-tested.
//
// Persisted as the `dingtalk` key inside the same LOG_DIR/preferences.json the rest of
// cc-viewer uses (mirrors server/lib/auth.js). Unlike auth, the DingTalk binding is
// GLOBAL ONLY (one bot ↔ one cc-viewer instance) — there is no per-project scope, which
// would fight the singleton-PTY model.
//
// appKey (≈ OAuth client_id, low sensitivity) and appSecret (a real secret) are both
// base64-encoded on disk so preferences.json never shows them in literal plaintext. This
// is light obfuscation, NOT encryption. The admin API masks appSecret entirely.
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { LOG_DIR } from '../../findcc.js';

export const DEFAULT_DT_CONFIG = {
  enabled: false,
  appKey: '',
  appSecret: '',
  allowStaffIds: [],
  maxChunkChars: 3800,
  // When true, refuse to inject remote input into a --dangerously-skip-permissions session
  // (where it would execute with no approval). Default false preserves the warn-and-inject
  // behavior.
  blockOnSkipPermissions: false,
};

const MIN_CHUNK = 500;
const MAX_CHUNK = 5000;
const DEFAULT_CHUNK = 3800;

/** Path computed fresh each call: LOG_DIR is a live binding and tests redirect it via CCV_LOG_DIR before import. */
export function getPrefsPath() {
  return join(LOG_DIR, 'preferences.json');
}

function readPrefs() {
  try {
    const p = getPrefsPath();
    if (!existsSync(p)) return {};
    const obj = JSON.parse(readFileSync(p, 'utf-8'));
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function writePrefs(prefs) {
  const p = getPrefsPath();
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(p, JSON.stringify(prefs, null, 2), { mode: 0o600 });
  // writeFileSync's mode only applies on creation; re-assert 0600 — the file now carries
  // the (base64) appSecret.
  try { chmodSync(p, 0o600); } catch { /* best-effort; non-POSIX or race */ }
}

export function encodeSecret(plain) {
  return plain ? Buffer.from(plain, 'utf-8').toString('base64') : '';
}
export function decodeSecret(stored) {
  if (!stored || typeof stored !== 'string') return '';
  try { return Buffer.from(stored, 'base64').toString('utf-8'); } catch { return ''; }
}

function clampChunk(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULT_CHUNK;
  return Math.min(MAX_CHUNK, Math.max(MIN_CHUNK, Math.round(v)));
}

function normalizeStaffIds(v) {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  const out = [];
  for (const s of v) {
    if (typeof s !== 'string') continue;
    const t = s.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Pure normalization (no disk I/O). Returns the in-memory plaintext shape. */
export function normalizeDingTalk(cfg) {
  return {
    enabled: !!(cfg && cfg.enabled),
    appKey: cfg && typeof cfg.appKey === 'string' ? cfg.appKey.trim() : '',
    appSecret: cfg && typeof cfg.appSecret === 'string' ? cfg.appSecret.trim() : '',
    allowStaffIds: normalizeStaffIds(cfg && cfg.allowStaffIds),
    maxChunkChars: clampChunk(cfg && cfg.maxChunkChars),
    blockOnSkipPermissions: !!(cfg && cfg.blockOnSkipPermissions),
  };
}

function decodeStored(d) {
  return {
    enabled: !!(d && d.enabled),
    appKey: decodeSecret(d && d.appKey),
    appSecret: decodeSecret(d && d.appSecret),
    allowStaffIds: normalizeStaffIds(d && d.allowStaffIds),
    maxChunkChars: clampChunk(d && d.maxChunkChars),
    blockOnSkipPermissions: !!(d && d.blockOnSkipPermissions),
  };
}

function encodeForDisk(n) {
  return {
    enabled: n.enabled,
    appKey: encodeSecret(n.appKey),
    appSecret: encodeSecret(n.appSecret),
    allowStaffIds: n.allowStaffIds,
    maxChunkChars: n.maxChunkChars,
    blockOnSkipPermissions: n.blockOnSkipPermissions,
  };
}

/** Effective config for the backend (plaintext appKey/appSecret). */
export function loadDingTalkConfig() {
  return decodeStored(readPrefs().dingtalk);
}

/**
 * Admin-facing state: appSecret is NEVER returned — only `hasSecret`. appKey is returned
 * (low sensitivity, lets the admin confirm which app). The route layer adds live
 * connection status.
 */
export function loadDingTalkState() {
  const c = decodeStored(readPrefs().dingtalk);
  return {
    enabled: c.enabled,
    appKey: c.appKey,
    hasSecret: !!c.appSecret,
    allowStaffIds: c.allowStaffIds,
    maxChunkChars: c.maxChunkChars,
    blockOnSkipPermissions: c.blockOnSkipPermissions,
  };
}

/**
 * Persist DingTalk config (read-merge-write, preserving all other prefs). If `appSecret`
 * is empty AND a secret is already stored, the existing secret is PRESERVED (lets the
 * admin edit other fields without re-typing the secret). To remove the secret, disable
 * the bridge. Stored base64; returns the in-memory (plaintext) normalized shape.
 */
export function saveDingTalkConfig(cfg) {
  const prefs = readPrefs();
  const normalized = normalizeDingTalk(cfg);
  if (!normalized.appSecret) {
    const existing = decodeSecret(prefs.dingtalk && prefs.dingtalk.appSecret);
    if (existing) normalized.appSecret = existing;
  }
  prefs.dingtalk = encodeForDisk(normalized);
  writePrefs(prefs);
  return normalized;
}
