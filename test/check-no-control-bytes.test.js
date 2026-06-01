// Unit tests for the control-byte guard's pure helpers. The CLI/scan path is exercised end-to-end
// via the `pretest` hook; here we lock down the classification logic so a regression can't pass
// silently (the guard's whole value is catching bytes that are otherwise invisible).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isForbidden, extOf } from '../scripts/check-no-control-bytes.js';

describe('check-no-control-bytes', () => {
  it('isForbidden: flags C0 controls + DEL, allows TAB/LF/CR and printables', () => {
    assert.equal(isForbidden(0x00), true);  // NUL — the binary-detection trigger
    assert.equal(isForbidden(0x01), true);  // SOH (the ChatView join separator we escaped)
    assert.equal(isForbidden(0x1b), true);  // ESC
    assert.equal(isForbidden(0x1f), true);  // US
    assert.equal(isForbidden(0x7f), true);  // DEL
    assert.equal(isForbidden(0x09), false); // TAB — allowed
    assert.equal(isForbidden(0x0a), false); // LF  — allowed
    assert.equal(isForbidden(0x0d), false); // CR  — allowed
    assert.equal(isForbidden(0x20), false); // space
    assert.equal(isForbidden(0x41), false); // 'A'
  });

  it('extOf: lowercased final extension, or "" when none', () => {
    assert.equal(extOf('a.test.js'), 'js');
    assert.equal(extOf('Foo.JSX'), 'jsx');
    assert.equal(extOf('path/to/file.CSS'), 'css');
    assert.equal(extOf('Makefile'), '');
    assert.equal(extOf('noext'), '');
  });
});
