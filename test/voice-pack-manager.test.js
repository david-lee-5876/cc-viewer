import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, renameSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  detectAudioFormat,
  mimeForFormat,
  isValidId,
  saveAudio,
  listUserAudio,
  getUserAudioPath,
  deleteUserAudio,
  getDefaultPackPath,
  listDefaultPack,
  isDefaultPackPlaceholder,
  reconcileVoicePackPrefs,
  EVENT_KEYS,
  MAX_AUDIO_BYTES,
} from '../lib/voice-pack-manager.js';

function mkTmp() {
  const dir = join(tmpdir(), `ccv-voicepack-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Build the smallest valid WAV file the magic-bytes check will accept:
// 12-byte RIFF/WAVE header is enough for detectAudioFormat (it only reads bytes 0-11).
function tinyWav(extraBytes = 32) {
  const head = Buffer.alloc(12);
  head.write('RIFF', 0);
  head.writeUInt32LE(4 + extraBytes, 4);
  head.write('WAVE', 8);
  return Buffer.concat([head, Buffer.alloc(extraBytes)]);
}

function tinyMp3Id3() {
  // 'ID3' + 7-byte ID3v2 header padding + a small body
  const head = Buffer.from([0x49, 0x44, 0x33, 0x03, 0, 0, 0, 0, 0, 0]);
  return Buffer.concat([head, Buffer.alloc(64)]);
}

function tinyMp3FrameSync() {
  // 0xFF Ex starts an MPEG frame; manager only inspects byte 0/1.
  const head = Buffer.from([0xFF, 0xFB, 0x90, 0x00]);
  return Buffer.concat([head, Buffer.alloc(64)]);
}

describe('detectAudioFormat', () => {
  it('recognises WAV', () => {
    assert.equal(detectAudioFormat(tinyWav()), 'wav');
  });
  it('recognises MP3 with ID3v2 header', () => {
    assert.equal(detectAudioFormat(tinyMp3Id3()), 'mp3');
  });
  it('recognises raw MP3 frame sync', () => {
    assert.equal(detectAudioFormat(tinyMp3FrameSync()), 'mp3');
  });
  it('rejects unknown payloads', () => {
    assert.equal(detectAudioFormat(Buffer.from('not-an-audio-file-but-long-enough')), null);
  });
  it('rejects too-short buffers', () => {
    assert.equal(detectAudioFormat(Buffer.from([1, 2, 3])), null);
  });
});

describe('mimeForFormat', () => {
  it('maps known formats', () => {
    assert.equal(mimeForFormat('mp3'), 'audio/mpeg');
    assert.equal(mimeForFormat('wav'), 'audio/wav');
    assert.equal(mimeForFormat('ogg'), 'audio/ogg');
    assert.equal(mimeForFormat('m4a'), 'audio/mp4');
  });
  it('falls back for unknown', () => {
    assert.equal(mimeForFormat('xyz'), 'application/octet-stream');
  });
});

describe('isValidId', () => {
  it('accepts UUID v4', () => {
    assert.equal(isValidId('a1b2c3d4-e5f6-7890-abcd-ef0123456789'), true);
  });
  it('rejects path traversal attempts', () => {
    assert.equal(isValidId('../etc/passwd'), false);
    assert.equal(isValidId('..'), false);
    assert.equal(isValidId('a/b'), false);
  });
  it('rejects uppercase / non-hex chars', () => {
    assert.equal(isValidId('ABCDEF12'), false); // we expect lowercase hex
    assert.equal(isValidId('zzzzzzzz'), false);
  });
  it('rejects empty / short / long', () => {
    assert.equal(isValidId(''), false);
    assert.equal(isValidId('abc'), false); // too short
    assert.equal(isValidId('a'.repeat(65)), false); // too long
  });
});

describe('saveAudio + listUserAudio + getUserAudioPath + deleteUserAudio', () => {
  let logDir;

  beforeEach(() => { logDir = mkTmp(); });
  afterEach(() => { try { rmSync(logDir, { recursive: true, force: true }); } catch {} });

  it('saves a WAV, lists it, and reads it back via id', () => {
    const result = saveAudio(logDir, 'my voice.wav', tinyWav(), { isLoopback: true });
    assert.equal(result.format, 'wav');
    assert.equal(result.ext, '.wav');
    assert.equal(isValidId(result.id), true);
    assert.ok(existsSync(result.path));

    const list = listUserAudio(logDir);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, result.id);
    assert.equal(list[0].originalName, 'my voice.wav');

    const resolved = getUserAudioPath(logDir, result.id);
    assert.ok(resolved);
    assert.equal(resolved.format, 'wav');
    assert.equal(resolved.path, result.path);
  });

  it('rejects non-loopback uploads when loopbackOnly is set', () => {
    assert.throws(
      () => saveAudio(logDir, 'x.wav', tinyWav(), { loopbackOnly: true, isLoopback: false }),
      /loopback/i,
    );
  });

  it('rejects oversized files', () => {
    const big = Buffer.concat([tinyWav(0), Buffer.alloc(MAX_AUDIO_BYTES + 1)]);
    assert.throws(
      () => saveAudio(logDir, 'big.wav', big, { isLoopback: true }),
      /too large/i,
    );
  });

  it('rejects unrecognised content even with .wav filename', () => {
    const fake = Buffer.from('definitely not audio — just plain text padding here'.padEnd(64));
    assert.throws(
      () => saveAudio(logDir, 'evil.wav', fake, { isLoopback: true }),
      /audio file/i,
    );
  });

  it('rejects empty file', () => {
    assert.throws(
      () => saveAudio(logDir, 'empty.wav', Buffer.alloc(0), { isLoopback: true }),
      /empty/i,
    );
  });

  it('sanitises original filename in sidecar (no path separators)', () => {
    const r = saveAudio(logDir, '../etc/passwd', tinyWav(), { isLoopback: true });
    const sidecar = JSON.parse(readFileSync(join(logDir, 'voice-packs', `${r.id}.json`), 'utf-8'));
    assert.ok(!sidecar.originalName.includes('/'));
    assert.ok(!sidecar.originalName.includes('\\'));
  });

  it('deleteUserAudio removes the file + sidecar', () => {
    const r = saveAudio(logDir, 'a.wav', tinyWav(), { isLoopback: true });
    assert.equal(deleteUserAudio(logDir, r.id), true);
    assert.equal(existsSync(r.path), false);
    assert.equal(existsSync(join(logDir, 'voice-packs', `${r.id}.json`)), false);
    assert.equal(getUserAudioPath(logDir, r.id), null);
    assert.equal(listUserAudio(logDir).length, 0);
  });

  it('deleteUserAudio rejects malformed id (no FS access)', () => {
    assert.equal(deleteUserAudio(logDir, '../etc/passwd'), false);
  });

  it('getUserAudioPath rejects malformed id', () => {
    assert.equal(getUserAudioPath(logDir, '../etc/passwd'), null);
    assert.equal(getUserAudioPath(logDir, 'not-a-real-id'), null);
  });

  it('listUserAudio ignores stray files that do not match the id pattern', () => {
    saveAudio(logDir, 'real.wav', tinyWav(), { isLoopback: true });
    writeFileSync(join(logDir, 'voice-packs', 'README.md'), 'hello');
    writeFileSync(join(logDir, 'voice-packs', 'bad name.wav'), tinyWav());
    const list = listUserAudio(logDir);
    assert.equal(list.length, 1, 'only the UUID-named file should be listed');
  });
});

describe('default pack (bundled "皇上系列")', () => {
  it('lists every EVENT_KEY (default pack shipped under public/voice-packs/default/)', () => {
    const list = listDefaultPack();
    assert.equal(list.length, EVENT_KEYS.length, 'expected one default file per event key');
    for (const key of EVENT_KEYS) {
      assert.ok(list.find(e => e.eventKey === key), `missing default for ${key}`);
    }
  });

  it('resolves a path for every EVENT_KEY', () => {
    for (const key of EVENT_KEYS) {
      const hit = getDefaultPackPath(key);
      assert.ok(hit, `no default file for ${key}`);
      assert.ok(existsSync(hit.path));
    }
  });

  it('returns null for unknown event key (no traversal escape)', () => {
    assert.equal(getDefaultPackPath('../../etc/passwd'), null);
    assert.equal(getDefaultPackPath('bogusEvent'), null);
  });
});

describe('reconcileVoicePackPrefs', () => {
  let logDir;
  beforeEach(() => { logDir = mkTmp(); });
  afterEach(() => { try { rmSync(logDir, { recursive: true, force: true }); } catch {} });

  it("nulls out events referencing audio ids that don't exist", () => {
    const vp = { enabled: true, events: { askQuestion: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789', planApproval: 'default' } };
    const r = reconcileVoicePackPrefs(logDir, vp);
    assert.equal(r.events.askQuestion, null, 'stale id should be reset');
    assert.equal(r.events.planApproval, 'default', '"default" sentinel kept');
  });

  it("keeps 'default' and null values intact, drops malformed ids", () => {
    const vp = { enabled: true, events: { askQuestion: '../etc/passwd', planApproval: null, turnEnd: 'default' } };
    const r = reconcileVoicePackPrefs(logDir, vp);
    assert.equal(r.events.askQuestion, null);
    assert.equal(r.events.planApproval, null);
    assert.equal(r.events.turnEnd, 'default');
  });

  it("keeps live ids", () => {
    const saved = saveAudio(logDir, 'x.wav', tinyWav(), { isLoopback: true });
    const vp = { enabled: true, events: { askQuestion: saved.id } };
    const r = reconcileVoicePackPrefs(logDir, vp);
    assert.equal(r.events.askQuestion, saved.id);
  });

  it('returns input untouched when not an object', () => {
    assert.equal(reconcileVoicePackPrefs(logDir, null), null);
    assert.equal(reconcileVoicePackPrefs(logDir, undefined), undefined);
  });
});

// mergeApprovalModalPrefs / mergeVoicePackInto tests live in test/approval-modal-prefs.test.js
// (round-2 architect P1 — merge logic moved to lib/approval-modal-prefs.js).

// Symlink hardening — getUserAudioPath / getDefaultPackPath refuse to dereference
// symbolic links (round-2 P1). Skip on platforms where symlinkSync isn't permitted
// (Windows without dev mode). Use process.platform guard if it gets flaky.
describe('symlink hardening', () => {
  let logDir;
  beforeEach(() => { logDir = mkTmp(); });
  afterEach(() => { try { rmSync(logDir, { recursive: true, force: true }); } catch {} });

  it('getUserAudioPath skips symlinks even when the link target exists', () => {
    const saved = saveAudio(logDir, 'real.wav', tinyWav(), { isLoopback: true });
    // Move the real file aside; replace with a symlink pointing at it.
    const realPath = saved.path;
    const linkPath = realPath + '.tmp';
    renameSync(realPath, linkPath);
    try {
      symlinkSync(linkPath, realPath);
    } catch (err) {
      // Windows without symlink permission — skip rather than fail noisily.
      if (process.platform === 'win32') return;
      throw err;
    }
    assert.equal(getUserAudioPath(logDir, saved.id), null, 'symlinked audio must not resolve');
  });
});

// Default-pack placeholder flag — surfaces in /api/voice-pack/list so the
// Settings UI can label the Default option as "(placeholder)" when the bundled
// audio is a developer stand-in rather than the real shipping default.
describe('isDefaultPackPlaceholder', () => {
  it('returns a boolean reflecting pack.json.placeholder', () => {
    const r = isDefaultPackPlaceholder();
    assert.equal(typeof r, 'boolean');
    // Current ship: chiptune mascot SFX (Pixel Buddy) — intentional final
    // sounds, so placeholder must be false. If the pack is ever swapped back
    // for a stand-in (e.g. ahead of an emperor voice-actor release), the
    // pack.json placeholder flag flips and this assertion follows.
    assert.equal(r, false, 'shipped pack is the real default, not a placeholder');
  });
});
