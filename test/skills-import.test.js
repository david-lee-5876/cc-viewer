import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, sep } from 'node:path';
import AdmZip from 'adm-zip';

import { validateSkillName } from '../server/lib/skills-api.js';

/**
 * Unit tests for the /api/skills/import zip-validation + write logic.
 * Replicates the server.js handler internals as a testable function so we can
 * assert security-critical defenses (zip slip / symlink / zip bomb) without an
 * HTTP round trip. Mirrors the test pattern of test/upload-api.test.js.
 */

// Replicate the relevant parts of server.js /api/skills/import handler.
// Returns { ok, name, written: [relPath...] } or throws { status, code }.
function importSkillFromBuffer(fileData, originalName, skillsRoot) {
  const lower = originalName.toLowerCase();
  const isZip = lower.endsWith('.zip');
  const isMd = lower.endsWith('.md');
  if (!isZip && !isMd) {
    const e = new Error('Unsupported'); e.status = 415; e.code = 'INVALID_TYPE'; throw e;
  }
  mkdirSync(skillsRoot, { recursive: true });

  const parseNameFromMd = (text) => {
    const m = /^---\s*\n([\s\S]*?)\n---/.exec(text);
    if (!m) return null;
    const nm = /^name\s*:\s*(.*)$/m.exec(m[1]);
    if (!nm) return null;
    return nm[1].trim().replace(/^["']|["']$/g, '');
  };
  const fallbackBaseName = (filename, stripExt) => {
    let n = filename.replace(/^.*[\\/]/, '');
    if (stripExt) n = n.replace(/\.[^.]+$/, '');
    return n;
  };

  let skillName = null;
  let skillFiles = [];

  if (isMd) {
    const text = fileData.toString('utf8');
    skillName = parseNameFromMd(text) || fallbackBaseName(originalName, true);
    skillFiles = [{ relPath: 'SKILL.md', data: fileData }];
  } else {
    let zip;
    try { zip = new AdmZip(fileData); }
    catch { const e = new Error('Invalid zip'); e.status = 400; e.code = 'INVALID_ZIP'; throw e; }
    const entries = zip.getEntries();

    const MAX_PER_FILE = 50 * 1024 * 1024;
    const MAX_TOTAL = 200 * 1024 * 1024;
    let totalUncompressed = 0;
    for (const e of entries) {
      if (e.isDirectory) continue;
      const unixMode = (e.attr >>> 16) & 0xffff;
      if ((unixMode & 0o170000) === 0o120000) {
        const err = new Error('Symlinks not allowed'); err.status = 400; err.code = 'INVALID_ZIP'; throw err;
      }
      const sizeRaw = e.header?.size || 0;
      if (sizeRaw > MAX_PER_FILE) {
        const err = new Error('File too large'); err.status = 400; err.code = 'ZIP_BOMB'; throw err;
      }
      totalUncompressed += sizeRaw;
      if (totalUncompressed > MAX_TOTAL) {
        const err = new Error('Archive too large'); err.status = 400; err.code = 'ZIP_BOMB'; throw err;
      }
    }

    let bestSkillEntry = null, bestDepth = Infinity;
    for (const e of entries) {
      if (e.isDirectory) continue;
      const en = e.entryName;
      const base = en.split('/').pop() || '';
      if (base.toLowerCase() === 'skill.md') {
        const depth = en.split('/').length;
        if (depth < bestDepth) { bestDepth = depth; bestSkillEntry = e; }
      }
    }
    if (!bestSkillEntry) {
      const err = new Error('No SKILL.md'); err.status = 400; err.code = 'MISSING_SKILL_MD'; throw err;
    }
    const lastSlash = bestSkillEntry.entryName.lastIndexOf('/');
    const skillRootPrefix = lastSlash >= 0 ? bestSkillEntry.entryName.slice(0, lastSlash + 1) : '';
    const skillMdText = bestSkillEntry.getData().toString('utf8');
    skillName = parseNameFromMd(skillMdText)
      || (skillRootPrefix ? skillRootPrefix.replace(/\/$/, '').split('/').pop() : null)
      || fallbackBaseName(originalName, true);

    for (const e of entries) {
      if (e.isDirectory) continue;
      if (skillRootPrefix && !e.entryName.startsWith(skillRootPrefix)) continue;
      const rel = skillRootPrefix ? e.entryName.slice(skillRootPrefix.length) : e.entryName;
      if (!rel || rel.includes('..')) continue;
      const finalRel = rel.split('/').pop().toLowerCase() === 'skill.md'
        ? rel.replace(/[^/]*$/, 'SKILL.md')
        : rel;
      skillFiles.push({ relPath: finalRel, data: e.getData() });
    }
  }

  if (!validateSkillName(skillName)) {
    const err = new Error('Invalid name'); err.status = 400; err.code = 'INVALID_NAME'; throw err;
  }
  const targetDir = join(skillsRoot, skillName);
  if (existsSync(targetDir)) {
    const err = new Error('Exists'); err.status = 409; err.code = 'EXISTS'; throw err;
  }
  mkdirSync(targetDir, { recursive: true });

  const resolvedTarget = resolve(targetDir) + sep;
  const written = [];
  for (const f of skillFiles) {
    const dest = join(targetDir, f.relPath);
    if (!resolve(dest).startsWith(resolvedTarget)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, f.data);
    written.push(f.relPath);
  }
  return { ok: true, name: skillName, path: targetDir, written };
}

function makeTmpDir() {
  const dir = join(tmpdir(), `ccv-skills-import-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('skills import - happy path', () => {
  let root;
  beforeEach(() => { root = makeTmpDir(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('imports a SKILL.md as a single-file skill', () => {
    const md = '---\nname: my-skill\ndescription: test\n---\n\nbody';
    const result = importSkillFromBuffer(Buffer.from(md), 'my-skill.md', root);
    assert.equal(result.ok, true);
    assert.equal(result.name, 'my-skill');
    assert.deepEqual(result.written, ['SKILL.md']);
    assert.equal(readFileSync(join(result.path, 'SKILL.md'), 'utf8'), md);
  });

  it('imports a zip with SKILL.md at root', () => {
    const zip = new AdmZip();
    zip.addFile('SKILL.md', Buffer.from('---\nname: zipped\n---\n\nx'));
    zip.addFile('helper.js', Buffer.from('export const a = 1;'));
    const result = importSkillFromBuffer(zip.toBuffer(), 'zipped.zip', root);
    assert.equal(result.name, 'zipped');
    assert.deepEqual(result.written.sort(), ['SKILL.md', 'helper.js']);
  });

  it('picks the shallowest SKILL.md when multiple exist', () => {
    const zip = new AdmZip();
    zip.addFile('outer/SKILL.md', Buffer.from('---\nname: outer\n---\n'));
    zip.addFile('outer/nested/SKILL.md', Buffer.from('---\nname: nested\n---\n'));
    const result = importSkillFromBuffer(zip.toBuffer(), 'pkg.zip', root);
    assert.equal(result.name, 'outer');
  });

  it('normalizes lowercase skill.md to SKILL.md on disk', () => {
    const zip = new AdmZip();
    zip.addFile('skill.md', Buffer.from('---\nname: lower\n---\n'));
    const result = importSkillFromBuffer(zip.toBuffer(), 'lower.zip', root);
    assert.ok(existsSync(join(result.path, 'SKILL.md')));
  });
});

describe('skills import - rejections', () => {
  let root;
  beforeEach(() => { root = makeTmpDir(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('rejects unsupported file type with 415', () => {
    assert.throws(() => importSkillFromBuffer(Buffer.from('data'), 'bad.txt', root),
      err => err.status === 415 && err.code === 'INVALID_TYPE');
  });

  it('rejects zip without SKILL.md with MISSING_SKILL_MD', () => {
    const zip = new AdmZip();
    zip.addFile('readme.txt', Buffer.from('no skill here'));
    assert.throws(() => importSkillFromBuffer(zip.toBuffer(), 'pkg.zip', root),
      err => err.status === 400 && err.code === 'MISSING_SKILL_MD');
  });

  it('rejects malformed zip with INVALID_ZIP', () => {
    assert.throws(() => importSkillFromBuffer(Buffer.from('not a zip'), 'broken.zip', root),
      err => err.status === 400 && err.code === 'INVALID_ZIP');
  });

  it('rejects existing skill with 409 EXISTS', () => {
    const zip = new AdmZip();
    zip.addFile('SKILL.md', Buffer.from('---\nname: dup\n---\n'));
    importSkillFromBuffer(zip.toBuffer(), 'a.zip', root);
    const zip2 = new AdmZip();
    zip2.addFile('SKILL.md', Buffer.from('---\nname: dup\n---\n'));
    assert.throws(() => importSkillFromBuffer(zip2.toBuffer(), 'b.zip', root),
      err => err.status === 409 && err.code === 'EXISTS');
  });

  it('rejects invalid skill name (e.g., contains space)', () => {
    const zip = new AdmZip();
    zip.addFile('SKILL.md', Buffer.from('---\nname: bad name\n---\n'));
    assert.throws(() => importSkillFromBuffer(zip.toBuffer(), 'bad name.zip', root),
      err => err.status === 400 && err.code === 'INVALID_NAME');
  });
});

describe('skills import - security defenses', () => {
  let root;
  beforeEach(() => { root = makeTmpDir(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  // P0-2: symlink entries (unix mode 0o120000 in attr high 16 bits) must be rejected
  it('rejects zip with symlink entry', () => {
    const zip = new AdmZip();
    zip.addFile('SKILL.md', Buffer.from('---\nname: linky\n---\n'));
    zip.addFile('link', Buffer.from('/etc/passwd'));
    // Set unix mode of last entry to symlink (0o120777 << 16)
    const entries = zip.getEntries();
    const linkEntry = entries.find(e => e.entryName === 'link');
    linkEntry.attr = (0o120777 << 16) >>> 0;
    assert.throws(() => importSkillFromBuffer(zip.toBuffer(), 'linky.zip', root),
      err => err.status === 400 && err.code === 'INVALID_ZIP');
  });

  // P0-3: zip bomb — declared size > MAX_PER_FILE on a single entry
  it('rejects zip with single-file size exceeding 50MB', () => {
    const zip = new AdmZip();
    zip.addFile('SKILL.md', Buffer.from('---\nname: big\n---\n'));
    zip.addFile('huge.bin', Buffer.from('small actual content'));
    // Forge declared uncompressed size in entry header (zip bomb signature)
    const entries = zip.getEntries();
    const huge = entries.find(e => e.entryName === 'huge.bin');
    huge.header.size = 60 * 1024 * 1024; // 60MB declared > 50MB limit
    assert.throws(() => importSkillFromBuffer(zip.toBuffer(), 'big.zip', root),
      err => err.status === 400 && err.code === 'ZIP_BOMB');
  });

  // P0-3: zip bomb — total declared size across all entries exceeds 200MB
  it('rejects zip whose total declared size exceeds 200MB', () => {
    const zip = new AdmZip();
    zip.addFile('SKILL.md', Buffer.from('---\nname: total\n---\n'));
    for (let i = 0; i < 5; i++) {
      zip.addFile(`f${i}.bin`, Buffer.from('x'));
    }
    const entries = zip.getEntries();
    for (const e of entries) {
      if (e.entryName.startsWith('f')) e.header.size = 45 * 1024 * 1024; // 5*45MB = 225MB > 200MB
    }
    assert.throws(() => importSkillFromBuffer(zip.toBuffer(), 'total.zip', root),
      err => err.status === 400 && err.code === 'ZIP_BOMB');
  });

  // P0-1: zip slip — entries with `..` should be filtered (can't escape via relative path)
  it('drops zip entries containing .. path traversal', () => {
    const zip = new AdmZip();
    zip.addFile('SKILL.md', Buffer.from('---\nname: travel\n---\n'));
    zip.addFile('../escaped.txt', Buffer.from('owned'));
    const result = importSkillFromBuffer(zip.toBuffer(), 'travel.zip', root);
    // Should silently drop the .. entry, not write it anywhere outside targetDir
    assert.ok(!result.written.some(p => p.includes('..')));
    assert.ok(!existsSync(join(root, 'escaped.txt')));
  });

  // P0-1: zip slip — adversary creates a sibling-prefix dir name that startsWith()
  // the legit target. With the FIX (sep suffix), this attempt must NOT escape.
  // We construct it manually because skill name is locked to SKILL.md frontmatter.
  it('sep-suffix prefix check prevents sibling-prefix dir attack', () => {
    // Direct test of the resolved-prefix logic: ensure that paths under
    // `target-evil/...` cannot pass the check designed for `target/`
    const target = '/tmp/skills/foo';
    const resolvedTarget = resolve(target) + sep;
    const evilSibling = resolve('/tmp/skills/foo-evil/file.txt');
    const legitChild = resolve('/tmp/skills/foo/file.txt');
    assert.equal(legitChild.startsWith(resolvedTarget), true, 'legit child should pass');
    assert.equal(evilSibling.startsWith(resolvedTarget), false, 'evil sibling-prefix must be rejected');
  });
});
