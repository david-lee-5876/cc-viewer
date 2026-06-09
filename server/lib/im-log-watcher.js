// im-log-watcher.js — 监听 IM worker 日志目录，写入即推 SSE，让「对话记录」弹窗零滞后刷新。
//
// 背景：IM worker 是独立进程、独立端口（见 im-process-manager.buildChildEnv，CCV_START_PORT=7050+）。
// 它的 Claude 子进程 turn 结束时把 turn_end POST 到 worker 自己的端口，主 web 服务收不到。
// 但 IM worker 的日志写在共享文件系统 ~/.claude/cc-viewer/IM_<id>/*.jsonl，主服务能直接 watch。
// 于是：主服务 fs.watch 这些目录，助手回复落盘即广播 `im_log_update` SSE，前端据此自动重拉。
//
// 设计：
//  - ensure(platformId) 幂等、惰性：「对话记录」弹窗首次请求 /api/im/:platform/logs 时才开始 watch，
//    避免为从未打开的平台占 watcher（平台数 ≤ 4，成本可忽略）。dir 不存在时先 mkdir 再 watch。
//  - 每个目录的 change 事件按 debounceMs 合并（fs.watch 一次写会抖多次），只在 .jsonl（排除 *_temp.jsonl）
//    变化时触发——与 findRecentLog 的「最新真实日志」语义对齐，过滤流式临时文件噪声。
//  - watchImpl / mkdirImpl 可注入，便于确定性单测（无需真实 FS 时序）。

import { watch as fsWatch, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// fs.watch 一次文件写会抖多次（macOS/Linux 尤甚），通常 50~300ms 内合并；选 250ms 平衡实时性与稳定性。
const DEFAULT_DEBOUNCE_MS = 250;
// platformId 纵深防御：上游 platformOf() 已用白名单挡住非法平台，这里再独立校验一次，
// 杜绝被污染的 id 经 `IM_${id}` 拼进路径造成穿越（与路由正则 /^[a-z0-9_-]+$/ 同集）。
const PLATFORM_ID_RE = /^[a-z0-9_-]+$/;

export function createImLogWatcher({ getLogDir, onChange, debounceMs = DEFAULT_DEBOUNCE_MS, watchImpl, mkdirImpl, existsImpl } = {}) {
  const _watch = watchImpl || fsWatch;
  const _mkdir = mkdirImpl || ((d) => { try { mkdirSync(d, { recursive: true }); } catch { /* ignore */ } });
  const _exists = existsImpl || existsSync;
  const _onChange = typeof onChange === 'function' ? onChange : () => {};
  const _getLogDir = typeof getLogDir === 'function' ? getLogDir : () => '';

  const watchers = new Map(); // platformId -> { w: FSWatcher, dir: string } —— 连同所属目录登记，便于 LOG_DIR 切换检测
  const timers = new Map();   // platformId -> timeout
  let _disposed = false;

  function _schedule(platformId) {
    const existing = timers.get(platformId);
    if (existing) clearTimeout(existing);
    timers.set(platformId, setTimeout(() => {
      timers.delete(platformId);
      if (_disposed) return;
      try { _onChange(platformId); } catch { /* never propagate to fs.watch */ }
    }, debounceMs));
  }

  // 只认真实日志的 .jsonl 写入；filename 为 null（部分平台）时保守放行（让前端重拉，pure refresh 无副作用）。
  function _relevant(filename) {
    if (!filename) return true;
    const name = String(filename);
    if (!name.endsWith('.jsonl')) return false;
    if (name.endsWith('_temp.jsonl')) return false;
    return true;
  }

  function ensure(platformId) {
    if (_disposed || !platformId) return;
    if (!PLATFORM_ID_RE.test(platformId)) return; // 纵深防御：非白名单字符不放行（防 `IM_${id}` 路径穿越）
    const logDir = _getLogDir();
    if (!logDir) return;
    const dir = join(logDir, `IM_${platformId}`);
    const reg = watchers.get(platformId);
    if (reg) {
      // 幂等仅当「目录路径未变且仍存在」时成立；否则关旧重建：
      //  - reg.dir !== dir：LOG_DIR 运行时切换（切项目），旧 watcher 还盯着旧目录，新目录无人监听；
      //  - !exists(dir)：目录被删（某些平台 fs.watch 删目录不报 error，留下永不恢复的幽灵监听）。
      if (reg.dir === dir && _exists(dir)) return;
      try { reg.w.close(); } catch { /* ignore */ }
      watchers.delete(platformId);
    }
    _mkdir(dir);
    let w;
    try {
      w = _watch(dir, (_eventType, filename) => {
        if (_relevant(filename)) _schedule(platformId);
      });
    } catch { return; }
    // watcher 出错（目录被删等）→ 关闭并撤销登记，下次 ensure 可重建。
    if (w && typeof w.on === 'function') {
      w.on('error', () => { try { w.close(); } catch { /* ignore */ } watchers.delete(platformId); });
    }
    watchers.set(platformId, { w, dir });
  }

  function dispose() {
    _disposed = true;
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    for (const reg of watchers.values()) { try { reg.w.close(); } catch { /* ignore */ } }
    watchers.clear();
  }

  return { ensure, dispose, _watchers: watchers };
}

export default createImLogWatcher;
