#!/usr/bin/env node
// Generate the bundled default voice pack — a tiny chiptune mascot SFX set
// (5 distinct 8-bit-style cues) covering every voice-pack event. Output lands
// at public/voice-packs/default/ ; the dir name is content-neutral so the
// theme can be swapped (Pixel Buddy today, recorded voice tomorrow) without
// renaming paths. To override per-event, drop a `<eventKey>.{wav|mp3|ogg|m4a}`
// into that dir — the manager picks any allowed extension over the .wav written here.
//
// Usage:
//   node scripts/gen-default-voicepack.js

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENT_KEYS } from '../lib/voice-pack-events.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'voice-packs', 'default');

const SAMPLE_RATE = 22050;
const BITS = 16;
const CHANNELS = 1;
const ATTACK_SECONDS = 0.005;   // very fast attack — gives chiptune "pluck" character
const RELEASE_SECONDS = 0.025;  // slightly longer release with quadratic curve below

// Each pattern is an array of segments:
//   { wave: 'sine'|'square', freq, freqEnd?, ms, vol }
// freqEnd (optional) glides the pitch linearly from `freq` to `freqEnd` over the
// segment's duration — that's how "Bi-poop?" gets its rising inquiry inflection
// and how "Wee-doo~" gets its falling tail.
//
// Volumes are deliberately low (≈ 0.20-0.28). Square waves are harmonic-rich
// and read louder than sines at the same numeric volume.
const PATTERNS = {
  // "Bi-poop?" — short low chirp, gap, rising "poop?" inquiry
  planApproval: [
    { wave: 'square', freq: 587, ms: 120, vol: 0.22 },
    { freq: 0, ms: 50, vol: 0 },
    { wave: 'square', freq: 659, freqEnd: 880, ms: 200, vol: 0.22 },
  ],
  // "Pip pip!" — two identical bouncy chirps, high pitch
  askQuestion: [
    { wave: 'square', freq: 1175, ms: 75, vol: 0.24 },
    { freq: 0, ms: 70, vol: 0 },
    { wave: 'square', freq: 1175, ms: 75, vol: 0.24 },
  ],
  // "Wee-doo~ ♪" — descending arpeggio with a glide tail for the satisfied finish.
  // 659Hz 起点是历史值（曾为避让已删除的 timeoutWarning60s 880Hz 警报刻意降调），
  // 现可自由调整；保留是因为现有 default-pack 音色已稳定，不必无故 churn。
  turnEnd: [
    { wave: 'square', freq: 659, ms: 110, vol: 0.24 },
    { freq: 0, ms: 30, vol: 0 },
    { wave: 'square', freq: 523, ms: 110, vol: 0.24 },
    { freq: 0, ms: 30, vol: 0 },
    { wave: 'square', freq: 440, freqEnd: 330, ms: 280, vol: 0.24 },
  ],
};

// Defensive: PATTERNS must cover every EVENT_KEYS entry so the bundled default
// pack is complete. If someone adds a new event to voice-pack-events.js but
// forgets to add a pattern here, fail loudly at script run time.
{
  const missing = EVENT_KEYS.filter((k) => !(k in PATTERNS));
  if (missing.length > 0) {
    console.error(`[voice-pack] gen-placeholder-voicepack.js missing PATTERNS for: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// Phase-accumulating oscillator with linear pitch glide + AR envelope (fast
// linear attack, quadratic release). Phase carries across frequency changes
// inside a segment so glides don't pop at the boundary.
function buildPcm(pattern) {
  const totalSamples = pattern.reduce((n, seg) => n + Math.round(SAMPLE_RATE * seg.ms / 1000), 0);
  const pcm = Buffer.alloc(totalSamples * 2);
  let cursor = 0;
  let phase = 0;
  for (const seg of pattern) {
    const count = Math.round(SAMPLE_RATE * seg.ms / 1000);
    const attackSamples = Math.min(Math.floor(SAMPLE_RATE * ATTACK_SECONDS), Math.floor(count / 8));
    const releaseSamples = Math.min(Math.floor(SAMPLE_RATE * RELEASE_SECONDS), Math.floor(count / 3));
    const wave = seg.wave || 'sine';
    const freqStart = seg.freq;
    const freqEnd = seg.freqEnd != null ? seg.freqEnd : seg.freq;
    for (let i = 0; i < count; i++) {
      const t = count > 1 ? i / (count - 1) : 0;
      const currentFreq = freqStart + (freqEnd - freqStart) * t;
      // Silence segments still advance the cursor but contribute zero amplitude.
      if (freqStart === 0 && freqEnd === 0) {
        pcm.writeInt16LE(0, cursor); cursor += 2;
        continue;
      }
      phase += (2 * Math.PI * currentFreq) / SAMPLE_RATE;
      let sample;
      if (wave === 'square') {
        sample = ((phase % (2 * Math.PI)) < Math.PI) ? 1 : -1;
      } else {
        sample = Math.sin(phase);
      }
      // AR envelope — linear attack, quadratic release (cubic feels too quick;
      // linear release has audible cutoff). Sustain is implicit at peak volume.
      let env = seg.vol;
      if (i < attackSamples) {
        env *= i / attackSamples;
      } else if (i > count - releaseSamples) {
        const rt = (count - i) / releaseSamples;
        env *= rt * rt;
      }
      const v = Math.max(-1, Math.min(1, sample * env)) * 0x7FFF;
      pcm.writeInt16LE(v | 0, cursor);
      cursor += 2;
    }
  }
  return pcm;
}

function buildWav(pcm) {
  const byteRate = SAMPLE_RATE * CHANNELS * BITS / 8;
  const blockAlign = CHANNELS * BITS / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

mkdirSync(OUT_DIR, { recursive: true });
const manifest = {
  name: 'default-pixel-buddy',
  displayName: 'Pixel Buddy · 像素小宠物 (默认)',
  // Real shipping default — these are intentional chiptune SFX, not placeholders.
  // Replace any file with your own recording to override per-event.
  placeholder: false,
  events: {},
  // Onomatopoeia table — what each cue is meant to sound like, for anyone
  // generating their own replacements.
  cues: {
    planApproval:       'Bi-poop?  (短低 + 上扬"问"句)',
    askQuestion:        'Pip pip!  (两短促跳跳)',
    turnEnd:            'Wee-doo~ ♪  (下行小调，满足)',
  },
};
for (const [eventKey, pattern] of Object.entries(PATTERNS)) {
  const wav = buildWav(buildPcm(pattern));
  const path = join(OUT_DIR, `${eventKey}.wav`);
  writeFileSync(path, wav);
  manifest.events[eventKey] = { file: `${eventKey}.wav`, size: wav.length };
  console.log(`[voice-pack] wrote ${path} (${wav.length} bytes)`);
}
writeFileSync(join(OUT_DIR, 'pack.json'), JSON.stringify(manifest, null, 2));
console.log(`[voice-pack] wrote ${join(OUT_DIR, 'pack.json')}`);
