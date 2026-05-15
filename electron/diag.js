// Electron 白屏诊断日志。
// JSON Lines / 2MB rename rotate / 单条 16KB cap / token + 用户路径 redact / 0600。
// 日志路径：${LOG_DIR}/electron-diag.log（默认 ~/.claude/cc-viewer/electron-diag.log）。
// category 命名 `层:事件`（如 workspace:did-fail-load），grep 即定位。

import { dirname, join } from 'path';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, renameSync, statSync } from 'fs';

const DIAG_MAX_BYTES = 2 * 1024 * 1024;
const DIAG_LINE_CAP = 16 * 1024; // 单条 stack 可达 100KB+，截断防保留窗口被一条吃光
const DIAG_MODE = 0o600;         // 本机多用户场景下日志含 stack/路径，限制 owner-only

let _diagLogPath = null;
export function initDiag(logDir) {
  _diagLogPath = join(logDir, 'electron-diag.log');
}

// redact 两类敏感串：
//  1. `?token=` / `&token=` —— mgmt 端口访问凭证；
//  2. 主目录前缀 `/Users/<x>/` / `/home/<x>/` / `C:\Users\<x>\` → `~/`，避免泄露用户名。
// 出口统一在序列化/写入路径，URL / stack / preloadPath 都会被覆盖。
const HOME_RE = /(?:\/Users\/|\/home\/)[^/\s"'\\]+\//g;
const HOME_RE_WIN = /[A-Za-z]:\\Users\\[^\\/\s"']+\\/g;
export function diagRedactString(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/([?&]token=)[^&\s"']+/g, '$1<redacted>')
    .replace(HOME_RE, '~/')
    .replace(HOME_RE_WIN, '~\\');
}

// WeakSet 守卫递归循环——Electron details / Error.cause 链可能自引用，无守卫会栈溢出。
export function diagSerialize(p, seen) {
  if (p === undefined || p === null) return p === undefined ? null : null;
  if (typeof p === 'string') return diagRedactString(p);
  if (typeof p !== 'object') return p;
  if (!seen) seen = new WeakSet();
  if (seen.has(p)) return '[Circular]';
  seen.add(p);
  if (p instanceof Error) return { name: p.name, message: diagRedactString(p.message), stack: diagRedactString(p.stack) };
  if (Array.isArray(p)) return p.map(v => diagSerialize(v, seen));
  const out = {};
  for (const k of Object.keys(p)) out[k] = diagSerialize(p[k], seen);
  return out;
}

export function appendDiag(category, payload) {
  if (!_diagLogPath) return; // initDiag 未调，no-op（不应发生，但防御）
  try {
    mkdirSync(dirname(_diagLogPath), { recursive: true });
    try {
      const st = statSync(_diagLogPath);
      // rename 优于 readFileSync+writeFileSync：避免 uncaughtException 路径上 ~30ms 主进程阻塞。
      if (st.size > DIAG_MAX_BYTES) renameSync(_diagLogPath, _diagLogPath + '.1');
    } catch { /* 文件不存在 / stat 失败 — 忽略 */ }
    let line = JSON.stringify({ ts: new Date().toISOString(), cat: category, payload: diagSerialize(payload) });
    if (line.length > DIAG_LINE_CAP) line = line.slice(0, DIAG_LINE_CAP) + '…[truncated]';
    appendFileSync(_diagLogPath, line + '\n', { mode: DIAG_MODE });
  } catch { /* 日志写入失败本身不能再抛 */ }
}

// 三层 webContents（tabBar / workspace / tab）通用监听。
// did-fail-load 过滤 -3 (ABORTED, SPA nav cancel) / -1 (IO_PENDING) / 非主 frame。
// render-process-gone 反向黑名单：仅 clean-exit/abnormal-exit 视为噪声；Electron 升级新 reason 默认会被记录。
// preload-error 预展开 Error，防 JSON.stringify 丢非枚举的 message/stack。
export function attachDiagListeners(webContents, label, context = {}) {
  if (!webContents) return;
  webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (code === -3 || code === -1 || !isMainFrame) return;
    appendDiag(`${label}:did-fail-load`, { ...context, code, desc, url });
  });
  webContents.on('render-process-gone', (_e, details) => {
    if (['clean-exit', 'abnormal-exit'].includes(details && details.reason)) return;
    appendDiag(`${label}:render-process-gone`, { ...context, ...details });
  });
  webContents.on('preload-error', (_e, preloadPath, error) => {
    const err = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error;
    appendDiag(`${label}:preload-error`, { ...context, preloadPath, error: err });
  });
}
