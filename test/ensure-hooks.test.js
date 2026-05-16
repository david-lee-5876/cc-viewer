// Unit tests for lib/ensure-hooks.js — focus on the v3 timeout-field migration
// (P0 root-cause fix for "Claude Code 10min 后 SIGTERM ask-bridge → TUI 接管").
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// 必须在 import ensure-hooks 之前设置 CLAUDE_CONFIG_DIR
const tmpHome = mkdtempSync(join(tmpdir(), 'ccv-ensure-hooks-test-'));
process.env.CLAUDE_CONFIG_DIR = tmpHome;

// ensureHooks 自动获取 timeout 值的辅助：每次 import 都重新读 env
async function freshImport() {
  // Node ESM 不支持 invalidating module cache 简单地；改用 query string busting
  const url = new URL('../lib/ensure-hooks.js', import.meta.url);
  url.searchParams.set('t', String(Math.random()));
  return await import(url.href);
}

const settingsPath = () => resolve(tmpHome, 'settings.json');

function loadSettings() {
  if (!existsSync(settingsPath())) return null;
  return JSON.parse(readFileSync(settingsPath(), 'utf-8'));
}

function writeSettings(data) {
  mkdirSync(tmpHome, { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(data, null, 2));
}

function cleanup() {
  try { rmSync(settingsPath(), { force: true }); } catch {}
}

describe('lib/ensure-hooks.js — timeout field v3 migration', () => {
  beforeEach(() => cleanup());
  after(() => { try { rmSync(tmpHome, { recursive: true, force: true }); } catch {} });

  describe('fresh install: 注入 hook 自带 timeout: 86400', () => {
    it('Ask / Perm / TurnEnd 三处 hook 都含 timeout: 86400', async () => {
      delete process.env.CCV_HOOK_TIMEOUT_S;
      const { ensureHooks } = await freshImport();
      ensureHooks();
      const s = loadSettings();
      assert.ok(s, 'settings.json must be created');
      const ask = s.hooks.PreToolUse.find(h => h.matcher === 'AskUserQuestion');
      const perm = s.hooks.PreToolUse.find(h => h.matcher === '');
      const turnEnd = s.hooks.Stop[0];
      assert.equal(ask.hooks[0].timeout, 86400, 'AskUserQuestion hook 必须有 timeout=86400（防 Claude Code 10min 中断）');
      assert.equal(perm.hooks[0].timeout, 86400, 'Permission hook 必须有 timeout=86400');
      assert.equal(turnEnd.hooks[0].timeout, 86400, 'Stop hook 必须有 timeout=86400');
    });

    it('hook command 字符串保持包含 ask-bridge.js / perm-bridge.js / turn-end-bridge.js + CCVIEWER_PORT guard', async () => {
      delete process.env.CCV_HOOK_TIMEOUT_S;
      const { ensureHooks } = await freshImport();
      ensureHooks();
      const s = loadSettings();
      const ask = s.hooks.PreToolUse.find(h => h.matcher === 'AskUserQuestion');
      assert.match(ask.hooks[0].command, /ask-bridge\.js/);
      assert.match(ask.hooks[0].command, /CCVIEWER_PORT/);
      assert.match(ask.hooks[0].command, /cc-viewer-managed/);
    });
  });

  describe('upgrade path: 老用户已有缺 timeout 的 hook → 必须被重写', () => {
    it('已有 AskUserQuestion hook 缺 timeout → ensureHooks 必须把 timeout 加上（核心升级保证）', async () => {
      // 模拟旧 cc-viewer 版本写的 settings.json：command 完全匹配但缺 timeout 字段
      const askBridgePath = resolve(import.meta.url ? new URL('..', import.meta.url).pathname : process.cwd(), 'lib/ask-bridge.js');
      const oldCmd = `[ -n "$CCVIEWER_PORT" ] && node "${askBridgePath}" || true # cc-viewer-managed`;
      writeSettings({
        hooks: {
          PreToolUse: [
            { matcher: 'AskUserQuestion', hooks: [{ type: 'command', command: oldCmd }] },
          ],
          Stop: [],
        },
      });
      delete process.env.CCV_HOOK_TIMEOUT_S;
      const { ensureHooks } = await freshImport();
      ensureHooks();
      const s = loadSettings();
      const ask = s.hooks.PreToolUse.find(h => h.matcher === 'AskUserQuestion');
      assert.equal(ask.hooks[0].timeout, 86400,
        '老 hook（缺 timeout）必须被升级。若 idempotent 比较只看 command 字符串会让此用例失败 → bug 修不到。');
    });

    it('已有 hook 含正确 timeout=86400 → ensureHooks idempotent 不重写', async () => {
      delete process.env.CCV_HOOK_TIMEOUT_S;
      const { ensureHooks } = await freshImport();
      ensureHooks(); // 首次注入
      const before = readFileSync(settingsPath(), 'utf-8');
      ensureHooks(); // 二次调用应 no-op
      const after = readFileSync(settingsPath(), 'utf-8');
      assert.equal(before, after, 'idempotent: 二次 ensureHooks 必须不动 settings.json');
    });
  });

  describe('env var rollback: CCV_HOOK_TIMEOUT_S 紧急开关', () => {
    it('CCV_HOOK_TIMEOUT_S=0 时不写 timeout 字段（回退到原 Claude Code 10min 行为）', async () => {
      process.env.CCV_HOOK_TIMEOUT_S = '0';
      const { ensureHooks } = await freshImport();
      ensureHooks();
      const s = loadSettings();
      const ask = s.hooks.PreToolUse.find(h => h.matcher === 'AskUserQuestion');
      assert.equal(ask.hooks[0].timeout, undefined, 'timeout 字段必须不存在');
    });

    it('CCV_HOOK_TIMEOUT_S=3600 自定义值（1h）正确生效', async () => {
      process.env.CCV_HOOK_TIMEOUT_S = '3600';
      const { ensureHooks } = await freshImport();
      ensureHooks();
      const s = loadSettings();
      const ask = s.hooks.PreToolUse.find(h => h.matcher === 'AskUserQuestion');
      assert.equal(ask.hooks[0].timeout, 3600);
    });

    it('CCV_HOOK_TIMEOUT_S 非法值（"abc"） → fallback 默认 86400', async () => {
      process.env.CCV_HOOK_TIMEOUT_S = 'abc';
      const { ensureHooks } = await freshImport();
      ensureHooks();
      const s = loadSettings();
      const ask = s.hooks.PreToolUse.find(h => h.matcher === 'AskUserQuestion');
      assert.equal(ask.hooks[0].timeout, 86400);
    });
  });

  describe('与第三方 hook 共存', () => {
    it('已有用户自定义 hook (非 cc-viewer) → ensureHooks 不破坏它', async () => {
      writeSettings({
        hooks: {
          PreToolUse: [
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo "my own hook"' }] },
          ],
          Stop: [],
        },
      });
      delete process.env.CCV_HOOK_TIMEOUT_S;
      const { ensureHooks } = await freshImport();
      ensureHooks();
      const s = loadSettings();
      const mine = s.hooks.PreToolUse.find(h => h.matcher === 'Bash');
      assert.ok(mine, '用户的 Bash hook 必须保留');
      assert.equal(mine.hooks[0].command, 'echo "my own hook"');
    });

    it('用户在 Stop 数组有自定义 hook → ensureHooks 不破坏它', async () => {
      writeSettings({
        hooks: {
          PreToolUse: [],
          Stop: [
            { hooks: [{ type: 'command', command: 'audit-log.sh' }] },
          ],
        },
      });
      delete process.env.CCV_HOOK_TIMEOUT_S;
      const { ensureHooks } = await freshImport();
      ensureHooks();
      const s = loadSettings();
      // 用户的 audit-log 必须仍在 + 不被加 timeout
      const audit = s.hooks.Stop.find(h => h.hooks?.[0]?.command === 'audit-log.sh');
      assert.ok(audit, '用户的 Stop audit-log hook 必须保留');
      assert.equal(audit.hooks[0].timeout, undefined, '不能给用户的 hook 加 timeout');
      // cc-viewer 自己的 turn-end hook 也存在
      const turnEnd = s.hooks.Stop.find(h => h.hooks?.[0]?.command?.includes('turn-end-bridge.js'));
      assert.ok(turnEnd, 'cc-viewer 自己的 turn-end hook 必须并存');
    });
  });

  describe('对称升级路径：perm / turn-end 缺 timeout → 自动升级', () => {
    it('perm-bridge hook 缺 timeout → ensureHooks 必须加上', async () => {
      const repoRoot = new URL('..', import.meta.url).pathname;
      const permPath = `${repoRoot}lib/perm-bridge.js`;
      const oldCmd = `[ -n "$CCVIEWER_PORT" ] && node "${permPath}" || true # cc-viewer-managed`;
      writeSettings({
        hooks: {
          PreToolUse: [{ matcher: '', hooks: [{ type: 'command', command: oldCmd }] }],
          Stop: [],
        },
      });
      delete process.env.CCV_HOOK_TIMEOUT_S;
      const { ensureHooks } = await freshImport();
      ensureHooks();
      const s = loadSettings();
      const perm = s.hooks.PreToolUse.find(h => h.matcher === '');
      assert.equal(perm.hooks[0].timeout, 86400);
    });

    it('turn-end-bridge hook 缺 timeout → ensureHooks 必须加上', async () => {
      const repoRoot = new URL('..', import.meta.url).pathname;
      const turnEndPath = `${repoRoot}lib/turn-end-bridge.js`;
      const oldCmd = `[ -n "$CCVIEWER_PORT" ] && node "${turnEndPath}" || true # cc-viewer-managed`;
      writeSettings({
        hooks: {
          PreToolUse: [],
          Stop: [{ hooks: [{ type: 'command', command: oldCmd }] }],
        },
      });
      delete process.env.CCV_HOOK_TIMEOUT_S;
      const { ensureHooks } = await freshImport();
      ensureHooks();
      const s = loadSettings();
      const turnEnd = s.hooks.Stop.find(h => h.hooks?.[0]?.command?.includes('turn-end-bridge.js'));
      assert.equal(turnEnd.hooks[0].timeout, 86400);
    });
  });

  describe('错值 timeout 被纠正', () => {
    it('已有 timeout=999 (用户手编 / 老版本残留) → ensureHooks 改回当前 HOOK_TIMEOUT_S', async () => {
      const repoRoot = new URL('..', import.meta.url).pathname;
      const askPath = `${repoRoot}lib/ask-bridge.js`;
      const cmd = `[ -n "$CCVIEWER_PORT" ] && node "${askPath}" || true # cc-viewer-managed`;
      writeSettings({
        hooks: {
          PreToolUse: [
            { matcher: 'AskUserQuestion', hooks: [{ type: 'command', command: cmd, timeout: 999 }] },
          ],
          Stop: [],
        },
      });
      delete process.env.CCV_HOOK_TIMEOUT_S;
      const { ensureHooks } = await freshImport();
      ensureHooks();
      const s = loadSettings();
      const ask = s.hooks.PreToolUse.find(h => h.matcher === 'AskUserQuestion');
      assert.equal(ask.hooks[0].timeout, 86400, '错值必须被改回当前默认值');
    });
  });

  describe('merge 而非 replace：保留第三方追加字段', () => {
    it('已有 hook 带 if/once/async 等 schema 合法字段 → rewrite 时必须保留', async () => {
      const repoRoot = new URL('..', import.meta.url).pathname;
      const askPath = `${repoRoot}lib/ask-bridge.js`;
      const cmd = `[ -n "$CCVIEWER_PORT" ] && node "${askPath}" || true # cc-viewer-managed`;
      writeSettings({
        hooks: {
          PreToolUse: [{
            matcher: 'AskUserQuestion',
            hooks: [{
              type: 'command',
              command: cmd,
              // 缺 timeout 触发 rewrite
              // 第三方追加字段：
              if: 'some condition',
              once: true,
              shell: 'bash',
            }],
          }],
          Stop: [],
        },
      });
      delete process.env.CCV_HOOK_TIMEOUT_S;
      const { ensureHooks } = await freshImport();
      ensureHooks();
      const s = loadSettings();
      const ask = s.hooks.PreToolUse.find(h => h.matcher === 'AskUserQuestion');
      const h = ask.hooks[0];
      assert.equal(h.timeout, 86400, 'timeout 必须被加上');
      assert.equal(h.if, 'some condition', '第三方 if 字段必须保留');
      assert.equal(h.once, true, '第三方 once 字段必须保留');
      assert.equal(h.shell, 'bash', '第三方 shell 字段必须保留');
    });

    it('CCV_HOOK_TIMEOUT_S=0 时 rewrite 必须 delete 老 timeout 字段', async () => {
      const repoRoot = new URL('..', import.meta.url).pathname;
      const askPath = `${repoRoot}lib/ask-bridge.js`;
      const cmd = `[ -n "$CCVIEWER_PORT" ] && node "${askPath}" || true # cc-viewer-managed`;
      writeSettings({
        hooks: {
          PreToolUse: [{
            matcher: 'AskUserQuestion',
            hooks: [{ type: 'command', command: cmd, timeout: 86400 }],
          }],
          Stop: [],
        },
      });
      process.env.CCV_HOOK_TIMEOUT_S = '0';
      const { ensureHooks } = await freshImport();
      ensureHooks();
      const s = loadSettings();
      const ask = s.hooks.PreToolUse.find(h => h.matcher === 'AskUserQuestion');
      assert.equal(ask.hooks[0].timeout, undefined, 'CCV_HOOK_TIMEOUT_S=0 必须清掉老 timeout 字段');
    });
  });

  describe('env var 边界 (整数限制 + max guard)', () => {
    it('小数 0.5 → fallback 默认（防 0.5 → 500ms 让 hook 半秒就超时）', async () => {
      process.env.CCV_HOOK_TIMEOUT_S = '0.5';
      const { ensureHooks, HOOK_TIMEOUT_S } = await freshImport();
      assert.equal(HOOK_TIMEOUT_S, 86400, '小数必须 fallback 默认 86400');
      ensureHooks();
    });

    it('负数 → fallback 默认', async () => {
      process.env.CCV_HOOK_TIMEOUT_S = '-1';
      const { HOOK_TIMEOUT_S } = await freshImport();
      assert.equal(HOOK_TIMEOUT_S, 86400);
    });

    it('超过 7 天硬上限 → 被 clamp 到 7d (604800s)', async () => {
      process.env.CCV_HOOK_TIMEOUT_S = '99999999';
      const { HOOK_TIMEOUT_S } = await freshImport();
      assert.equal(HOOK_TIMEOUT_S, 7 * 86400, '极大值必须被 clamp 防 setTimeout 2^31 退化');
    });

    it('正常 < 7d 整数原样接受', async () => {
      process.env.CCV_HOOK_TIMEOUT_S = '3600';
      const { HOOK_TIMEOUT_S } = await freshImport();
      assert.equal(HOOK_TIMEOUT_S, 3600);
    });
  });

  describe('_hookObjEqual 单元测试（边界）', () => {
    it('undefined existing → false', async () => {
      const { _hookObjEqual, _buildHookObj } = await freshImport();
      assert.equal(_hookObjEqual(undefined, _buildHookObj('cmd')), false);
      assert.equal(_hookObjEqual(null, _buildHookObj('cmd')), false);
    });

    it('command 不同 → false', async () => {
      const { _hookObjEqual, _buildHookObj } = await freshImport();
      const a = { type: 'command', command: 'a', timeout: 86400 };
      const b = _buildHookObj('b');
      assert.equal(_hookObjEqual(a, b), false);
    });

    it('timeout 缺失 vs 0 → 都视为 0 → 相等', async () => {
      delete process.env.CCV_HOOK_TIMEOUT_S;
      process.env.CCV_HOOK_TIMEOUT_S = '0';
      const { _hookObjEqual, _buildHookObj } = await freshImport();
      const existing = { type: 'command', command: 'x' }; // 无 timeout
      const desired = _buildHookObj('x'); // 也无 timeout (因为 HOOK_TIMEOUT_S=0)
      assert.equal(_hookObjEqual(existing, desired), true);
    });

    it('字符串 timeout "86400" vs 数字 86400 → Number() 转换后相等', async () => {
      delete process.env.CCV_HOOK_TIMEOUT_S;
      const { _hookObjEqual, _buildHookObj } = await freshImport();
      const existing = { type: 'command', command: 'x', timeout: '86400' };
      const desired = _buildHookObj('x');
      assert.equal(_hookObjEqual(existing, desired), true, 'Number() 对字符串数字转换应让两者相等');
    });

    it('timeout 不同 → false', async () => {
      delete process.env.CCV_HOOK_TIMEOUT_S;
      const { _hookObjEqual, _buildHookObj } = await freshImport();
      const existing = { type: 'command', command: 'x', timeout: 999 };
      const desired = _buildHookObj('x');
      assert.equal(_hookObjEqual(existing, desired), false);
    });
  });
});
