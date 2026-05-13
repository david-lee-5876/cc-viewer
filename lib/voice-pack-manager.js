// Voice-pack manager — file-backed audio store for ApprovalModal sound hooks.
//
// Layout:
//   <LOG_DIR>/voice-packs/<id>.<ext>     ← user-uploaded audio
//   <repo>/public/voice-packs/default/   ← bundled default pack (Pixel Buddy chiptune)
//
// Why a UUID-keyed flat dir (no nested user-supplied paths): the audio id ends up
// in URL path (/api/voice-pack/audio/:id), so we whitelist [a-f0-9-]{8,64} and
// reject anything else — defeats `../` traversal at the routing layer.

import { existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync, statSync, readFileSync, lstatSync } from 'node:fs';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { EVENT_KEYS, DEFAULT_BINDINGS } from './voice-pack-events.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default pack lookup order:
//   1. <repo>/dist/voice-packs/default/   — production (Vite copies public/* into dist/, npm ships dist/ only)
//   2. <repo>/public/voice-packs/default/ — dev (source tree, before `npm run build`)
// Content-neutral folder name — the bundled audio's theme can change (Pixel Buddy
// today, "皇上" recordings tomorrow, user override later) without renaming dirs.
const DEFAULT_PACK_DIRS = [
  join(__dirname, '..', 'dist', 'voice-packs', 'default'),
  join(__dirname, '..', 'public', 'voice-packs', 'default'),
];

// Surface a packaging-regression warning at module load if neither default-pack
// dir exists — keeps a future relocation of this file or a broken
// `npm pack` from silently shipping a feature without its bundled audio.
if (!DEFAULT_PACK_DIRS.some(d => existsSync(d))) {
  console.warn('[voice-pack] no default-pack directory found at', DEFAULT_PACK_DIRS.join(' | '), '— bundled audio will 404, frontend falls back to chime');
}

export { EVENT_KEYS } from './voice-pack-events.js';
export const ID_PATTERN = /^[a-f0-9-]{8,64}$/;
export const ALLOWED_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a']);
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024; // 2MB per file

// Magic-bytes check — Content-Type from the upload is untrusted; verify the file
// actually starts with a known audio signature. Catches rename-to-bypass attacks.
export function detectAudioFormat(buf) {
  if (!buf || buf.length < 12) return null;
  // ID3v2-prefixed MP3
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return 'mp3';
  // MPEG frame sync (MP3 without ID3): 0xFF Ex/Fx
  if (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0) return 'mp3';
  // RIFF....WAVE
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
      && buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45) return 'wav';
  // OggS
  if (buf[0] === 0x4F && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return 'ogg';
  // M4A / MP4 container: 'ftyp' at offset 4
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'm4a';
  return null;
}

export function mimeForFormat(fmt) {
  switch (fmt) {
    case 'mp3': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
    case 'ogg': return 'audio/ogg';
    case 'm4a': return 'audio/mp4';
    default: return 'application/octet-stream';
  }
}

