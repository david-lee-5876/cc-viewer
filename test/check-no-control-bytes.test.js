// Unit tests for the control-byte guard's pure helpers. The CLI/scan path is exercised end-to-end
// via the `pretest` hook; here we lock down the classification logic so a regression can't pass
// silently (the guard's whole value is catching bytes that are otherwise invisible).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isForbidden, extOf, scanFile } from '../scripts/check-no-control-bytes.js';

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

describe('scanFile', () => {
  // Scan a byte sequence by writing it to a temp file (the guard's real input is raw bytes).
  const scanBytes = (bytes) => {
    const p = join(tmpdir(), `ccv-cb-${process.pid}-${bytes.length}-${bytes[0] ?? 0}.txt`);
    writeFileSync(p, Buffer.from(bytes));
    try { return scanFile(p); } finally { unlinkSync(p); }
  };

  it('returns [] for clean ASCII (TAB/LF/CR allowed)', () => {
    assert.deepEqual(scanBytes([...Buffer.from('hello\tworld\r\nbye\n')]), []);
  });

  it('flags a NUL with exact line/col/offset/byte', () => {
    // "ab" + LF + NUL → NUL is the 1st byte of line 2, absolute offset 3
    assert.deepEqual(scanBytes([0x61, 0x62, 0x0a, 0x00]), [{ line: 2, col: 1, offset: 3, byte: 0x00 }]);
  });

  it('counts col in BYTES not characters on a multibyte line, and allows TAB', () => {
    // "é"(0xC3 0xA9) + ESC + TAB + LF → ESC is byte-col 3 (é is 2 bytes), TAB is not flagged
    assert.deepEqual(scanBytes([0xc3, 0xa9, 0x1b, 0x09, 0x0a]), [{ line: 1, col: 3, offset: 2, byte: 0x1b }]);
  });

  it('reports multiple hits across lines in order', () => {
    // NUL(line1) + LF + 'A' + LF + SOH(line3)
    const hits = scanBytes([0x00, 0x0a, 0x41, 0x0a, 0x01]);
    assert.equal(hits.length, 2);
    assert.deepEqual(hits[0], { line: 1, col: 1, offset: 0, byte: 0x00 });
    assert.deepEqual(hits[1], { line: 3, col: 1, offset: 4, byte: 0x01 });
  });

  it('returns [] for an unreadable / nonexistent file (error swallowed, never throws)', () => {
    assert.deepEqual(scanFile(join(tmpdir(), 'ccv-definitely-missing-xyz-123.txt')), []);
  });
});
