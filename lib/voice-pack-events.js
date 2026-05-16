// Single source of truth for voice-pack event keys + their default bindings.
//
// Why a shared module: this list was previously duplicated across
//   - lib/voice-pack-manager.js (EVENT_KEYS for whitelist + reconcile)
//   - server.js (preferences merge / reconcile)
//   - src/AppBase.jsx (initial state default)
//   - src/components/VoicePackSettings.jsx (UI rows + reset handler)
//   - scripts/gen-placeholder-voicepack.js (pattern table keys)
//   - src/components/AskTimeoutCountdown.jsx (threshold list keys)
// Adding a 6th event meant editing 5+ files and any miss silently dropped audio
//(). All consumers now import from here.

// 注：timeoutWarning5min / timeoutWarning60s 已删除。AskUserQuestion 实质 24h 无超时后
// 倒计时不再渲染（AskTimeoutCountdown.jsx isInfiniteTimeout → null），剩余时间预警事件失去意义。
// 老用户 preferences.json 含这两个 key 由 lib/approval-modal-prefs.js _filterEvents 白名单
// 自动 strip，零迁移工作量。孤儿 audio 文件留待 cleanup CLI（backlog）。
export const EVENT_KEYS = [
  'planApproval',
  'askQuestion',
  'turnEnd',
];

// Per-event default binding when no user override is set:
//   - 'default' → play the bundled default-pack audio
//   - null      → event is OFF by default (user must opt in)
// turnEnd defaults to null because firing on every Claude reply is noisy
//( — frequency overload mitigation).
export const DEFAULT_BINDINGS = Object.freeze({
  planApproval: 'default',
  askQuestion: 'default',
  turnEnd: null,
});