export function isValidId(id) {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

function ensureUploadDir(logDir) {
  const dir = join(logDir, 'voice-packs');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

// Save uploaded audio. `loopbackOnly` short-circuits — we refuse non-loopback uploads
// at the route layer for now (LAN clients can play but not upload), passed through here
// just for completeness if tests stub a non-loopback path.
export function saveAudio(logDir, filename, buf, { loopbackOnly = true, isLoopback = true } = {}) {
  if (loopbackOnly && !isLoopback) {
    const err = new Error('Upload allowed from loopback only');
    err.code = 'NOT_LOOPBACK';
    throw err;
  }
  if (!Buffer.isBuffer(buf)) {
    throw new Error('saveAudio: buf must be a Buffer');
  }
  if (buf.length === 0) {
    throw new Error('Empty file');
  }
  if (buf.length > MAX_AUDIO_BYTES) {
    const err = new Error(`File too large (max ${MAX_AUDIO_BYTES} bytes)`);
    err.code = 'TOO_LARGE';
    throw err;
  }
  const fmt = detectAudioFormat(buf);
  if (!fmt) {
    const err = new Error('Not a recognised audio file (mp3/wav/ogg/m4a)');
    err.code = 'BAD_FORMAT';
    throw err;
  }
  const dir = ensureUploadDir(logDir);
  const id = randomUUID();
  const ext = `.${fmt}`;
  const path = join(dir, `${id}${ext}`);
  writeFileSync(path, buf);
  // Persist a sidecar with the original filename (display only, not used for FS access).
  const sidecar = join(dir, `${id}.json`);
  try {
    const safeName = String(filename || '').replace(/[\x00-\x1f/\\]/g, '_').slice(0, 200);
    writeFileSync(sidecar, JSON.stringify({ id, originalName: safeName, ext, uploadedAt: Date.now() }, null, 2));
  } catch { /* sidecar is best-effort */ }
  return { id, ext, path, size: buf.length, format: fmt };
}

export function listUserAudio(logDir) {
  const dir = join(logDir, 'voice-packs');
  if (!existsSync(dir)) return [];
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return []; }
  for (const name of entries) {
    const ext = extname(name).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) continue;
    const id = name.slice(0, name.length - ext.length);
    if (!ID_PATTERN.test(id)) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    let originalName = `${id}${ext}`;
    try {
      const sidecar = JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf-8'));
      if (sidecar?.originalName) originalName = sidecar.originalName;
    } catch { /* sidecar optional */ }
    out.push({ id, ext, size: st.size, mtime: st.mtimeMs, originalName });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

export function getUserAudioPath(logDir, id) {
  if (!isValidId(id)) return null;
  const dir = join(logDir, 'voice-packs');
  if (!existsSync(dir)) return null;
  for (const ext of ALLOWED_EXTS) {
    const p = join(dir, `${id}${ext}`);
    if (!existsSync(p)) continue;
    // Symlink hardening: a local attacker who can write into
    // <LOG_DIR>/voice-packs/ could otherwise drop `<uuid>.mp3 → /etc/passwd` and
    // have it streamed back over LAN. Skip the entry rather than expose it.
    try { if (lstatSync(p).isSymbolicLink()) continue; } catch { continue; }
    return { path: p, format: ext.slice(1) };
  }
  return null;
}

export function deleteUserAudio(logDir, id) {
  if (!isValidId(id)) return false;
  const dir = join(logDir, 'voice-packs');
  if (!existsSync(dir)) return false;
  let removed = false;
  for (const ext of ALLOWED_EXTS) {
    const p = join(dir, `${id}${ext}`);
    if (existsSync(p)) { try { unlinkSync(p); removed = true; } catch { /* ignore */ } }
  }
  const sidecar = join(dir, `${id}.json`);
  if (existsSync(sidecar)) { try { unlinkSync(sidecar); } catch { /* ignore */ } }
  return removed;
}

// Default-pack lookup — eventKey → bundled file under DEFAULT_PACK_DIRS.
// Returns null when the file is absent (e.g. placeholder generation never ran),
// letting the API surface a clear 404 and the front-end fall back to its Web Audio chime.
export function getDefaultPackPath(eventKey) {
  if (!EVENT_KEYS.includes(eventKey)) return null;
  for (const dir of DEFAULT_PACK_DIRS) {
    for (const ext of ALLOWED_EXTS) {
      const p = join(dir, `${eventKey}${ext}`);
      if (!existsSync(p)) continue;
      // Symlink hardening — same threat model as getUserAudioPath above. The
      // default-pack directories live inside the package install, so a tampered
      // install could ship symlinks; skip rather than dereference.
      try { if (lstatSync(p).isSymbolicLink()) continue; } catch { continue; }
      return { path: p, format: ext.slice(1) };
    }
  }
  return null;
}

export function listDefaultPack() {
  const haveAnyDir = DEFAULT_PACK_DIRS.some(d => existsSync(d));
  if (!haveAnyDir) return [];
  const out = [];
  for (const eventKey of EVENT_KEYS) {
    const hit = getDefaultPackPath(eventKey);
    if (hit) {
      let size = 0;
      try { size = statSync(hit.path).size; } catch { /* ignore */ }
      out.push({ eventKey, format: hit.format, size });
    }
  }
  return out;
}

// Surfaces the pack.json `placeholder` flag so the Settings UI can label the
// "Default" option as a placeholder (— discoverability of the
// placeholder→real-recording replacement path). Returns false when no manifest
// is present (treats absence as "not flagged" rather than guessing).
export function isDefaultPackPlaceholder() {
  for (const dir of DEFAULT_PACK_DIRS) {
    const p = join(dir, 'pack.json');
    if (!existsSync(p)) continue;
    try {
      const meta = JSON.parse(readFileSync(p, 'utf-8'));
      return !!meta?.placeholder;
    } catch { /* keep looking */ }
  }
  return false;
}

// Reconcile a voice-pack settings blob against on-disk state. Any event whose
// bound id no longer exists is silently reset to null — surfaces in the next
// GET /api/preferences without the client doing anything. Returns the reconciled
// object (caller decides whether to persist it).
export function reconcileVoicePackPrefs(logDir, vp) {
  if (!vp || typeof vp !== 'object') return vp;
  const events = vp.events && typeof vp.events === 'object' ? { ...vp.events } : {};
  for (const key of EVENT_KEYS) {
    const val = events[key];
    if (val == null || val === 'default') continue;
    if (typeof val !== 'string' || !isValidId(val)) { events[key] = null; continue; }
    if (!getUserAudioPath(logDir, val)) events[key] = null;
  }
  return { ...vp, events };
}

// Re-export shared defaults so consumers can pull everything from one module.
export { DEFAULT_BINDINGS };

// mergeApprovalModalPrefs / mergeVoicePackInto moved to lib/approval-modal-prefs.js
//( — merge logic isn't voice-pack-specific). Import from
// './approval-modal-prefs.js' directly.
