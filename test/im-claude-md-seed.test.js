import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { LOG_DIR } from '../findcc.js';
import { ensureImClaudeMd, buildImClaudeMdPreset, platformLabel } from '../server/lib/im-claude-md.js';
import { imDir } from '../server/lib/im-lock.js';

let n = 0;
function freshId() { return `test_md_${process.pid}_${n++}`; }
function wipe(id) { try { rmSync(imDir(id), { recursive: true, force: true }); } catch { /* noop */ } }

describe('im-claude-md seed', () => {
  beforeEach(() => { mkdirSync(LOG_DIR, { recursive: true }); });

  it('creates CLAUDE.md under LOG_DIR/IM_<id>/ when absent', () => {
    const id = freshId(); wipe(id);
    const created = ensureImClaudeMd(id);
    assert.equal(created, true);
    const p = join(imDir(id), 'CLAUDE.md');
    assert.equal(existsSync(p), true);
    const content = readFileSync(p, 'utf-8');
    // 关键约束必须在内
    assert.match(content, /AskUserQuestion/);
    assert.match(content, /dangerously-skip-permissions/);
    assert.match(content, /TUI/);
    assert.ok(content.includes(`IM_${id}/`));
    wipe(id);
  });

  it('does NOT overwrite an existing CLAUDE.md (wx, returns false)', () => {
    const id = freshId(); wipe(id);
    mkdirSync(imDir(id), { recursive: true });
    const custom = '# my custom personality\n保持原样';
    writeFileSync(join(imDir(id), 'CLAUDE.md'), custom);
    const created = ensureImClaudeMd(id);
    assert.equal(created, false);
    assert.equal(readFileSync(join(imDir(id), 'CLAUDE.md'), 'utf-8'), custom);
    wipe(id);
  });

  it('concurrent seed writes exactly once and never throws', () => {
    const id = freshId(); wipe(id);
    const results = [ensureImClaudeMd(id), ensureImClaudeMd(id), ensureImClaudeMd(id)];
    assert.equal(results.filter(Boolean).length, 1); // 仅一次新建
    wipe(id);
  });

  it('preset embeds the platform label and hard interaction constraints', () => {
    const md = buildImClaudeMdPreset('dingtalk');
    assert.ok(md.includes(platformLabel('dingtalk')));
    assert.match(md, /NEVER use the AskUserQuestion tool/);
    assert.match(md, /untrusted/i);
    assert.equal(platformLabel('discord'), 'Discord');
    assert.equal(platformLabel('unknownxyz'), 'unknownxyz'); // 未知 id 回退到 id 本身
  });
});
