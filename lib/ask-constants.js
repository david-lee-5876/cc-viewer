// AskUserQuestion 超时常量的单一来源。
//
// server.js 的 hook 路径（ask-bridge → /api/ask-hook）和 sdk-manager.js 的 SDK 路径
// (canUseTool → _waitForApproval) 都从这里取 ASK_TIMEOUT_MS，保证两条路径行为一致：
// 用户视角上 "GUI 实质无超时（与 TUI 对齐）"。
//
// 前端 AskTimeoutCountdown.NO_TIMEOUT_THRESHOLD_MS（12h）是渲染阈值，本身不需要等于
// ASK_TIMEOUT_MS —— 只要超过它就 return null 不渲染倒计时。但如果改这里把 ASK_TIMEOUT_MS
// 降到 12h 以下，必须同步降前端阈值，否则倒计时又会显示出来。
//
// 纯常量模块：无任何 node-only 依赖，前端 webpack / 后端 ESM 都能 import。

export const ASK_TIMEOUT_MS = 24 * 60 * 60 * 1000;
