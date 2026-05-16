/**
 * Register AskUserQuestion and permission approval hooks into ~/.claude/settings.json.
 * Shared between cli.js and electron/tab-worker.js.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getClaudeConfigDir } from '../findcc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Marker stamped on hook command strings so a future `cc-viewer cleanup-hooks`
// CLI (or the user manually) can identify entries owned by cc-viewer and remove
// stale ones without touching third-party hooks. Round-3 P0 fix for the
// "npm uninstall leaves zombie paths" footgun — README documents the cleanup recipe.
const CCV_HOOK_MARKER = '# cc-viewer-managed';

// Claude Code 默认 PreToolUse hook 10min (TOOL_HOOK_EXECUTION_TIMEOUT_MS = 600_000)
// 强制 abort → ask-bridge 被 SIGTERM → 主进程走 canUseTool → TUI 接管 AskUserQuestion
// → GUI 端答案失效。Claude Code 单 hook 的 timeout (秒) 优先级最高，本地写 24h 等同无超时。
// 紧急回退：CCV_HOOK_TIMEOUT_S=0 不写 timeout 字段，恢复 10min 默认行为。
const HOOK_TIMEOUT_DEFAULT_S = 86400;
// 7 天硬上限：大值经过 hook.timeout * 1000 后超 Node setTimeout 2^31ms 会立即触发
// → 反而失效。整数 guard 防 0.5 → 500ms 这种半秒超时的反直觉失败。
const HOOK_TIMEOUT_MAX_S = 7 * 86400;
export const HOOK_TIMEOUT_S = (() => {
  const raw = process.env.CCV_HOOK_TIMEOUT_S;
  if (raw === undefined || raw === '') return HOOK_TIMEOUT_DEFAULT_S;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return HOOK_TIMEOUT_DEFAULT_S;
  return Math.min(n, HOOK_TIMEOUT_MAX_S);
})();
const HOOK_TIMEOUT_FIELD = HOOK_TIMEOUT_S > 0 ? { timeout: HOOK_TIMEOUT_S } : {};

// 构造与对比两件事必须同源，否则升级路径会漏字段。
// merge 而非 replace：用户/第三方给同一 hook 追加 if/shell/once/async/asyncRewake 等
// schema 合法字段时，rewrite 不能整对象覆盖把它们吞掉。
export function _buildHookObj(command) {
  return { type: 'command', command, ...HOOK_TIMEOUT_FIELD };
}
export function _hookObjEqual(existing, desired) {
  if (!existing) return false;
  if (existing.type !== desired.type) return false;
  if (existing.command !== desired.command) return false;
  // timeout 字段：未声明 = 视为 0；HOOK_TIMEOUT_S=0 时 desired 也无字段 → 都视为 0
  const a = Number(existing.timeout) || 0;
  const b = Number(desired.timeout) || 0;
  return a === b;
}
function _mergeHookObj(existing, desired) {
  // 保留 existing 中的非冲突字段（if/shell/once/...），desired 字段优先；
  // desired 不含 timeout 时（CCV_HOOK_TIMEOUT_S=0）必须显式 delete existing.timeout 让它消失。
  const merged = { ...(existing || {}), ...desired };
  if (!('timeout' in desired)) delete merged.timeout;
  return merged;
}

export function ensureHooks() {
  try {
    const claudeDir = getClaudeConfigDir();
    const settingsPath = resolve(claudeDir, 'settings.json');
    let settings = {};
    try { if (existsSync(settingsPath)) settings = JSON.parse(readFileSync(settingsPath, 'utf-8')); } catch {
      console.warn(`[CC Viewer] ${settingsPath} is malformed, skipping hook injection`);
      return;
    }

    if (!settings.hooks) settings.hooks = {};
    if (!Array.isArray(settings.hooks.PreToolUse)) settings.hooks.PreToolUse = [];
    if (!Array.isArray(settings.hooks.Stop)) settings.hooks.Stop = [];

    let changed = false;

    // AskUserQuestion hook → ask-bridge.js
    // Guard: only execute when CCVIEWER_PORT is set (i.e. launched by cc-viewer)
    const askBridgePath = resolve(rootDir, 'lib', 'ask-bridge.js');
    const askCmd = `[ -n "$CCVIEWER_PORT" ] && node "${askBridgePath}" || true ${CCV_HOOK_MARKER}`;
    const askDesired = _buildHookObj(askCmd);
    const askExisting = settings.hooks.PreToolUse.find(h => h.matcher === 'AskUserQuestion');
    if (askExisting) {
      if (!_hookObjEqual(askExisting.hooks?.[0], askDesired)) {
        askExisting.hooks = [_mergeHookObj(askExisting.hooks?.[0], askDesired)];
        changed = true;
      }
    } else {
      settings.hooks.PreToolUse.push({
        matcher: 'AskUserQuestion',
        hooks: [askDesired]
      });
      changed = true;
    }

    // Permission approval hook → perm-bridge.js (matcher: "" = match all tools)
    // Guard: only execute when CCVIEWER_PORT is set (i.e. launched by cc-viewer)
    const permBridgePath = resolve(rootDir, 'lib', 'perm-bridge.js');
    const permCmd = `[ -n "$CCVIEWER_PORT" ] && node "${permBridgePath}" || true ${CCV_HOOK_MARKER}`;
    const permMatcher = '';
    // Clean up legacy entries
    for (let i = settings.hooks.PreToolUse.length - 1; i >= 0; i--) {
      const h = settings.hooks.PreToolUse[i];
      const cmd = h.hooks?.[0]?.command || '';
      if (cmd.includes('perm-bridge.js') && h.matcher !== permMatcher) {
        settings.hooks.PreToolUse.splice(i, 1);
        changed = true;
      } else if ((h.matcher === null || h.matcher === undefined) && cmd.includes('perm-bridge.js')) {
        settings.hooks.PreToolUse.splice(i, 1);
        changed = true;
      } else if (h.matcher === 'Bash' && cmd.includes('grep') && /git|npm/.test(cmd)) {
        settings.hooks.PreToolUse.splice(i, 1);
        changed = true;
      }
    }
    const permDesired = _buildHookObj(permCmd);
    const permExisting = settings.hooks.PreToolUse.find(h => h.matcher === permMatcher);
    if (permExisting) {
      if (!_hookObjEqual(permExisting.hooks?.[0], permDesired)) {
        permExisting.hooks = [_mergeHookObj(permExisting.hooks?.[0], permDesired)];
        changed = true;
      }
    } else {
      settings.hooks.PreToolUse.push({
        matcher: permMatcher,
        hooks: [permDesired]
      });
      changed = true;
    }

    // Stop hook → turn-end-bridge.js. Fires when Claude finishes responding (real
    // end of a user-prompt turn), so the voice-pack `turnEnd` event can play at the
    // right moment — not after every individual API call like the SSE streaming
    // signal would. Same `CCVIEWER_PORT` guard pattern as the other bridges.
    const turnEndBridgePath = resolve(rootDir, 'lib', 'turn-end-bridge.js');
    const turnEndCmd = `[ -n "$CCVIEWER_PORT" ] && node "${turnEndBridgePath}" || true ${CCV_HOOK_MARKER}`;
    // Stop hooks use matcher: '' (or unset) since there's no tool name to scope by.
    // Find any existing entry that already points at our bridge to update-in-place.
    const turnEndDesired = _buildHookObj(turnEndCmd);
    const turnEndExisting = settings.hooks.Stop.find(h => {
      const cmd = h.hooks?.[0]?.command || '';
      return cmd.includes('turn-end-bridge.js');
    });
    if (turnEndExisting) {
      if (!_hookObjEqual(turnEndExisting.hooks?.[0], turnEndDesired)) {
        turnEndExisting.hooks = [_mergeHookObj(turnEndExisting.hooks?.[0], turnEndDesired)];
        changed = true;
      }
    } else {
      settings.hooks.Stop.push({
        hooks: [turnEndDesired],
      });
      changed = true;
    }

    if (changed) {
      mkdirSync(claudeDir, { recursive: true });
      // Atomic write(): write to a sibling temp file then rename. Concurrent
      // cc-viewer launches each had a read→mutate→write window where the second writer
      // would clobber the first writer's additions. rename(2) is atomic on POSIX/NTFS,
      // so the worst-case outcome is "last writer's snapshot wins as a whole" — never
      // a partially-applied mutation that loses a hook entry silently.
      const tmpPath = `${settingsPath}.tmp.${process.pid}.${randomBytes(4).toString('hex')}`;
      try {
        writeFileSync(tmpPath, JSON.stringify(settings, null, 2));
        renameSync(tmpPath, settingsPath);
        // 透明声明：修改用户全局 settings.json 是高风险操作，启动日志可见让用户能审计
        console.log(`[cc-viewer] updated ${settingsPath} (hook timeout=${HOOK_TIMEOUT_S}s)`);
      } catch (err) {
        try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch { /* ignore */ }
        throw err;
      }
    }
  } catch (err) {
    console.warn('[CC Viewer] Failed to ensure hooks:', err.message);
  }
}
