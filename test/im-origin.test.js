import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseImOrigin, IM_ORIGIN_RE } from '../src/utils/imOrigin.js';

describe('parseImOrigin', () => {
  it('strips a leading dingtalk marker and reports the source', () => {
    assert.deepEqual(parseImOrigin('⟦im:dingtalk⟧看一下整体效果'), { text: '看一下整体效果', imSource: 'dingtalk' });
  });

  it('strips the single optional space after the marker', () => {
    assert.deepEqual(parseImOrigin('⟦im:dingtalk⟧ hello'), { text: 'hello', imSource: 'dingtalk' });
  });

  it('returns text unchanged when there is no marker', () => {
    assert.deepEqual(parseImOrigin('just a normal message'), { text: 'just a normal message', imSource: null });
  });

  it('only matches a LEADING marker (not mid-string)', () => {
    const s = 'hello ⟦im:dingtalk⟧ world';
    assert.deepEqual(parseImOrigin(s), { text: s, imSource: null });
  });

  it('captures an arbitrary IM id (extensible to other bridges)', () => {
    assert.deepEqual(parseImOrigin('⟦im:slack⟧hi'), { text: 'hi', imSource: 'slack' });
  });

  it('is case-sensitive (an upper-case lookalike is not a marker)', () => {
    const s = '⟦IM:DINGTALK⟧hi';
    assert.deepEqual(parseImOrigin(s), { text: s, imSource: null });
  });

  it('preserves multi-line content after the marker', () => {
    assert.deepEqual(parseImOrigin('⟦im:dingtalk⟧line1\nline2'), { text: 'line1\nline2', imSource: 'dingtalk' });
  });

  it('tolerates non-string input', () => {
    assert.deepEqual(parseImOrigin(undefined), { text: undefined, imSource: null });
    assert.deepEqual(parseImOrigin(null), { text: null, imSource: null });
  });

  it('IM_ORIGIN_RE is anchored at start', () => {
    assert.equal(IM_ORIGIN_RE.source.startsWith('^'), true);
  });
});
