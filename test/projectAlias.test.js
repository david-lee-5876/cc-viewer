// Unit tests for src/utils/projectAlias.js
//
// The module reads/writes localStorage and dispatches events on a private
// EventTarget. Node test env doesn't have localStorage or window — mock them
// before importing.

import { describe, it, beforeEach, before } from 'node:test';
import assert from 'node:assert/strict';

// In-memory localStorage substitute that lets us simulate quota / disabled.
class MockStorage {
  constructor() { this._data = new Map(); this.failNext = false; }
  getItem(k) { return this._data.has(k) ? this._data.get(k) : null; }
  setItem(k, v) {
    if (this.failNext) { this.failNext = false; throw new Error('QuotaExceededError'); }
    this._data.set(k, String(v));
  }
  removeItem(k) { this._data.delete(k); }
  clear() { this._data.clear(); }
}

const _mock = new MockStorage();

before(() => {
  globalThis.localStorage = _mock;
  // window/EventTarget exist natively in modern Node; nothing else needed.
});

// Import after env install.
const mod = await import('../src/utils/projectAlias.js');
const {
  normalizeAlias,
  getProjectAlias,
  setProjectAlias,
  clearProjectAlias,
  subscribeToAlias,
  _internals,
} = mod;

describe('normalizeAlias', () => {
  it('trims surrounding whitespace', () => {
    assert.equal(normalizeAlias('  hello  '), 'hello');
  });
  it('collapses newlines / tabs into single spaces (browser title strips inconsistently)', () => {
    assert.equal(normalizeAlias('a\nb\tc\rd'), 'a b c d');
  });
  it('returns empty string for blank / non-string input', () => {
    assert.equal(normalizeAlias('   '), '');
    assert.equal(normalizeAlias(''), '');
    assert.equal(normalizeAlias(null), '');
    assert.equal(normalizeAlias(undefined), '');
    assert.equal(normalizeAlias(123), '');
  });
  it('truncates to MAX_LEN chars after normalisation', () => {
    const long = 'x'.repeat(100);
    assert.equal(normalizeAlias(long).length, _internals.MAX_LEN);
  });
  it('preserves CJK + emoji', () => {
    assert.equal(normalizeAlias(' 三农优化 🌾 '), '三农优化 🌾');
  });

  it('strips Unicode controls: NUL, line/paragraph separators, BiDi overrides', () => {
    // Use fromCharCode so literal control chars don't get mangled through
    // editor/transport roundtrip. U+202E RLO is the realistic threat — pasting
    // it into the title flips surrounding chrome text direction tab-wide.
    const NUL = String.fromCharCode(0);
    const LSEP = String.fromCharCode(0x2028);
    const RLO = String.fromCharCode(0x202E);
    const PDI = String.fromCharCode(0x2069);
    const evil = `hi${NUL}${RLO}world${LSEP}foo${PDI}bar`;
    const out = normalizeAlias(evil);
    for (const ch of [NUL, LSEP, RLO, PDI]) {
      assert.ok(!out.includes(ch), `output must not contain U+${ch.charCodeAt(0).toString(16)}`);
    }
    // Content survives without controls, separators collapse to single space.
    assert.match(out, /hi\s+world\s+foo\s+bar/);
  });
});

describe('get / set / clear roundtrip', () => {
  beforeEach(() => { _mock.clear(); });

  it('set then get returns normalised value', () => {
    assert.equal(setProjectAlias('cc-viewer', '  Mine\n  '), true);
    assert.equal(getProjectAlias('cc-viewer'), 'Mine');
  });

  it('set empty / whitespace clears the key (no empty-string row)', () => {
    setProjectAlias('cc-viewer', 'old');
    assert.equal(setProjectAlias('cc-viewer', '   '), true);
    assert.equal(getProjectAlias('cc-viewer'), '');
    // Key must be GONE, not present-with-empty.
    assert.equal(_mock.getItem(_internals._keyFor('cc-viewer')), null);
  });

  it('clear removes the key', () => {
    setProjectAlias('cc-viewer', 'x');
    assert.equal(clearProjectAlias('cc-viewer'), true);
    assert.equal(getProjectAlias('cc-viewer'), '');
  });

  it('different projects have independent aliases', () => {
    setProjectAlias('proj-a', 'A');
    setProjectAlias('proj-b', 'B');
    assert.equal(getProjectAlias('proj-a'), 'A');
    assert.equal(getProjectAlias('proj-b'), 'B');
  });

  it('null / empty projectName is rejected (no orphan keys with `null` in them)', () => {
    assert.equal(setProjectAlias('', 'x'), false);
    assert.equal(setProjectAlias(null, 'x'), false);
    assert.equal(setProjectAlias(undefined, 'x'), false);
    assert.equal(getProjectAlias(''), '');
    assert.equal(getProjectAlias(null), '');
  });

  it('localStorage failure surfaces as false return (no crash, no silent loss)', () => {
    _mock.failNext = true;
    assert.equal(setProjectAlias('cc-viewer', 'will-fail'), false);
  });

  it('key prefix follows ccv_ convention (matches other localStorage keys in repo)', () => {
    assert.match(_internals._keyFor('cc-viewer'), /^ccv_projectAlias_/);
  });
});

describe('subscribeToAlias same-tab pubsub', () => {
  beforeEach(() => { _mock.clear(); });

  it('fires onChange when set is called for the same projectName', () => {
    let received = null;
    const off = subscribeToAlias('cc-viewer', a => { received = a; });
    setProjectAlias('cc-viewer', 'Live');
    assert.equal(received, 'Live');
    off();
  });

  it('fires onChange with empty string when alias is cleared', () => {
    setProjectAlias('cc-viewer', 'x');
    let received = null;
    const off = subscribeToAlias('cc-viewer', a => { received = a; });
    clearProjectAlias('cc-viewer');
    assert.equal(received, '');
    off();
  });

  it('does NOT fire for a different projectName', () => {
    let received = null;
    const off = subscribeToAlias('cc-viewer', a => { received = a; });
    setProjectAlias('other-proj', 'X');
    assert.equal(received, null, 'cross-project change must not leak');
    off();
  });

  it('unsubscribe stops further notifications', () => {
    let count = 0;
    const off = subscribeToAlias('cc-viewer', () => { count += 1; });
    setProjectAlias('cc-viewer', 'a');
    off();
    setProjectAlias('cc-viewer', 'b');
    assert.equal(count, 1);
  });

  it('subscribe with missing args returns a no-op unsubscribe (no crash)', () => {
    const off = subscribeToAlias(null, () => {});
    assert.equal(typeof off, 'function');
    off();
  });
});
