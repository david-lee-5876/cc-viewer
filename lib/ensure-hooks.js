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
    const askExisting = settings.hooks.PreToolUse.find(h => h.matcher === 'AskUserQuestion');
    if (askExisting) {
      if ((askExisting.hooks?.[0]?.command || '') !== askCmd) {
        askExisting.hooks = [{ type: 'command', command: askCmd }];
        changed = true;
      }
    } else {
      settings.hooks.PreToolUse.push({
        matcher: 'AskUserQuestion',
        hooks: [{ type: 'command', command: askCmd }]
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
    const permExisting = settings.hooks.PreToolUse.find(h => h.matcher === permMatcher);
    if (permExisting) {
      if ((permExisting.hooks?.[0]?.command || '') !== permCmd) {
        permExisting.hooks = [{ type: 'command', command: permCmd }];
        changed = true;
      }
    } else {
      settings.hooks.PreToolUse.push({
        matcher: permMatcher,
        hooks: [{ type: 'command', command: permCmd }]
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
    const turnEndExisting = settings.hooks.Stop.find(h => {
      const cmd = h.hooks?.[0]?.command || '';
      return cmd.includes('turn-end-bridge.js');
    });
    if (turnEndExisting) {
      if ((turnEndExisting.hooks?.[0]?.command || '') !== turnEndCmd) {
        turnEndExisting.hooks = [{ type: 'command', command: turnEndCmd }];
        changed = true;
      }
    } else {
      settings.hooks.Stop.push({
        hooks: [{ type: 'command', command: turnEndCmd }],
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
      } catch (err) {
        try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch { /* ignore */ }
        throw err;
      }
    }
  } catch (err) {
    console.warn('[CC Viewer] Failed to ensure hooks:', err.message);
  }
}
