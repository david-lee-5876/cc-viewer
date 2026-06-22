import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ████ 数据安全 — 禁止改回静态 import(2026-06-06 事故) ████
// LOG_DIR/CACHE_DIR 等在 findcc.js / server/lib 模块【加载时】即从 env 派生。
// ESM 静态 import 会被提升到本文件任何语句之前执行,所以「先设 env 再静态 import」无效。
// 必须:① node 内置模块静态 import;② 隔离段设 env;③ 项目模块用顶层 await 动态 import。
// 改回静态 import findcc/server 会让本文件单跑(无外部 CCV_LOG_DIR)时落到真实 ~/.claude。
const __isoDir = mkdtempSync(join(tmpdir(), 'ccv-imseed-'));
process.env.CCV_LOG_DIR = __isoDir;
process.env.CLAUDE_CONFIG_DIR = __isoDir;

const { LOG_DIR } = await import('../findcc.js');
const { ensureImClaudeMd, buildImClaudeMdPreset, platformLabel, readImClaudeMd, writeImClaudeMd } = await import('../server/lib/im-claude-md.js');
const { imDir } = await import('../server/lib/im-lock.js');
const { IM_PRESET_DIR } = await import('../server/_paths.js');

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
    assert.ok(md.includes(platformLabel('dingtalk')));     // 默认语言 zh → 「钉钉」
    assert.match(md, /禁止使用 AskUserQuestion 工具/);       // 单语言 zh 母本
    assert.match(md, /不可信/);                              // 来信视为不可信输入
    assert.equal(platformLabel('discord'), 'Discord');
    assert.equal(platformLabel('unknownxyz'), 'unknownxyz'); // 未知 id 回退到 id 本身
  });

  it('未知语言回退 zh 模板，但平台名按该语言显示', () => {
    const md = buildImClaudeMdPreset('dingtalk', 'xx');     // 无 xx.md → 回退 zh.md
    assert.match(md, /禁止使用 AskUserQuestion 工具/);       // 正文来自 zh 母本
    assert.ok(md.includes('DingTalk'));                     // 平台名按非 zh → 英文品牌名
    assert.equal(platformLabel('dingtalk', 'xx'), 'DingTalk');
    assert.equal(platformLabel('dingtalk', 'zh-TW'), '钉钉'); // zh* 用中文名
  });
});

describe('im-claude-md read/write (模型性格定义 editor)', () => {
  beforeEach(() => { mkdirSync(LOG_DIR, { recursive: true }); });

  it('readImClaudeMd returns the preset when the file is absent (not yet persisted)', () => {
    const id = freshId(); wipe(id);
    const content = readImClaudeMd(id);
    assert.equal(content, buildImClaudeMdPreset(id)); // 缺失 → 预置文本，但不落盘
    assert.equal(existsSync(join(imDir(id), 'CLAUDE.md')), false);
    wipe(id);
  });

  it('writeImClaudeMd persists content and readImClaudeMd reads it back', () => {
    const id = freshId(); wipe(id);
    const custom = '# 我的机器人\n说话简短一点。';
    writeImClaudeMd(id, custom);
    assert.equal(readFileSync(join(imDir(id), 'CLAUDE.md'), 'utf-8'), custom);
    assert.equal(readImClaudeMd(id), custom);
    wipe(id);
  });

  it('writeImClaudeMd overwrites an existing file (atomic temp+rename) and leaves no .tmp', () => {
    const id = freshId(); wipe(id);
    writeImClaudeMd(id, 'first');
    writeImClaudeMd(id, 'second');
    assert.equal(readImClaudeMd(id), 'second');
    const leftover = readdirSync(imDir(id)).filter((f) => f.includes('.tmp-'));
    assert.deepEqual(leftover, []);
    wipe(id);
  });

  it('readImClaudeMd rethrows a non-ENOENT read error (im-claude-md.js:98-99)', () => {
    // 把 CLAUDE.md 占成目录 → readFileSync 抛 EISDIR（非 ENOENT）→ 不回退预置而是 rethrow。
    const id = freshId(); wipe(id);
    mkdirSync(join(imDir(id), 'CLAUDE.md'), { recursive: true });
    assert.throws(() => readImClaudeMd(id), (err) => err && err.code !== 'ENOENT');
    wipe(id);
  });

  it('writeImClaudeMd cleans up temp and rethrows on write failure (im-claude-md.js:115-117)', () => {
    // 目标 CLAUDE.md 占成非空目录 → renameSyncWithRetry 抛错 → catch 删 temp 并 rethrow。
    const id = freshId(); wipe(id);
    const dir = imDir(id);
    mkdirSync(dir, { recursive: true });
    const targetAsDir = join(dir, 'CLAUDE.md');
    mkdirSync(targetAsDir, { recursive: true });
    writeFileSync(join(targetAsDir, 'keep'), 'x'); // 非空，确保 rename 覆盖必失败

    assert.throws(() => writeImClaudeMd(id, 'new content'));
    // catch 已 unlink temp：不应遗留 .tmp- 文件
    const leftover = readdirSync(dir).filter((f) => f.includes('.tmp-'));
    assert.deepEqual(leftover, []);
    wipe(id);
  });
});

// 守卫：随包发布的每种语言人格预置都能渲染（占位符替换干净、含关键约束）。防止某语言文件被误删/改名/结构破坏。
describe('随包多语言人格预置完整性', () => {
  const langs = readdirSync(IM_PRESET_DIR).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));

  it('至少覆盖 18 种语言', () => {
    assert.ok(langs.length >= 18, `仅发现 ${langs.length} 种：${langs.join(',')}`);
  });

  for (const lang of langs) {
    it(`lang=${lang}：占位符替换干净且含关键约束`, () => {
      const md = buildImClaudeMdPreset('dingtalk', lang);
      assert.ok(!md.includes('{platform}') && !md.includes('{id}'), '不应残留占位符');
      assert.ok(md.includes(platformLabel('dingtalk', lang)));
      assert.ok(md.includes('IM_dingtalk/'));
      assert.match(md, /AskUserQuestion/);
      assert.match(md, /dangerously-skip-permissions/);
      assert.match(md, /manage-ccv-projects/);
    });
  }
});
