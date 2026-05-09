import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { getUnpushedCommits, isValidCommitHash, getGitDiffs } from '../lib/git-diff.js';

function makeTmpDir() {
  return join(tmpdir(), `ccv-git-unpushed-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function setupBareRemoteAndClone() {
  const remote = makeTmpDir();
  const work = makeTmpDir();
  mkdirSync(remote, { recursive: true });
  mkdirSync(work, { recursive: true });
  // Bare remote
  execSync('git init --bare', { cwd: remote, stdio: 'pipe' });
  // Working clone
  execSync('git init', { cwd: work, stdio: 'pipe' });
  execSync('git config user.email "t@t.com"', { cwd: work, stdio: 'pipe' });
  execSync('git config user.name "T"', { cwd: work, stdio: 'pipe' });
  execSync('git config commit.gpgsign false', { cwd: work, stdio: 'pipe' });
  writeFileSync(join(work, 'a.txt'), 'one\n');
  execSync('git add a.txt && git commit -m "init"', { cwd: work, stdio: 'pipe' });
  execSync('git branch -M main', { cwd: work, stdio: 'pipe' });
  execSync(`git remote add origin "${remote}"`, { cwd: work, stdio: 'pipe' });
  execSync('git push -u origin main', { cwd: work, stdio: 'pipe' });
  return { remote, work };
}

describe('isValidCommitHash', () => {
  it('accepts hex 7..40 length', () => {
    assert.strictEqual(isValidCommitHash('abcdef1'), true);
    assert.strictEqual(isValidCommitHash('a'.repeat(40)), true);
    assert.strictEqual(isValidCommitHash('ABCDEF1234567890'), true);
  });
  it('rejects shorter, longer, non-hex, refs', () => {
    assert.strictEqual(isValidCommitHash(''), false);
    assert.strictEqual(isValidCommitHash('abc123'), false);
    assert.strictEqual(isValidCommitHash('a'.repeat(41)), false);
    assert.strictEqual(isValidCommitHash('HEAD~1'), false);
    assert.strictEqual(isValidCommitHash('main'), false);
    assert.strictEqual(isValidCommitHash(undefined), false);
    assert.strictEqual(isValidCommitHash(null), false);
  });
});

describe('getUnpushedCommits', () => {
  let work, remote;

  afterEach(() => {
    if (work) rmSync(work, { recursive: true, force: true });
    if (remote) rmSync(remote, { recursive: true, force: true });
    work = null; remote = null;
  });

  it('returns empty hasUpstream=false for fresh non-tracking branch', async () => {
    work = makeTmpDir();
    mkdirSync(work, { recursive: true });
    execSync('git init', { cwd: work, stdio: 'pipe' });
    execSync('git config user.email "t@t.com"', { cwd: work, stdio: 'pipe' });
    execSync('git config user.name "T"', { cwd: work, stdio: 'pipe' });
    execSync('git config commit.gpgsign false', { cwd: work, stdio: 'pipe' });
    writeFileSync(join(work, 'x.txt'), 'x\n');
    execSync('git add x.txt && git commit -m "init"', { cwd: work, stdio: 'pipe' });
    const r = await getUnpushedCommits(work);
    assert.strictEqual(r.hasUpstream, false);
    assert.deepStrictEqual(r.commits, []);
  });

  it('returns empty hasUpstream=false for detached HEAD', async () => {
    ({ remote, work } = setupBareRemoteAndClone());
    const sha = execSync('git rev-parse HEAD', { cwd: work, encoding: 'utf-8' }).trim();
    execSync(`git checkout --detach ${sha}`, { cwd: work, stdio: 'pipe' });
    const r = await getUnpushedCommits(work);
    assert.strictEqual(r.hasUpstream, false);
    assert.deepStrictEqual(r.commits, []);
  });

  it('returns commits ahead of upstream with files', async () => {
    ({ remote, work } = setupBareRemoteAndClone());
    writeFileSync(join(work, 'a.txt'), 'one\ntwo\n');
    execSync('git add a.txt && git commit -m "second"', { cwd: work, stdio: 'pipe' });
    writeFileSync(join(work, 'b.txt'), 'B\n');
    execSync('git add b.txt && git commit -m "third subj"', { cwd: work, stdio: 'pipe' });

    const r = await getUnpushedCommits(work);
    assert.strictEqual(r.hasUpstream, true);
    assert.strictEqual(r.commits.length, 2);
    // git log returns newest first
    assert.strictEqual(r.commits[0].subject, 'third subj');
    assert.strictEqual(r.commits[1].subject, 'second');
    assert.strictEqual(r.commits[0].shortHash.length, 7);
    assert.ok(/^[0-9a-f]{40}$/i.test(r.commits[0].hash));
    // file lists
    const f0 = r.commits[0].files;
    assert.strictEqual(f0.length, 1);
    assert.strictEqual(f0[0].file, 'b.txt');
    assert.strictEqual(f0[0].status, 'A');
    const f1 = r.commits[1].files;
    assert.strictEqual(f1.length, 1);
    assert.strictEqual(f1[0].file, 'a.txt');
    assert.strictEqual(f1[0].status, 'M');
  });

  it('returns empty commits when nothing ahead', async () => {
    ({ remote, work } = setupBareRemoteAndClone());
    const r = await getUnpushedCommits(work);
    assert.strictEqual(r.hasUpstream, true);
    assert.deepStrictEqual(r.commits, []);
  });

  it('handles subjects with tabs/newlines safely (sentinel separators)', async () => {
    ({ remote, work } = setupBareRemoteAndClone());
    writeFileSync(join(work, 'a.txt'), 'one\ntwo\n');
    // commit subject with embedded tab/newline-ish chars (newlines are stripped to space by git)
    execSync('git add a.txt && git commit -m "weird\tsubject"', { cwd: work, stdio: 'pipe' });
    const r = await getUnpushedCommits(work);
    assert.strictEqual(r.commits.length, 1);
    assert.strictEqual(r.commits[0].subject, 'weird\tsubject');
    assert.strictEqual(r.commits[0].files.length, 1);
    assert.strictEqual(r.commits[0].files[0].file, 'a.txt');
  });
});

describe('getGitDiffs with commitHash', () => {
  let work, remote;

  afterEach(() => {
    if (work) rmSync(work, { recursive: true, force: true });
    if (remote) rmSync(remote, { recursive: true, force: true });
    work = null; remote = null;
  });

  it('rejects invalid commitHash and falls back to working tree mode', async () => {
    ({ remote, work } = setupBareRemoteAndClone());
    writeFileSync(join(work, 'a.txt'), 'one\nchanged\n');
    const r = await getGitDiffs(work, ['a.txt'], 'not-a-hash');
    // fell back to working tree mode → sees uncommitted change
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].file, 'a.txt');
    assert.strictEqual(r[0].new_content, 'one\nchanged\n');
  });

  it('returns commit-context diff for valid hash', async () => {
    ({ remote, work } = setupBareRemoteAndClone());
    writeFileSync(join(work, 'a.txt'), 'one\ntwo\n');
    execSync('git add a.txt && git commit -m "second"', { cwd: work, stdio: 'pipe' });
    const sha = execSync('git rev-parse HEAD', { cwd: work, encoding: 'utf-8' }).trim();
    // change the file in working tree to ensure we read commit content, not WT
    writeFileSync(join(work, 'a.txt'), 'COMPLETELY DIFFERENT\n');

    const r = await getGitDiffs(work, ['a.txt'], sha);
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].old_content, 'one\n');
    assert.strictEqual(r[0].new_content, 'one\ntwo\n');
    assert.strictEqual(r[0].is_new, false);
    assert.strictEqual(r[0].is_deleted, false);
    assert.strictEqual(r[0].status, 'M');
  });

  it('handles file added in commit (no parent content)', async () => {
    ({ remote, work } = setupBareRemoteAndClone());
    writeFileSync(join(work, 'new.txt'), 'hi\n');
    execSync('git add new.txt && git commit -m "add"', { cwd: work, stdio: 'pipe' });
    const sha = execSync('git rev-parse HEAD', { cwd: work, encoding: 'utf-8' }).trim();
    const r = await getGitDiffs(work, ['new.txt'], sha);
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].is_new, true);
    assert.strictEqual(r[0].old_content, '');
    assert.strictEqual(r[0].new_content, 'hi\n');
  });

  it('handles file deleted in commit', async () => {
    ({ remote, work } = setupBareRemoteAndClone());
    execSync('git rm a.txt && git commit -m "del"', { cwd: work, stdio: 'pipe' });
    const sha = execSync('git rev-parse HEAD', { cwd: work, encoding: 'utf-8' }).trim();
    const r = await getGitDiffs(work, ['a.txt'], sha);
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].is_deleted, true);
    assert.strictEqual(r[0].new_content, '');
    assert.strictEqual(r[0].old_content, 'one\n');
  });
});
