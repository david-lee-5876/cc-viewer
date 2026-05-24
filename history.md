# Changelog

## 1.6.274 (2026-05-24)

- refactor(components): `src/components/` 扁平目录按功能域重组为子目录 —— `chat`(含 `controllers/`,原 `chatview/`)、`terminal`、`git`、`files`、`viewers`、`approval`、`settings`、`mobile`、`dashboard`、`common`;所有组件及 co-located CSS 经 `git mv` 迁移并同步相对 import 路径,纯搬移零行为变更
- refactor(css): `dashboard/AppHeader.module.css`(1507 行)按归属拆分 —— 13 个跨域共享类(stats 表格 / `modelCard` / `toolChip` / `titleIcon` / `cachePopoverEmpty` / `memoryMarkdown`)抽到 `common/sharedChrome.module.css`,`proxy*`/`plugin*`/`process*`/`cache*`/`liveTag*` 各归 `ProxyModal`/`PluginModal`/`ProcessModal`/`CachePopoverContent`/`LiveTagPopover` 独立 module;消除 settings/mobile 跨域硬引用 AppHeader 私有样式,163 类零丢失(`composes` 跨文件改 `composes ... from`)
- chore(config/test): 删 `jsconfig.json` 失效的 `@/*` alias(vite 无对应 `resolve.alias`、零引用,避免"编辑器绿/构建炸"陷阱);`ask-no-timeout-invariants.test.js` 字面量路径读取统一走 `readSource()` helper(文件移动即抛清晰错而非裸 ENOENT)
- refactor(state): `collapseToolResults` / `expandThinking` / `expandDiff` / `showFullToolContent` / `showThinkingSummaries` 五个偏好单一真相源收口到 `SettingsContext` —— `AppBase` 新增 `_prefValues()` 从 `context.preferences`/`claudeSettings` 派生下传 prop，删除本地 state 镜像、启动灌入、`componentDidUpdate` 回灌、toggle 双写
- refactor(chatview): 抽离 ChatView 的 Ask 问答流到 `src/components/chat/controllers/askFlowController.js`（依赖注入控制器 + host 适配器，state 仍留 ChatView），ChatView 约 4777 → 3990 行；新增 `test/ask-flow-controller.test.js`
- chore(ui): Agent Team 编辑 Modal「Team 描述」textarea 默认行数 6 → 15（覆盖 PresetModal 独立组件 + TerminalPanel.jsx 内嵌副本两处）；`.presetTextarea` 加 `max-height: 70vh` + `@media (max-height: 600px) → 60vh` 兜底防小屏 Modal 溢出双滚条
- chore(docs): `concepts/<18 locale>/UltraPlan.md` 同步 `ultraplanTemplates.js` 最新 codeExpert / researchExpert 模板首段补充的 "You should be adept at utilizing tools such as `AskUserQuestion` / `EnterPlanMode` / `WebSearch` / `TeamCreate`" 工具偏好句

## 1.6.273 (2026-05-20)

- fix(ask-store): 跨进程锁 stale 检测加 PID 校验 —— lock body 写入 `{pid, ts}`，stale 判定优先 `process.kill(pid, 0)` 识别 owner 存活，body 不可读时退回原 mtime 5s 阈值兜底；解决 Electron 多 Tab + 持锁 fn 跑 >5s 场景的误偷锁
- chore(robustness): `server/server.js` 信号 handler 加 `globalThis._ccvServerSignalsRegistered` 防御性单次注册守卫；`server/interceptor.js` 注释点明三个 handler 已被外层 `_ccViewerInterceptorInstalled` 覆盖
- chore(docs): `server/lib/cli-inject.js` 头部集中文档化 EOL 策略（INJECT_BLOCK 内部 `\n` 故意不参数化，与 buildInjectBlockRegex 的 LEGACY 匹配解耦）；`CONTRIBUTING.md` 双语补 `server/_paths.js` 物理位置敏感警告
- test: `cli-inject.test.js` 新增多次重复注入字节级稳定 / updated 路径再 inject = exists / inject→remove→inject round-trip 三个幂等回归用例；`ask-store.test.js` 新增 PID-based stale steal + mtime fallback 两个并发安全用例

- feat(calibration): 血条 'auto' 模式启动期回落到 `~/.claude.json projects[cwd].lastModelUsage` 推断的偏好 model —— 解决 ccv 启动后 claude 先发 haiku init ping 让血条错显 200K 的回归；新增 `server/lib/context-watcher.js::readClaudeProjectModel(cwd, filePath?)` 纯函数（haiku 过滤 + [1m] 优先 + costUSD 排序）；`/api/claude-settings` + `workspace_started` SSE 同时携带 `claudeProjectModel`；`src/utils/helpers.js::resolveCalibrationTokens` 加第 3 参数 `projectModelHint`，auto 决策优先级 = 真实非 haiku mainAgent > projectModelHint > 1M 冷启动；AppBase 在 settings ready 和 workspace 切换时各 setState 一次同步给 AppHeader；helpers.test.js +6 case / context-watcher.test.js +9 case
- chore(jsconfig): include 扩 `server/**`/`test/**`/`electron/**`/`scripts/**`/根 bin shim（cli.js/findcc.js/server.js/interceptor.js），消除 TS 找不到 declaration 的 ~30 条噪声

- feat(ultraplan): modal 左上角自定义 drag handle —— 拖拽**整个 modal**（width/height 同时改），textarea 通过 `flex: 1 1 auto` 自然跟随；localStorage 跨会话记忆（`cc-viewer-ultraplan-modal-width/height`），clamp [400, 90vw] × [240, 90vh]；拖拽期 rAF 节流写 DOM style 0 setState、pointerup 才提交；AbortController 一刀清 pointermove/up/cancel listener + setPointerCapture 双保险；handle 视觉 14×14 品牌色 + 容器底色 1.5px 描边「凿空」+ hover scale 1.15（iPad `.pad-mode` 18×18 / hitbox 28×28）；gate `!isMobile || isPad` —— 真手机回原生 `resize: vertical`；几何计算抽 `src/utils/resizeCalc.js` 纯函数 + `test/resize-calc.test.js` 9 case；`ui.ultraplan.resizeHandle` aria-label 18 语

- refactor: 服务端代码统一收纳到 `server/`（含 `lib/`），根目录留 `cli.js`（bin 入口）/ `findcc.js`（fork 适配点，含 INJECT_IMPORT / LEGACY_INJECT_IMPORTS / PACKAGES 等核心配置）+ `server.js` / `interceptor.js` 一行 re-export shim
- fix(cli): 修复 `cli.js` 13 处 dynamic `import()` 指向 stale 根路径导致 `ccv` / `ccv run` / `ccv -SDK` / workspace 选择器全部 `ERR_MODULE_NOT_FOUND`
- fix(inject): `INJECT_IMPORT` 改走 bare specifier `import 'cc-viewer/interceptor.js'`（经 package.json exports 解析），与物理路径解耦；新增 `LEGACY_INJECT_IMPORTS` + `injectCliJs` 老 marker 升级路径，老用户升级不需手动 `ccv uninstall`
- fix(hooks): `ensureHooks()` 增加 stale-path 主动 purge —— 升级后老用户 `~/.claude/settings.json` 含 `cc-viewer/lib/<bridge>.js`（缺 `server/`）的 cc-viewer-managed 条目会被直接清除并重建，不再依赖字段级 merge
- fix(pty): `node-pty` spawn-helper chmod 改走 `createRequire().resolve()`，解决 pnpm/yarn workspace hoist 布局下静默 ENOENT；catch 改为 `console.warn` 不再吞错
- chore: 抽 `server/_paths.js` 集中 9 个路径常量（`SERVER_DIR / PACKAGE_ROOT / NODE_MODULES / SERVER_LIB / DIST_DIR / PUBLIC_DIR / CONCEPTS_DIR / PLUGINS_DIR / PACKAGE_JSON`）；首批迁 `server.js` / `updater.js` / `voice-pack-manager.js` / `ensure-hooks.js` / `plugin-loader.js`；`findcc.js` 自算 NODE_MODULES 消反向依赖
- chore: `mkdir plugins/` 保留 plugin-loader 扩展位；`test:coverage` glob 升级 `server/**/*.js`；`package.json` `exports` 删重复 `"./server.js"` 键
- test: 新增 `test/cli-import-paths.test.js` 拦截 cli.js / electron 入口的 dynamic import 路径解析回归；`test/ensure-hooks.test.js` 新增 stale-path purge 覆盖
- fix(uninstall): `ccv --uninstall` 增加 `~/.claude/settings.json` 中 cc-viewer-managed hooks 清理（按 `# cc-viewer-managed` marker 整条删除，Pre/Stop 双 section）—— 此前 `npm uninstall -g cc-viewer` 后 hook 残留导致 claude 每次启动 ENOENT
- fix(hooks): `_purgeStaleManagedHooks` 改 existsSync 通用化（marker + 路径不存在 = stale），不再硬编码 bridge 名 regex；未来 server 重组无需再更新清理逻辑
- fix(hooks): `ensure-hooks.js` 改用 `renameSyncWithRetry`，Windows 上 EBUSY 不再静默丢更新
- chore: 抽 `server/lib/cli-inject.js` 容纳 cli.js 注入/卸载纯函数（便于单元测试）；新增 `test/cli-inject.test.js` 端到端覆盖 injected/exists/updated 三返回值 + CRLF 保留 + LEGACY 升级路径
- test: 新增 `test/root-shim.test.js`（静态分析根 shim re-export 完整性） + `test/client-safe-imports.test.js`（src→server/** 跨层 import 白名单 + 4 个 CLIENT-SAFE 模块零 node deps）
- test: `cli-import-paths.test.js` 扩 `pathToFileURL(join(rootDir, ...))` 形式 + 新增 LEGACY_INJECT_IMPORTS 每条都解析到真实文件的覆盖
- chore: 删 `server.js` / `voice-pack-manager.js` / `plugin-loader.js` 残留 dead `__dirname`；`server.js` shim 加注释；`_paths.js` 加 ⚠ 物理位置警告 + 每常量 JSDoc；`LEGACY_INJECT_IMPORTS` 加 prune 策略注释
- chore: `CLAUDE.md` rule 5 精修措辞；`CONTRIBUTING.md` 双语补 `findcc.js` 为核心文件

## 1.6.272 (2026-05-18)

- feat(header): per-project 别名支持 — 「当前项目」标题 hover 时浮出铅笔图标,弹 Modal 设置别名,浏览器 `<title>` 用别名、UI 头部追加 `(别名)`;存 localStorage(key 含 projectName basename,同名不同路径项目会共享别名);跨/同 tab 自动同步;键盘 Tab 可达;BiDi/控制字符 strip 防 paste 攻击;Electron 多 tab strip 与主窗口 setTitle 暂不在覆盖范围
- chore(header): 浏览器 tab 标题去掉 ` - CC Viewer` 后缀,workspace 切换后只显示 projectName 或 alias(原 SSE workspace_started 写的是 `${projectName} - CC Viewer`)

## 1.6.271 (2026-05-18)

- feat(voice-pack): 新增 sanguo（三国）内置语音包，与 default（butler）并列；zh / zh-TW 新用户首次默认 sanguo，其它 locale 仍 default；Settings 可自由切换；老用户 binding='default' 语义不变
- feat(voice-pack): default 内置音从 sine-wave 占位 WAV 替换为 butler 真人 MP3（"The plan awaits your approval, sir." 等）；老用户 binding='default' 的事件提示音内容会变
- chore(voice-pack): 降级到 < 本版本前请先在 Settings 把 binding='sanguo' 改回 default 或 disabled，否则老 server 的 reconcile 白名单会清空该绑定
- fix(turn-end): Stop hook 不再被 streaming race-guard 吞掉；server 加 10s trailing debounce（`CCV_TURN_END_DEBOUNCE_MS` 可覆盖，clamp [100,60000]），rising-edge cancel 兜底
- fix(turn-end): 三处 PTY 自重试补传 `CCVIEWER_INTERNAL_TOKEN`，turn-end POST 不再 403
- fix(voice-pack): 前端 turnEnd cooldown 30s → 10s，通过 SSE `server_config` 自动同步 server 端实际 debounce；i18n 18 语言 hint 同步改 10s；`setTurnEndCooldownMs` 同步 clamp [100,60000]
- fix(server): `/api/turn-end-notify` malformed JSON 改 400；`startViewer` 入口 await in-flight `_stoppingPromise`；`server_config` SSE write 失败改 warn 不再静默
- perf(sdk): `setSdkStreamingState` 增加 transition gate，非 edge 且非 active 时不再推 SSE
- fix(sdk): cli.js onTurnEnd 显式 `typeof` 检查，export 缺失时打 warn 不再被可选链静默吞

## 1.6.270 (2026-05-16)

- fix(voice-pack): turnEnd 剔除「仅窗口失焦时响」门控，任务结束就响（保留 30s 节流 + dedupeKey）；17 语言 hint 文案同步精简
- fix(ui): ApprovalModal 最小化按钮挪到 modal 右上角；底部只保留「⌘/Ctrl+ESC 取消」提示
- fix(ui): ApprovalModal header 项目名 chip 去掉；ask 卡片「无超时」文案删除
- chore(voice-pack): 剔除「超时预警 5min/60s」语音事件，老用户 preferences 经白名单自动 strip
- fix(ask): GUI AskUserQuestion 实质无超时（与 TUI 对齐），ask 卡片不再自动消失
- fix(ask): _askHookEverActive 区分新老 Claude Code 版本，老版本走 PTY 兜底，新版本无限等
- feat(ask): ask-store 持久化 pending ask 到 ~/.claude/cc-viewer/ask-store.json，server 重启可恢复
- feat(ask): ask-bridge 短轮询协议 POST 立即返 askId + GET 25s wait + 404 自动重 POST 重建 entry
- feat(ask): /api/pending-asks 端点供前端 server 重启后拉取恢复 UI
- fix(ask): setEntry/markAnswered/markCancelled status guard 实现 first-write-wins
- fix(ask): consumeIfFinal 单 lock 替代 consume+setEntry 双 lock 避免 race
- fix(ask): pruneStale 用 max(createdAt, answeredAt) 不再误删刚 answered 的老 entry
- fix(ask): ask-cancel handler 补 disk-only 分支让 server 重启后的 ask 也能被取消
- fix(ask): ws ask-hook-answer/ask-cancel 晚到方收到 `ask-hook-already-answered` ack 关 modal
- fix(ask): ask-bridge GET 5xx 独立 3 次短重试避免 server 真坏时阻塞主进程 5min
- fix(ask): ask-bridge re-POST id 与原 askId 不一致时直接 fallback terminal
- fix(ask): ask-store pruneStale 周期 1h 触发，长跑进程不再累积 disk-only 残留
- fix(ask): AskQuestionForm cancel 按钮始终可点，ws/hook 抖动时也能逃生
- feat(ask): ASK_TIMEOUT_MS 抽公共常量，server / sdk-manager 同源 24h
- fix(ask): ask-store 落盘失败首次 console.warn，便于磁盘满场景排错
- fix(ask): 注入 hook (ask/perm/turn-end) 加 24h timeout 防 Claude Code 10min 强制中断
- fix(ask): 老 settings.json 自动重写，merge 保留第三方追加字段；env CCV_HOOK_TIMEOUT_S 可调
- test: 补 ask-store / ask-bridge / pending-asks / ensure-hooks / voice-pack-events / ask-no-timeout invariants 单测
- feat(chat): 用户气泡里的内置 slash 命令(/clear /compact /theme /model 等 33 个)按当前语言展示本地化标签,带参形态拼回原始参数;Tooltip 只显裸命令避免 /login 等敏感参数泄漏;Unicode 换行 / bidi-control 注入过滤;切语言即时刷新(ChatMessage SCU 接 lang)
- feat(theme): 雪山白主题用户气泡走 #222 深底白字,hover / highlight / Compact summary 子区同步覆写;新增 4 个 light theme bubble token
- feat(ultraplan): UltraPlan 模态与终端面板的「+」按钮统一改为 pill「+ 自定义专家」(33 + 1 个 i18n key × 18 语言,light theme 提色 override)
- fix(ui): Compact summary 折叠头改 `t('ui.compactSummary')` 替代英文字面值;紧凑模式 chip grid / mcpServerName padding-left 14→2 对齐左缘;navSidebar padding-top 4

## 1.6.269 (2026-05-16)

- fix(file-browser): 指向目录的 symlink 不再被误标为 file，可正常展开（Dirent.isDirectory 不解引用 link → 对 symlink 走 statSync follow，断链兜底 file）
- fix(terminal): 嵌入终端 zsh 现在能正确 source 用户 `~/.zshrc`（wrapper `.zshenv` 里 `${ZDOTDIR:-…}` 永远命中 wrapper dir 导致 `.zshrc` 的 `[[ != ]]` 恒假；改为显式比较 wrapper dir，并补一条 spawn zsh 的端到端回归测试）
- fix(context-bar): /clear 血条 lock 增加两条解锁兜底（SSE `context_window` 新测量推送 / `streaming.active=true`），覆盖 WS 抖动、非增量 load、pty 直接键入等 `onUserMessageSent` 漏触发场景

## 1.6.268 (2026-05-15)

- feat(approval-sound): 「审批提示音」与「语音包」合并为单一开关，OFF 时音量/事件 binding/上传隐藏，默认开启；旧版若两开关不一致，hydrate 时以「审批提示音」为准强制对齐
- revert(context-bar): 撤销 1.6.267 的 /clear lock sessionStorage 持久化（保留 load_end 增量解锁兜底），lock 状态回到纯 in-memory，刷新页面即丢失

## 1.6.267 (2026-05-15)

- feat(log-mgmt): 日志管理工具新增「压缩归档」批操作，单个 .jsonl 压成同名 .jsonl.zip；查看/下载/合并/删除/统计透明支持 .jsonl.zip（首次访问解压到 tmpdir 缓存，sidecar mtime+size 命中跳过解压；UTF-8 GP flag / Zip Slip 防护 / Windows rename 重试 / 启动清理 >7 天未访问缓存；validateZipEntries 上限对齐 400MB 防自家归档读不回；archiveJsonl unlink 失败回滚 zip）
- fix(context-bar): 修复血条 /clear lock 状态在 mainAgent 已经追加多条新请求后仍卡 0%（SSE load_end 增量模式 + delta 含 mainAgent 带 messages 条目才解锁，避免 backlog replay 误触发）
- fix(memory): 持久记忆面板「刷新」按钮在 MEMORY.md 不存在时不再灰禁，允许用户主动重查捕捉「从无到有」过程
- chore(log-mgmt): 日志合并大小上限前后端统一 400MB（原前端 500MB / 后端 300MB 不一致；错误文案随常量参数化）
- feat(file-explorer): 文件浏览器支持拖到容器空白处 = 移动到项目根目录（之前从二级目录拖回根没有交互入口）；蓝色 dashed 容器高亮区分 external import 的绿色语义；TreeNode dragOver/drop 全分支 stopPropagation 防冒泡误触发；已在根 no-op 静默
- fix(log-mgmt): 选中含归档（.jsonl.zip）文件时「合并日志」按钮 disabled + 非 primary 样式；mergeLogFiles 后端拒绝 .jsonl.zip 兜底；归档文件「已归档」tag 与 preview 文本并排显示（之前 preview 不空时漏显）
- feat(context-bar): `/clear` 后血条 lock 状态同步到 sessionStorage（按 projectName 拆 key），刷新页面后保持 0% 锁定到用户发出非 /clear 消息
- feat(electron-diag): 主进程 + 三层 webContents（tabBar / workspace / tab）错误日志落盘 `~/.claude/cc-viewer/electron-diag.log`（JSON Lines / 2MB rename rotate / token + 用户路径 redact / 单条 16KB cap / 0600 权限 / 循环引用守卫）；startMgmtServer 失败弹 dialog + exit 避免白屏
- chore(jsonl-archive): cleanupExtractCache 改用 mtimeMs（noatime 兼容）；migrateStatsCacheKey 同步更新 size+mtime 避免 stats 全量重解析；renameWithRetry 阻塞 200ms→50ms 降低 event-loop 影响

## 1.6.266 (2026-05-15)

- fix(subagent): SubAgent / Teammate 末轮工具结果跨请求补偿渲染（全局 tool_use_id → result 索引,并行 sub-agent 交错场景下结果可正常显示）
- feat(chat): 工具调用结果支持 base64 / url 图片渲染(紧凑模式 hover 浮窗 + 完整展示模式 ToolResultView 都生效;MIME 白名单 png/jpeg/gif/webp,超过 2MB 或单 session 32 张图后老 entry 降级文字占位,popover lazy + destroyOnHide)
- feat(chat): 紧凑模式工具按钮 hover 浮窗追加 tool_result 文本预览(支持滚动查看长输出,strip Read 行号 / Bash ANSI)

## 1.6.265 (2026-05-13)

- fix(interceptor): `_commitDeltaState` 加幂等守卫，防止 mainAgent 请求乱序完成时较短 commit 倒推 eager-updated 状态导致 doubled-history 残余
- fix(ui): GitChanges 标题栏刷新图标垂直对齐（headerTitle 改 inline-flex + align-items:center）
- refactor(file-viewer): 移除 MDX 「强制 GUI 编辑」入口与 forceMdxOverride state；扩展检测命中或解析失败时只走旧 marked 预览

## 1.6.264 (2026-05-13)

- feat(voice-pack): Approval Settings 新增「语音包」面板，可为 4 类生命周期事件绑定音频（plan 审批 / askUserQuestion / 60min 超时预警 5min+60s 双段 / Claude turn 结束）
- feat(voice-pack): 内置「Pixel Buddy 像素小宠物」chiptune 默认包（5 个 8-bit SFX，总 ~100KB）+ 用户上传 mp3/wav/ogg/m4a（≤2MB）；全局开关 + 音量条 + 试听 + 重置；Mobile phone 也能配
- feat(voice-pack): `/api/voice-pack/{list,upload,delete,audio/:id}`；上传 loopback-only + magic bytes + UUID 白名单 + symlink 防穿越；audio 接口 HTTP Range 206 兼容 iOS Safari；`/api/preferences` `approvalModal.voicePack` 深合并 + 失效 id 自动 reconcile
- feat(voice-pack): turn-end 用 Claude Code Stop hook（auto-install 到 settings.json）+ SSE 广播，比 streaming 状态更准；超时预警复用 AskTimeoutCountdown 时钟源；30s 冷却 + focus gate
- feat(voice-pack): 21 i18n key × 18 lang

## 1.6.263 (2026-05-13)

- feat(ask-timeout): AskUserQuestion 超时改 60min（原 5min），等价 terminal 无超时体验；问题卡片底部新增倒计时显示（wall-clock 校准 + visibility 触发即时刷新 + unmount/0 双闸内存回收）；ask-hook-pending / sdk-ask-pending 广播附 startedAt + timeoutMs；WS 重连后 server replay pending ask 含剩余 timeoutMs 倒计时连续不重置；倒计时 ≤60s 切 warning 色 + a11y role=timer aria-live；6 i18n key × 18 lang
- feat(ask-cancel): AskUserQuestion 支持 web 端取消 + 输入框打字打断（等价 terminal Esc / 打字打断），双 SDK + Hook 模式：SDK 走 cancelApproval sentinel → canUseTool deny；Hook 走 ask-bridge cancelled 分支 → PreToolUse deny；新增 ask-cancel WS 协议 + ack 防 race；ChatMessage 新增 isCancelled 第四态；协议级 [cc-viewer:cancel] sentinel 前缀替代脆弱文案匹配；老协议 msg.id fallback 改 WARN 防串答；_waitForApproval kind tag 防 cancel 撞 plan/perm；ESC 加 preventDefault + stopPropagation 防冒泡误触发 PTY 副作用；handleAskQuestionSubmit 路由兜底 pendingAsk 仍在时优先 hook bridge 不再无谓走 PTY；server ask-hook-answer entry 缺失改为 ack ask-hook-cancelled 给发起方
- feat(chat-render): web_search synthesis 多 text 块合并为单 markdown，块间 `\n\n---\n\n` 让 marked 渲染成 `<hr>`；`.chat-boxer .chat-md hr` 用 `--border-light` 避开渐变两端色 + margin 12→8px 适配
- fix(diff-minimap): 给右侧色条加 `onWheel` 转发 `deltaY` 给 scrollRef，让滚轮事件穿透到底层 scroll 容器

## 1.6.262 (2026-05-12)

- feat(chat-render): web_search_tool_result 卡片化 + `server_tool_use → result → synthesis` 分组容器
  - 卡片字段：title（safeHref 协议白名单 http/https）/ 域名 / page_age；encrypted_content 隐藏；移动端折叠前 3 张
  - sub-agent 同样启用分组；分组容器左 3px 主色色条 + 透明背景；流式 `min-height: 120px` 防 Virtuoso atBottom 误判
  - 新增 7 i18n key × 18 locale；新 utils `webSearchGrouping.js`（extractWebSearchGroups + safeHref + getHostname）
- fix(test): Windows-only test 两处 `t.skip()` 后加 `return;`，避免非 Windows 平台后续 assert 误跑

## 1.6.261 (2026-05-12)

- feat(mobile-ui): 插件管理 / CCV 进程管理 / 代理热切换 三个 Modal 在移动端改左侧滑入抽屉，与文件浏览器等保持一致
- feat: 抽 `.mobileDrawerOverlay` 公共基类 + `MobileDrawerCloseButton` 共享组件去除三套重复
- fix(team-session): popover 隐藏 `name="unknown"` 的占位条目
- style(css): 清理 4 处 `!important`（通过提升特异度替代），保留 2 处加注释（rc-motion inline style / `*:focus`）
- chore(assets): 删 6 张未引用图片（~325KB）
- refactor: 抽 `seqResourceLoaders.js` / `imageDownscale.js` / `presetShortcuts.js` 收敛重复样板
- refactor: 抽 `LogTable.jsx` 函数组件、`env.js` 新增 `isElectron`

## 1.6.260 (2026-05-11)

- fix(image-viewer): Mac 触控板 pinch 缩放灵敏度过高——旧公式每次 wheel ±15% 不区分 trackpad/鼠标导致一捏跳到 300%；改 `clamp(deltaY,-10,10)` + `Math.exp(-delta*0.014)` 指数公式
- fix(image-viewer): `onWheel` JSX 改 native `addEventListener('wheel', h, {passive:false})`，让 `preventDefault()` 真正生效阻止整页缩放叠加

## 1.6.259 (2026-05-11)

- fix(mobile): 移动端开终端后权限审批 modal 飞出屏幕——`ChatInputBar` `useLayoutEffect` 依赖 `[]` stale-closure，改 `[terminalVisible]` 让 ResizeObserver / visualViewport listener 正确 cleanup；`el === null` 时主动 `removeProperty('--chat-input-bar-height')` 回退 200px fallback

## 1.6.258 (2026-05-11)

- fix(windows): 广义 Windows 适配批 2
  - `/api/delete-file` / `/api/move-file` 加 `lstatSync` 拒符号链防 TOCTOU swap
  - multipart 3 处加 Windows 保留名（CON/PRN/AUX/NUL/COM1-9/LPT1-9）守卫
  - `gitRestoreLocks` Map per-file mutex 防多 tab 并发 revert race
  - FileExplorer 5 处 `Modal.confirm` fetch-fail 加 `message.error` 显式提示
  - 抽 `renameSyncWithRetry` 共享 helper；4 处 renameSync 接入
  - NTFS 大小写不敏感 workspace 注册比较；SIGWINCH / Electron kill 加 platform 守卫
  - spawn 路径用数组防 `&` 截断 + `windowsHide:true`

## 1.6.257 (2026-05-11)

- fix(git): Issue #84 GitChanges 单文件「撤销变更」在 Windows 下静默 no-op
  - `server.js` + `lib/file-api.js` 共 10 处路径校验从 `+ '/'` 改 `+ sep`（backslash 兼容）
  - `GitChanges.jsx::handleRestore` 改 async + `message.error` + `throw` 让 `Modal.confirm` 失败时保住弹窗
- fix(windows): #84 同类排查广义 Windows 适配批 1
  - 6 P0：CLAUDE.md 详情端点 sep 漏改；`protectedDirs` 反斜杠绕过；`lib/file-api.js` 6 处 `startsWith('/')` → `isAbsolute`；SSE/git log/log 条目改 `split(/\r?\n/)`
  - 2 P1：`/tmp/cc-viewer-uploads` 改 platform 分支（Win 走 `tmpdir()`，POSIX 保留 `/tmp`）

## 1.6.256 (2026-05-11)

- feat(ui): GitChanges 文件夹折叠/展开 + 按项目 sessionStorage 持久化（key `ccv_gitChangesCollapsedDirs:<project>`）
- feat(ui): 文件浏览器标题栏新增手动刷新按钮（FeatherIcon `refresh-cw`）
- feat(ui): 文件详情打开时记录 scroll 位置，Write/Edit 触发刷新时自动恢复（CodeMirror / 旧 marked / MdxEditor 三 viewer 适配）
- feat(ui): 文件浏览器目录展开状态按项目 sessionStorage 持久化
- fix(server + ui): HTML 预览相对资源解析——`/api/file-raw` 新增 path-style 调用，让 c8 报告里 `<script src="prettify.js">` 同目录脚本正常加载
- fix(server): HTML 预览 CSP sandbox 放行 `allow-scripts`，c8 报告等带脚本 HTML 恢复交互
- refactor: 抽 `useSessionStoragePersistedSet` hook 统一 FileExplorer/MobileFileExplorer/GitChanges 三处持久化样板
- chore(deps): 9 个非破坏性安全 patch（dompurify / hono / postcss / uuid 等）
- chore(deps): electron 35→42（消 17 个 high CVE）+ electron-builder 26.0→26.8.1

## 1.6.255 (2026-05-10)

- fix(ui): 文件浏览器 / Git 面板自动刷新机制重写
  - 收集 `tool_use_id → tool_info` 双阶段；监听 `tool_result` 而非 `tool_use`（旧逻辑漏 MultiEdit / 漏 subAgent / `_processedToolIds.size>5000` 暴力 clear）
  - 同时扫 `mainAgentSessions + props.requests` 覆盖 subAgent / teammate
  - `commandValidator.js` 加 `rmdir` / `unlink` / `find -delete` mutating 正则
- fix(ui): AskUserQuestion 弹窗"标题在但内容空白"——抽 `askPortalMatcher.js`，portal 决策同时认 `toolu_xxx` strict / `__ask__` LEGACY / `ask_${ts}_${rnd}` fallback 三种 id 形态
- chore(deps): 新增 c8 单元测试覆盖率工具 + `npm run test:coverage:html`

## 1.6.254 (2026-05-10)

- feat(ui): 侧栏三个 hover popover（数据统计 / Team / 用户 Prompt 导航）改视口贴顶 + 箭头跟随触发器中心（`placement="right"` + `pointAtCenter` + `shiftY:true`）
- fix(ui): 拒绝的 tool result 红框去掉"The user doesn't want to proceed..."模板长说明；`[Request interrupted by user]` 占位文本整条隐藏
- fix(electron): `watchTheme()` preferences.json 解析失败首次 `console.warn` 替代静默回退
- fix(server): `serveIndexHtml()` SSR 主题注入加自检——模板缺 `<html data-theme>` 时首次 warn
- chore(deps,electron): 合入 PR #82 默认剥离 `CLAUDE_CODE_NO_FLICKER`，wrapper 写到 `~/.claude/cc-viewer/shell-rc/` 不污染用户 rc 文件

## 1.6.253 (2026-05-10)

- fix(sessionMerge): 反向锚点对齐替换正向 prefix-overlap，根治 mainAgent "复制翻车"残余
  - 以 `newMessages[0]` 为锚从 `lastSession.messages` 末尾反向扫；fp 升级 `length + first32 + last32` 三元组防共有前缀碰撞
  - 加诊断挂钩 + fallback 分类计数器（`globalThis.__CCV_SESSIONMERGE_TRACE__` gated）
- docs: 新建 `docs/WIRE_FORMAT.md` 作为 entry/字段/特殊窗口/信号链路的单一真理源

## 1.6.252

- fix(proxy): 摘掉上游 `accept-encoding` 里的 zstd，根治 Node<22.15 上 routify 类自建代理回 zstd 压缩导致的 `API Error: Failed to parse JSON`；抽 `stripZstdAcceptEncoding(headers)` helper
- fix(ui): GitChanges 调换顺序——工作区变更上移、未推送 commit 折叠区下移，中间 1px dashed 分隔

## 1.6.251

- fix(interceptor): Plan C `_inPlaceReplaceDetected` 并发 mainAgent 请求竞态下漏检——`_lastMessagesCount` / `_lastTailFp` 改 eager update（请求开始即更新），不再等 `_commitDeltaState` 才同步
- feat(git): GitChanges 面板新增「本地未推送 commit」折叠区
  - 后端 `getUnpushedCommits(cwd)` 用 `\x1e`/`\x1f` 哨兵字符；`isValidCommitHash` 严格 hex 校验防注入
  - 前端 `CommitRow`：短 hash + subject + author + 智能日期 + 文件数 badge；点开展开文件 + 点文件看 commit-context diff
  - 无 upstream / detached HEAD 静默隐藏
- fix(ui): 弱化顶部"新版本"强提醒——AppHeader 顶部 orange Tag 改为 footer 版本号后的小黄签 + Tooltip

## 1.6.200 ~ 1.6.250 版本汇总 (1.6.200 ~ 1.6.250 Version Summary)

> 以下为 1.6.200 ~ 1.6.250 所有版本的功能/修复摘要，详细变更记录已归档至 git 历史。
> Below is a condensed summary of versions 1.6.200 ~ 1.6.250. Full per-version detail lives in git history.

### 1.6.240 ~ 1.6.250 (2026-05-05 ~ 2026-05-12) — Doubled-history 根治、Sticky Bottom 重构、Assistant 时间戳精准化、AskUserQuestion 多路复用、Mobile/iPad 全面对齐

- **Doubled-history 根治三层防御**：
  - 上游（Plan C，interceptor.js）`_lastTailFp` + `_sameLenInPlaceReplace` 强制 checkpoint，根治 in-place last-msg replace 时 delta=[]'丢失"末位换内容"信息
  - 客户端 `applyInPlaceLastMsgReplace(prevSessions, entry, ...)` helper：命中 `_inPlaceReplaceDetected:true` 信号时构造新 lastSession（前 N-1 引用复用 + 末位用新 entry 末位），applied=true 跳过 sessionMerge
  - `revert` 老 Layer 2 客户端短路（既无收益又有副作用，整段拆掉）
- **流式吸底 StickyBottomController 抽离**：~330 行独立 utility 收敛全部 sticky 状态、引用计数 lock、双 rAF 缓动、ResizeObserver、scrollTop 写入；修 4 个设计缺陷 + 2 个 P0（NaN 死循环 + Set 而非 Array 防 O(n²) 内存泄漏）；36 case 单测 + 集成测覆盖；ChatView -149 行净减
- **Assistant 时间戳精准化**：`_generatedTs` 新字段表"消息生成时刻"（保留 `_timestamp` 作 carrier ts），让 bubble 显示时间不再晚一拍；同时修双向映射 msg↔request（`resolveBubbleProducerTs` helper + tsItemMap + 蓝框 highlight 三点对齐）；slimmed-iter 漏赋补丁
- **AskUserQuestion 系列**：
  - 多并发改 Map 多路复用（pendingAskHooks Map + 50 cap + 5min/entry timer + id 寻址 ws answer），抄齐 perm-hook 形态
  - schema 校验失败渲染层红色徽章 `❌ 此提问被 CLI 拒绝` + `<details>` 展开原始 `<tool_use_error>InputValidationError…`；提交失败 toast 升级为 antd `Modal.warning` 含技术码
  - `options[].description` 可选化 + 抽 `askOptionDesc.js` helper 收 5 处内联
- **PC 端血条迁出 AppHeader**：终端开启时挂在 TerminalPanel 工具栏中段，终端关闭时挂在 ChatInputBar 底部；popover placement bottomLeft→topRight；ReactDOM.createPortal + slot ref 实现 DOM 外移 + 数据所有权留 AppHeader
- **校准下拉简化**：7 个具体型号 → `auto` / `1M` / `200K` 三档；AUTO 按 lastMainAgent 自检测（含 `1m` 子串 + `opus-4-7` 大小写不敏感）；老用户 localStorage 显式迁移
- **antd themeConfig 改 Object.freeze 常量**：消除每次 render 字面量重建导致的 useToken 全局 cache miss；Performance trace 实测 antd R 函数 5344ms→260ms (−95%)、GC 6242ms→703ms (−89%)、长任务清零，根治"长时间卡死 + 滚动掉帧"
- **Tool result 内存优化**：通用化 Read intern pool 默认覆盖所有 tool_result（Bash/Grep/MCP/Task）；raw payload `tool_result` content 也走 readResultPool 共享；实测 hitRate 97.6% / 估算回收 36-92MB raw payload 重复
- **Skill import 上传**：`/api/skills/import` 接口 + Mobile cache popover 抽屉「添加/管理」入口；前端三入口（文件夹 / .zip / SKILL.md），多层安全（Zip Slip / Symlink / Zip Bomb 双层 / Unicode NFKC / TOCTOU 修复）
- **CLAUDE.md 入口分区**：cache popover "持久记忆"上方新增 CLAUDE.md 候选清单；`/api/claude-md` 路径白名单 + sha1 id + 512KB cap + isReadAllowed fd-based read（闭 TOCTOU）
- **持久记忆 popover "刷新"按钮**：主动拉 `/api/project-memory` + `message.success/error` 反馈；seq 防 stale + 连点守卫 + workspace 切换复位
- **macOS 粘贴图片上传 403 修复**（PR #81）：darwin 平台 `/private/tmp/cc-viewer-uploads` 显式加 allowlist + mkdir 后 bumpWorkspacesVersion 刷 root 缓存
- **移动端偏好与 PC 对齐**：「仅窗口失焦时通知」/「日志设置」分组 / 18 语言语言选择器；ProcessModal kill 确认 / ProxyModal 删除确认 / PluginModal 子 modal 全部受控 Modal 替代 `Modal.confirm`
- **Modal 抽独立组件**：插件管理 / CCV 进程管理 / 代理热切换 → `{Plugin,Process,Proxy}Modal.jsx` PC+mobile 共用，AppHeader.jsx 净减 ~390 行
- **流式 spinner Claude 官方 SVG**：8 个 sprite-sheet（thinking/waiting/tickle/orbiting/writing/shimmer/entrance/exit）用 SMIL `<animate calcMode="discrete">` 逐帧滚；ImageViewer 同步支持 SMIL 动画 SVG（svgSanitize 集中 hook 防 event handler 注入）
- **AskUserQuestion 渲染层兜底**：`isInputValidationError` 标记 + 抽 `AskValidationBadge.jsx`；ask-bridge / `/api/ask-hook` 双端 normalize options[].description 缺失补 ""
- **AppHeader 入口压缩**：抽 `CachePopoverContent.jsx` + `MemoryDetailModal.jsx` 给 AppHeader 与 Mobile 共用；删 ~290 行模板代码
- **多视角 5-agent review 体系成熟**：每个非平凡改动配 3-5 reviewer（需求/防御/架构/质量/性能-安全），P0 强制采纳 + P1 选择性采纳；累计本区间触发 10+ 轮 UltraReview
- **测试覆盖**：1568 → 1739 用例累计；新增 `applyInPlaceLastMsgReplace`、`sticky-bottom-controller`、`refresh-plan-approval-cache`、`memoryLinkParser`、`skills-import`、`svg-sanitize`、`api-claude-md`、`server-ask-hook-map` 等多个独立单测文件

### 1.6.220 ~ 1.6.239 (2026-05-01 ~ 2026-05-05) — 全局审批 Modal、ExitPlanMode V2、Homebrew 分发、sessionMerge 内容感知、Scratch 终端、MdxEditor、Terminal 性能

- **Scratch 终端上线**（1.6.219-220）：多 tab + PTY 隔离 + 拖拽复序 + focus border 结构化预留；主/小 terminal 双双引入 `.terminalHost` / `.scratchHost` 包装层根治 xterm 渲染溢出
- **Electron tab 栏**：60px 圆角矩形重设计 + 多 tab 打包黑屏修复 + TerminalPanel 高度溢出根治
- **MdxEditor 体系成熟**：
  - 文件浏览器 markdown 改用 MDXEditor (GUI WYSIWYG)（1.6.213）
  - 解析失败自动降级到旧 marked + popupContainer 10px strip 修复（1.6.217）
  - light 白底 + 保存按钮高亮（1.6.214）
  - inline code 去背景 / 内边距（1.6.216）
  - 工具栏 tooltip 18 语全译（之前仅中文，~375 条新翻译；`<MDXEditor key={lang}>` 强制重挂载实现切语言即时生效）（1.6.230）
  - Ctrl+S/Cmd+S 保存快捷键（1.6.230）
- **sessionMerge 内容感知合并**（1.6.223）：根治 Plan Mode 上下文压缩窗口下 ExitPlanMode plan 内容丢失；新算法以 `newMessages[0]` 为锚点从末尾反向扫 + 多块连续 fp 等价校验（text/thinking 加固为 `length + first32 + last32`），三分支收口到单一 `findReverseAnchor` 主路径；流式热路径零分配
- **全局审批 Modal + ExitPlanMode V2**（1.6.224）：文件型 plan + LR/messages 双卡去重 + 5 视角 Code Review 后采纳 P0/P1（bell 持久重开 / plan-file LAN token / null-byte 防御 / ownPending 信息流）；适配 Claude Code 2.x ExitPlanMode V2 文件型 plan
- **卡片审批状态修复**（1.6.229）：ExitPlanMode/AskUserQuestion 答完不切状态——`_sessionItemCache` 失效仅看 msgsLen 导致 cached React Element 持有过期 prop；抽 `refreshPlanApprovalCache.js` / `refreshAskAnswerCache.js` helper 走 cloneElement zero-alloc 快路径
- **Homebrew 分发渠道**（1.6.225）：tap repo `weiesky/homebrew-cc-viewer` + 自动 `bump-homebrew.yml` workflow 开 PR；updater 检测 brew 安装自动跳过 npm 自更新；根治 nvm 用户切 Node 版本后 ccv "消失"问题
- **Assistant 消息时间戳旁显示 [X.XK] 上下文 token 总量**（1.6.222）+ UltraReview P1/P2 采纳
- **AskUserQuestion 双行选项卡片**（1.6.231）：从单行 `dot + label — desc` 重排为双行 `dot + flex-column(label, desc)`；1.8× 大图标 + preview 自适应（≤750px column-reverse）+ aria-radio role 键盘可达 + "Other" 输入框去蓝
- **iPad 全局审批 Modal 接通**（1.6.231）：Mobile.jsx 包 `<ApprovalModal>`（仅 `isPad &&` 启用），ChatView 接 `onPendingAsk` / `onPendingPtyPlan` / `ownTabId` / `projectName` 4 个之前缺失的 prop；mobile inline 卡片路径零回归
- **lastPendingPlanId 算法重写**（1.6.228）：从扫全量 messages 改为反向扫到最后一条非空 assistant message 只在该 message 内查 ExitPlanMode/AskUserQuestion；根治历史 plan/ask 永远 pending 误弹 modal 的 bug
- **LAN 移动端 403 修复 + DNS rebinding 守护**（1.6.227-228）：默认 allowlist 改 `[loopback] ∪ getAllLocalIps()`，与"手机扫码编程"核心场景兼容；CCV_ALLOWED_HOSTS 显式设时完全沿用用户值
- **QR Popover 一点就关修复**（1.6.228）：trigger `['hover','focus']` → `['click']` + 受控 open state + 内部 stopPropagation，移动端 tap 扫码稳定可用
- **单 ws 合并方案 D**（1.6.226-227）：两条 `/ws/terminal` 长连接合并为单条；`input-sequential-done` 跨发送方 race 修复；ask 提交回归（B' ChatView 重新接收 `data` 类型）修复
- **偏好开关 + IPC**（1.6.226）：偏好面板 3 个 Switch 点击无响应修复；「仅窗口失焦时通知」偏好接通 electron 通知逻辑（原 P2 未实现项）
- **统一文件访问策略**（1.6.227）：放开项目外文件读取 + DNS rebinding 守护双件
- **Terminal 写缓冲 O(n²) 修复**（1.6.232）：抽 `terminalWriteQueue.js`（string[] queue + offset 指针 + 周期压缩）替代原 `slice(CHUNK_SIZE)`；UTF-16 surrogate pair 边界回退 + try/catch 回滚 + drain dispose；trace 实测 `_flushWrite` 794ms→<100ms、主线程 idle 从 0.5%→16%
- **cssVar 回退**（1.6.232）：实测对比 trace 显示 antd cssVar:true 是性能**负优化**——cssinjs +170%、flattenToken +1426%、GC +56%、dropped frames +64%；getter 注释明确警告未来不要再开
- **热路径 Tooltip 原生化**（1.6.232）：3 处高频列表（TeamSessionPanel gantt 钻石 / RequestList cache-loss dot）从 antd Tooltip 改原生 `<span title="...">`；冷路径保留
- **持久记忆 popover**（1.6.232）：解析 `~/.claude/projects/<encoded>/memory/MEMORY.md` 入口 + 链接打开明细；`/api/project-memory` 路径白名单 + 512KB cap + 跨 scheme 严格白名单（仅 `#anchor` + 单段 `.md` basename）
- **header 血条 popover 抽组件 + 三端接通**（1.6.233）：抽 `CachePopoverContent.jsx`；iPad 走 click trigger Popover、手机走 `mobileCachePanelOverlay` CSS 抽屉（`transform: translateX(-100%)→0` + zoom 0.6）；chip tooltip 在手机改全屏 Modal 解决 zoom:0.6 偏移
- **memoryLinkParser 白名单**（1.6.233）：discriminated union `{open|allow|reject}` + 白名单（任何 scheme 一律 reject，仅放行 `#anchor` 与单段 `.md` basename），44 case 单测
- **load more history 兜底**（1.6.231）：`_oldestTs` 防御 guard 防 `before=null` 拼出 400 请求；失败 toast 反馈 + 18 语言 i18n
- **UltraPlan 模板瘦身**（1.6.233）：codeExpert 4 项瘦身（删二次 AskUserQuestion / 量化"spawn 2-3 review agents" / P0+P1 选择性采纳 / git diff 判空 / `git rev-parse --show-toplevel`）；researchExpert 加 AskUserQuestion Pre-requisite；同步 18 个 `concepts/<lang>/UltraPlan.md`

### 1.6.200 ~ 1.6.219 (2026-04-23 ~ 2026-04-28) — Scratch 终端基建、Per-message 模型头像、Windows ESM 全适配、MDXEditor 引入、Proxy Profile 隔离、deepseek 1M、history 归档

- **Scratch 终端首版**（1.6.219）：独立多 tab + PTY 隔离 + 拖拽复序 + focus border 结构化预留（为 1.6.220+ 完善铺路）
- **工具栏快捷按钮 paste 块**（1.6.218）：紧贴 `\r` 拆分修复（窗口失焦也能立即提交，避免 tab 切换后 paste 残留）
- **MdxEditor 引入文件浏览器**（1.6.213）：`.md` 文件 GUI WYSIWYG 编辑替代之前的纯 markdown 预览；保留 Code 模式切换；移动端 zoom:0.6 适配
- **MdxEditor 解析失败自动降级**（1.6.217）：marked fallback 兜底 + Force GUI Edit 锁解除 + 1-frame 红横幅闪烁抑制
- **代码浏览器字体收敛 12px**（1.6.216）+ AskUserQuestion "Other" Enter 提交修复 + MdxEditor inline code 去背景内边距
- **History 1.6.0 ~ 1.6.199 压缩归档**（1.6.216）：旧版本详细变更归档至 git 历史，本文件保留 1.6.200+ 详情 + 1.6.0~1.6.199 5 个时间段摘要分组（180~199 / 160~179 / 130~159 / 100~129 / 50~99 / 1~49）
- **README 多语言重构**（1.6.216）：17 个 docs/README.\*.md（zh/zh-TW/en/ko/ja/de/es/fr/it/da/pl/ru/ar/no/pt-BR/th/tr/uk）结构对齐主 README，截图统一
- **/clear 触发 Header 血条乐观重置**（1.6.214）：触发 /clear 后 Header 上下文血条立即乐观重置到低位
- **/clear 后首条 user 输入错位修复**（1.6.212）：ChatView 中错位渲染问题修复 + 数据统计入口从 Header 顶部 Tag 迁移到左侧 navSidebar
- **Per-message 模型头像 1v1 严格匹配**（1.6.211）：消除历史消息被最新 model 污染——`getModelInfo` Map memo + `modelNameByReqIdx` carry-over + `resolveModelInfo(ts)` 闭包，多模型会话头像精准
- **模型名解析改 response 优先**（1.6.210）：避免请求阶段 model 字段不准；新增 deepseek-v4 1M 上下文识别
- **KV-Cache-Text 复制路径**（1.6.209）：用 on-model XML 形态 + formatter 抽到 lib/；SubAgent KV-Cache-Text 复用同一路径
- **Windows 用户插件加载 ESM 修复**（1.6.208）：1.6.207 的 ESM 适配漏掉了用户插件路径
- **Windows ESM 全量适配**（1.6.207）：动态 `import()` 在 Windows 用 `pathToFileURL` 包绝对路径（防 `file://${path}` 模板拼接错误）；PATH 分隔符 `:` → 平台感知 `;`；多个 `require.resolve` 兼容
- **PR #70 post-review hardening**（1.6.206）：plugin 加载路径多项防御强化
- **部署后陈旧 chunk 自愈**（1.6.215）：server cache + lazy reload 修复"点 .md 文件偶现 Failed to load module script / Failed to fetch dynamically imported module"
- **Proxy Profile per-workspace 隔离**（1.6.200）：拆两层存储——`~/.claude/cc-viewer/profile.json` 仅 profiles 列表（全局共享，watchFile 跨进程 CRUD），`<projectDir>/active-profile.json` 仅 `{activeId}` 独占 workspace；多 workspace 热切换互不覆盖
- **AppHeader 主题切换 pill-style button**（1.6.200）：从 antd Switch 改为 56×30 原生 button + `role="switch"` + `aria-checked` + 太阳/月亮 SVG 切换；QR 码入口与 themeToggle / compactBtn 同高 30px 对齐
- **CountryFlag 组件抽出**（1.6.200）：从 AppHeader 右侧 18px emoji 迁到 footer 左下；字号 13px + `AbortSignal.timeout(5000)` 防悬挂；ipinfo.io 失败隐藏
- **a11y 键盘可达**（1.6.200）：QR + CountryFlag `<button>` 包裹 + `:focus-visible` 轮廓；Popover trigger 改 `['hover','focus']` Tab 聚焦即展开
- **热切换诊断日志去 apiKey 明文**（1.6.200）：`CCV_DEBUG_HOTSWITCH` 分支只输出 `authSet/xApiKeySet/matchedAuthKey/matchedXApiKey` key 名，不输出任何 key 片段（审计工具 sk- 模式不再误报）
- **Auth 替换纯函数抽取**（1.6.200）：抽 `_replaceProxyAuthHeaders`（内部，不 export），`toLowerCase()` 匹配任意大小写 `authorization` / `x-api-key`，两者都不存在时强制植入 `x-api-key`
- **测试覆盖**：1100+ → 1568 用例累计（含 `proxy-profile-isolation.test.js` 228 行 + `proxy.test.js` 11 用例 + `synthetic-classification.test.js` 9 用例）

## 1.6.0 ~ 1.6.199 版本汇总 (1.6.0 ~ 1.6.199 Version Summary)

> 以下为 1.6.0 ~ 1.6.199 所有版本的功能/修复摘要，详细变更记录已归档至 git 历史。
> Below is a condensed summary of versions 1.6.0 ~ 1.6.199. Full per-version detail lives in git history.

### 1.6.180 ~ 1.6.199 (2026-04-20 ~ 2026-04-23) — Synthetic 请求识别、Skill 管理、UltraPlan 强化、xterm 兼容修复

- RequestList 新增 `Synthetic` 类型识别 Claude Code 合成调用（Recap/Title/Compact/Topic/Summary 5 类白名单 + `tagMuted` 弱化样式）
- AppHeader 工具弹层接入「已载入 Skill」分组 + Skill 管理 Modal：CRUD 切换 user/project skill 启用态，4 色徽章 + 响应式 width，写入 `~/.claude/skills` / `<project>/.claude/skills`
- FileExplorer 支持批量文件夹拖入保留目录结构（`webkitGetAsEntry` 递归 + 深度上限 32 + 1000 文件二次确认 + 并发 3 + `wx` 独占写防 TOCTOU）
- Team 会话面板状态收敛：`endReason` 四值 + `team-runtime.js` fs 探测 + `POST /api/team-status`，消除永久 `⏱` 中间态
- UltraPlan：`+` 按钮迁出 header 改 `.variantRow`，许愿机弹层补图片缩略点击放大 + × 二次确认 + hover 蓝框 + 22×22 触控
- 撤回 `CLAUDE_CODE_NO_FLICKER=1` 默认注入（销毁 scrollback 副作用），保留 `CLAUDE_CODE_DISABLE_MOUSE=1` 保住文本选中
- 终端 Shift+Enter 换行改走 `\x1b\r` 对齐 Claude Code 2.x 官方约定，配合 `preventDefault + stopPropagation` 关闭 textarea 默认 LF 路径
- 图片上传 2000px 防线修复：删除字节回退 + 去掉 `RESIZABLE_TYPES` 白名单 + HEIC/AVIF/GIF/BMP 一律转 JPEG
- xterm.js 6.0.0 `requestMode` TDZ 修复：`vite.config.js` 切到 `terser` + `mangle: false`（Vite 顶层 esbuild 不传 build minify 阶段）
- iOS 权限面板坐标修复：用 `visualViewport.height` 替代 `window.innerHeight`（iOS Safari 忽略 `interactive-widget=resizes-content`）
- CustomUltraplanEditModal mobile 双 modal 堆叠修复：`zIndex={1200}` + 父 UltraPlan 自动关闭，编辑期间单 modal
- 接收陈旧消息修复 + 测试增强：1024 → 1180 绿用例累计

### 1.6.160 ~ 1.6.179 (2026-04-15 ~ 2026-04-20) — SSE 流式打字机、claude --thinking-display 兼容、CLAUDE_CONFIG_DIR 全链路、麦克风语音、模型头像稳定

- SSE 实时打字机覆盖：MainAgent 流式 chunk 通过 `/api/stream-chunk` POST → SSE `stream-progress` 事件 → ChatView Last Response 位 inline `▌` cursor，rAF 合批 + `React.startTransition`
- 流式渲染性能：增量 markdown `splitFrozenTail` 仅重渲尾段 + `_mdCache` LRU + Vendor chunk split（`vendor-codemirror` / `vendor-antd` 等 8 组），app chunk 3.2MB → 827KB
- 发送按钮 spinner 主线程提升修复：拆 HTML div 显式像素尺寸 + `will-change: transform` 让 Blink 提升 compositor 层
- `claude --thinking-display` 反应式回滚：`pty-manager.js` 维护 `_thinkingDisplayRejectedPaths: Set`，crash 时按 `outputBuffer` 匹配未知 option 自动重试无 flag，替代版本号探测
- `CLAUDE_CONFIG_DIR` 6 处真实运行时路径迁移（Electron theme watcher / findcc / ensure-hooks / preferences API / TerminalPanel agentTeam tooltip），新 `tc()` i18n wrapper 注入 `{configDir}` 占位
- ccv 启动 claude 默认带 `--thinking-display summarized`（Opus 4.7 thinking 默认关闭后兼容）
- Custom UltraPlan Expert：用户自定义专家模板，CRUD + `+` 按钮 + 跨组件 `ccv-presets-changed` 同步
- ChatInputBar 麦克风语音输入：`webkitSpeechRecognition` BCP47 自动跟 UI 语言，IME-safe，HTTPS/secure context 检测，`interimPreview` 绝对定位浮在 textarea 底部
- ChatView 头像稳定 3 重修复：`getModelInfo` Map memo + `modelNameByReqIdx` carry-over + `resolveModelInfo(ts)` 闭包，多模型会话 per-message 头像准确
- iPad 模式响应式扩展（`?ipad=1`）：iOS Safari 走 `transform:scale` 非虚拟化路径绕开 `minimumLogicalFontSize` 9px 钳制
- Claude logo 流式 wave 动画 + 单色 logo 浅色主题 `currentColor` 修复（GLM/Kimi/MiniMax）
- `ccv` Claude Code 2.x 兼容：扫描 `bin/claude.exe` + 平台 optional dep `@anthropic-ai/claude-code-darwin-arm64`，老 npm hook 自愈到 native hook
- 多 repo Git 支持、iPad 拖拽上传、移动端文件浏览器三层体验补齐
- ToolApprovalPanel 锚定到输入条顶边（`position: absolute; bottom: 100%`），手机端通过 `--chat-input-bar-height` CSS var 跟随
- 测试覆盖：964 → 998 绿用例累计

### 1.6.130 ~ 1.6.159 (2026-04-09 ~ 2026-04-15) — 多 Tab Electron、浅色主题、SDK 集成、自动审批、Workspace 模式、UltraPlan 体系

- Electron 多 Tab 架构：BaseWindow + WebContentsView，每 Tab 独立 fork() 子进程（proxy/server/PTY 隔离），Cmd+T/W/1-9 快捷键，常规启动/免审启动双按钮
- 浅色主题（雪山白）全套：`[data-theme]` + ~50 语义 token + 31 组件 CSS 变量化 + Antd ConfigProvider/CodeMirror/xterm 主题适配
- Agent SDK 集成：`lib/sdk-adapter.js`/`sdk-manager.js` 跑 Claude 不走 PTY，SDK plan/AskUserQuestion/canUseTool 走 WebSocket
- 工具审批面板：Bash/Write/Edit/NotebookEdit 走 PreToolUse hook bridge → web UI 审批，多设备同步 `*-resolved` 广播 + 队列 `+N queued` 徽章
- 自动审批倒计时：按模型族（Claude/OpenAI 3s、Gemini/DeepSeek/Qwen 5s、GLM/Kimi/MiniMax 10s），off/3/5/10/15/20/30/60s 可配
- Workspace 模式登录页 + Electron 多项目切换 + auto add `-c` 续会
- UltraPlan 体系完工：代码专家/调研专家 pill 切换，`+` 自定义专家，许愿机 modal/popover 双入口，文件/图片上传，`<system-reminder>` 自动包裹 + scoped instruction 限制扩散
- Markdown 操作条：复制/导出 .md/保存为图片（html2canvas）/保存到项目，hover 触发 + 节流 + actionBar 移到气泡外右侧 column 布局
- 移动端革新：底部 hamburger 菜单 + 文件浏览器 overlay + Git Diff 全屏 + iPad pad-mode 两栏 + 上下文血条铺到手机
- Markdown action bar 收纳复制按钮进下载菜单（避免覆盖 + 132 行 i18n 新 key）
- 多 repo Git 探测（项目根 + 一级子目录）+ 图片预览 + 行数 `+N -M` 徽章（含 untracked 文件）
- 主题快切（雪山白/曜石黑）+ Claude Code `/theme` PTY 命令同步 + 终端自动 focus 反馈
- File Explorer 拖拽移动 + 系统拖入导入（`/api/import-file` + 自动展开 hover 500ms）
- ImageLightbox：滚轮缩放 / 双击切换 fit / 拖拽 / iOS 安全区，对话/diff/markdown 多入口接入
- 自定义用户名/头像 CLI（`--user-name` / `--user-avatar`，本地 png/jpg/gif/webp ≤2MB 或 http URL）
- macOS 代码签名/公证（entitlements + notarize 脚本，超时降级为跳过保 CI 60min 内）
- Mermaid 渲染 + DOMPurify svg profile + 主题切换重渲

### 1.6.100 ~ 1.6.129 (2026-04-05 ~ 2026-04-09) — 自动审批基建、流式打字机预备、Mobile 增量加载、CSS 颜色统一

- 简化工具显示模式：默认折叠工具调用为紧凑 tag，Edit/Write/Agent/TaskCreate/EnterPlanMode/ExitPlanMode/AskUserQuestion 保留全展示，hover popover/click popover
- 终端 Shift+Enter 换行 + Ctrl+C 双击拦截 + bracketed paste 单块粘贴
- AskUserQuestion `PreToolUse` hook bridge：`/api/ask-hook` 长轮询 + WebSocket 路由，结构化答案绕开 PTY 模拟，超时 30s 自动恢复
- Tool 审批面板首版（Bash/Edit/Write/NotebookEdit）：黄色虚线动画边框，键盘 Tab/Esc 友好，focus 自动恢复
- 移动端 SSE 增量加载：初始 200 条，按 100 条 batch 请求 `/api/entries/page`，session 级冷热分片（8 热 + IndexedDB 冷）
- LRU cache 系列：`renderMarkdown` 1024 / `highlight` 512 / `renderAssistantText` 512，session 级增量 `buildAllItems`
- 流式 spinner / streaming border / loading pet pixel 动画
- iOS 移动版面板互换：聊天主、终端 overlay（Safari 兼容）
- 体感小修补：`mobileVirtuoso` Footer 不重渲（context prop） / 超 240 条 → 0 → race / `_processEntries` 4 pass 合并 / `setState` rAF 节流（500/s → 60/s）
- CSS 颜色 203 → 102（-49%）：rgba/rgb/named 统一 hex，灰/蓝/红/绿/黄合并，inline style 抽到 module
- ToolApprovalPanel 进入聊天区域（`position: absolute` 相对 `messageListWrap`），自动 focus Allow，Esc 拒绝
- Multi-device perm/plan/ask 广播 `*-resolved` + ask-hook 跨设备同步
- 全局设置日志目录：runtime `setLogDir()` + preferences UI + GlobalSettings concept doc 18 语言
- WebFetch/WebSearch 加入 `APPROVAL_TOOLS`，git/npm guard 合并到 perm-bridge 消除 Bash matcher 冲突
- 终端 pending 文件 tag 条 + 多设备同步 + Enter 自动注入路径 + git checkout `??` 改 `git clean -fd`
- KV-Cache popover 重构 builtin/MCP 分组 + ConceptHelp 接入
- File Explorer 右键菜单 7 项（reveal/copy path/rename/delete/new file/new dir/open terminal）+ Git Changes 右键 hover actions
- ipinfo.io 国旗 + 5s timeout 失败隐藏；`/api/import-file` 从 OS 拖文件进项目目录

### 1.6.50 ~ 1.6.99 (2026-03-28 ~ 2026-04-05) — Plan/Dangerous 审批、AskUserQuestion 多问、文件浏览器右键、PTY 镜像

- Plan 审批 GUI（ExitPlanMode）：内容预览 + Approve/Edit/Reject 按钮；危险操作（Bash/Edit/Write）琥珀色审批卡 Allow/Deny；权限拒绝红色 `Denied` 徽章
- AskUserQuestion 多问支持：multi-select Other 通过 → + Enter 提交；isMultiQuestion 标记尾问；PTY ↑↓ delay strategy 让 inquirer 重渲
- AppBase 拆分 Mobile/PC entry：动态 import code splitting，`AppBase.jsx` 共享 + `App.jsx`/`Mobile.jsx` 子类
- 文件浏览器：内联 rename（双击/F2）、可点击聊天文件路径跳转 + 自动展开目录树、文件/文件夹右键菜单、删除/`reveal in explorer`/`copy path`/`new file`/`new folder`
- markdown preview toggle for `.md` files + DOMPurify 全链路
- 多设备审批/计划/问答同步 + perm-bridge 白名单反转（只 Bash/Edit/Write/NotebookEdit 走审批）+ 32 单测
- Image Lightbox：PC 滚轮+拖拽+双击；移动端 pinch+拖拽+点击关闭；iOS safe-area
- Native teammate detection：`Agent` 工具子代理改名 `Teammate`，hook context 自动提取名字 + 颜色哈希
- 流式状态 SSE 全链路（`stream-progress`）：聊天输入条 SVG 流光边框 + Virtuoso footer spinner + 5 层渐变
- 终端剪贴板图片粘贴 + Retina 降采样 + 多设备同步 image-upload-notify
- chat textarea image paste + 文件 chip 预览 + 延迟路径注入（send 时拼接而非贴入 textarea）
- iOS Safari 移动布局：`mobileCLIBody` flex 方向修复，键盘安全
- macOS 系统头像 fallback、文件资源管理器集成（`/api/reveal-file`/`/api/open-terminal`/`/api/create-dir`/`/api/create-file`/`/api/delete-file`/`/api/rename-file`/`/api/import-file`）
- TerminalPanel chat 镜像：`pendingImages` 双向同步，textarea 不污染、send 时注入
- /api/file-raw 路径穿越 + 符号链接保护（realpathSync containment）

### 1.6.0 ~ 1.6.49 (2026-03-18 ~ 2026-03-28) — 增量重构、Teammate 显示、KV-Cache 缓存内容、SSE 心跳

- ChatView 增量重构：`buildToolResultMap` WeakMap O(1) + `buildAllItems` 单 pass + `appendCacheLossMap` append-only + Last Response 独立 state（消除 middle-insertion reflow）
- `_reqScanCache` 拆独立计数器，`isTeammate` WeakMap，`extractTeammateName` per-request cache
- Teammate 显示优化：`Teammate: name(model)` 格式 + 专属 team 图标 + per-name HSL 哈希着色 + 真实姓名从 SendMessage `routing.sender` 提取
- AskQuestionForm 抽组件 + multi-select 本地 state 隔离消除父级 re-render
- `ptyChunkBuilder.js` 纯函数生成 PTY 序列；`writeToPtySequential()` 服务端写队列；`input-sequential` WS 类型
- Mermaid 图表渲染（lazy-loaded ~460KB）+ DOMPurify svg profile + 主题适配
- Proxy Hot-Switch：`fs.watchFile` 动态切换 API URL/Auth/Model 不重启 Claude Code，profile.json 0o600
- 大 JSONL 文件 OOM 修复：服务端不再 reconstruct delta，原始 SSE 推送，前端本地 reconstruct；分块 1MB 读
- 移动端 SSE 增量首版（`since` filter + Map dedup）+ react-virtuoso 虚拟列表（24000 → 2000 DOM 节点）
- 上下文血条：`readModelContextSize()` 解析 `[1m]` 后缀，`watchContextWindow` polling 移除避免跨进程数据污染
- 国家国旗（ipinfo.io）+ drag-drop 文件上传
- SSE heartbeat 30s + 客户端 45s 自动重连（最多 10 次）
- `/api/local-log` 独立 SSE 流隔离 CLI mode + checkpoint 对齐分页
- KV-Cache popover：仅展示 `cache_control` 内容块、tools/system/messages 三段折叠、SubAgent KV-Cache-Text
- File Explorer 内联 rename、点击文件路径跳转、自动展开目录、auto-refresh on Edit/Write 检测
- AskUserQuestion `ensureAskHook` PreToolUse hook 自动注入 `~/.claude/settings.json`，xterm Ctrl+C 双击拦截 i18n toast
- TeamModal hook order violation 修复（早 return 移到 hooks 之后）
- 浅色样式诸多过渡：sticky bottom 按钮位移、虚线动画、xterm 主题, light theme palette 修补

---

## Pre-1.6 版本汇总 (Pre-1.6 Version Summary)

> 以下为 1.6.0 之前所有版本的功能摘要，详细变更记录已归档。
> Below is a condensed summary of all versions prior to 1.6.0.

### 1.5.x (2026-03-08 ~ 2026-03-17) — 上下文血条、CodeMirror 编辑器、交互式审批

- 上下文血条：「当前项目」tag 替换为 context usage 血条（绿/黄/红），statusLine wrapper 脚本捕获 `used_percentage` 推送 SSE；`getModelMaxTokens()` 模型上下文窗口映射；KV-Cache user prompt 点击跳转 + `scrollend` 动画时机 (1.5.24/26/45)
- AskUserQuestion 交互式：聊天面板内渲染 Radio/Checkbox + 提交按钮，支持单选/多选/Other 自定义输入/Markdown preview；已回答自动切换静态卡片；多问题串行 PTY 提交 (1.5.21/39/41/43)
- Plan approval UI：ExitPlanMode 卡片审批/拒绝/反馈按钮，内置默认选项 fallback 无需等 PTY 侦测 (1.5.37/39)
- CodeMirror 6 编辑器：FileContentView 从 highlight.js 迁移到 CodeMirror，支持编辑保存（Ctrl+S + `/api/file-content`）、minimap、自定义 gutter；GitDiff 点击路径跳转对应行 (1.5.3/11/16/22)
- `$EDITOR` / `$VISUAL` 拦截：Claude 编辑请求在 FileContentView 打开，保存关闭继续；服务端 editorSessions Map + WebSocket 广播 (1.5.14)
- CCV 进程管理：列出 7008-7099 端口所有实例，PID/port/命令/启动时间展示，UI 停止闲置进程；`GET /api/ccv-processes` + `POST /kill` 带安全校验 (1.5.12)
- CLI 透传改造：`ccv` 成为 claude drop-in 替换，参数直传；`ccv -logger` 独立安装 hook；`-v/-h/--version/--help` 绕过 hook；`--d` = `--dangerously-skip-permissions`；注入 Claude PID 到 `onNewEntry` (1.5.19/23/25)
- 移动端性能与体验：IndexedDB 本地缓存 + 7 天过期；消息列表分页 (末尾 240/300 + load more)；SSE 增量加载 (`since/cc` metadata) ；User Prompt 查看器 + 导出；长 bash 自动折叠；stick-to-bottom 按钮 2x 尺寸；display 设置进 mobile menu (1.5.0/5/8/10)
- iOS 专项：终端从 WebGL 降级 Canvas 解决严重卡顿；`visualViewport` + fixed positioning 修复键盘顶起导航栏；`interactive-widget=resizes-content` viewport meta；scrollback iOS=200 / Android=1000 / Desktop=3000；虚拟按键栏 touchstart preventDefault + 按键后 blur，消除按键误触发虚拟键盘 (1.5.7/17)
- Terminal 增强：文件上传按钮（PC 工具栏 + chat input）50MB 限制 + 唯一文件名；bracketed paste (`\x1b[200~`) 阻止多行粘贴误触发 submit；`ultrathink` 按钮；大写入分 32KB 跨帧避免主线程阻塞；outputBuffer ANSI 安全截断 (1.5.4/15/31/42)
- Log 管理：下载/批量删除日志（`/api/download-log`、`/api/delete-logs`）；Log 列表 List→Table 可排序；JSONL 紧凑格式 + MAX_LOG_SIZE 200MB→150MB + 合并 API 300MB 上限；Preview 列 Popover（hover/click）带 stats-worker v6→v8 缓存失效 (1.5.1/5/18/37/40)
- Git/File 联动：Claude 写操作后（Write/Edit/Bash/NotebookEdit）自动刷新 FileExplorer 和 GitChanges；Git U 状态绿标替换 `??`；侧边栏文件夹/Git 按钮改 toggle (1.5.22/27/29)
- 插件 API：`httpsOptions` hook (waterfall) 替换硬编码 HTTPS cert；`serverStarted` hook 新增 `url/ip/token`；`/api/local-url` 尊重实际协议；`proxy-errors.js` / `proxy-env.js` 移入 lib/ (1.5.21/32)
- 修复与回归：`watchLogFile()` 初始化 `lastSize` 修复重启重复广播；`proxy-errors.js` 补进 npm files array；`installShellHook` 内容比对替换过期 hook；SSE clients 数组 mutate-in-place 修复断连后失联；`claude -v/-h` 正确透传；QR popover 自适应宽度；DiffView 固定 gutter + 背景全宽；ConceptHelp dark-theme 修复 (1.5.2/6/9/20/30/34)
- 测试与覆盖率：覆盖率 line 68.98%→71.23%、branch 69.17%→72.81%；新增 `test/git-diff / log-watcher / findcc / context-watcher / upload-api / proxy-errors / updater / stats-worker` 系列单测；`npm run test:coverage` 脚本 (1.5.29/31)

### 1.4.x (2026-03-02 ~ 2026-03-07) — CLI 模式与终端集成

- CLI 模式 (`ccv -c`)：内置 PTY 终端直接运行 Claude，支持 npm/nvm 安装路径自动检测
- 分屏布局：终端 + 对话双面板，可拖拽调整比例
- 文件浏览器：树形目录、文件内容预览、minimap、支持 dot files 和 gitignore 灰显
- Git 集成：变更文件列表、统一 diff 视图（双行号）、diff minimap
- 工作区管理：多工作区切换、SSE 状态同步
- 插件系统：动态加载/卸载、启用/禁用状态管理
- 自动更新器：版本检测与自动升级
- 终端优化：WebGL 渲染 + context loss 恢复、Unicode11 CJK 支持、WebLinks、scrollback 扩容、PTY 输出批量合并
- SSE 分块加载：大日志文件分 50 条 chunk 传输，带进度指示
- 安全：LAN 移动端 token 鉴权修复
- 卸载命令 (`ccv --uninstall`)：完整清理 hooks 和配置

### 1.3.x (2026-02-28 ~ 2026-03-02) — 移动端适配与国际化

- 移动端响应式：虚拟按键栏、触摸滚动惯性、固定列宽自适应字号
- 国际化 (i18n)：支持 18 种语言（中/英/日/韩/法/德/西/葡/俄/阿/印/泰/越/土/意/荷/波/瑞典）
- 代理模式 (proxy)：拦截 Claude API 流量并记录
- 设置面板：主题、语言、显示选项等可视化配置
- 对话模式增强：thinking block 折叠/展开、工具调用结果渲染优化
- 安全：访问 token 认证、CORS 配置

### 1.2.x (2026-02-25 ~ 2026-02-27) — 对话模式

- Chat 模式：将原始 API 请求/响应重组为对话视图
- Markdown 渲染：代码高亮 (highlight.js)、表格、列表
- Thinking blocks：可折叠的模型思考过程展示
- 工具调用结果：结构化渲染 tool_use / tool_result
- 搜索功能：全文搜索对话内容
- 智能自动滚动：仅在用户位于底部时自动跟随

### 1.1.x (2026-02-25) — 数据统计面板

- Dashboard：请求统计、模型用量图表、token 消耗分析
- 缓存重建分析：按原因分类统计（TTL、system/tools/model 变更、消息截断/修改）

### 1.0.x (2026-02-24 ~ 2026-02-25) — 请求查看器

- Request/Response 详情查看器：原始请求体、响应体、流式组装
- 缓存重建分析：精确识别 system prompt / tools / model 变更原因
- Body Diff：JSON/Text 视图切换、复制按钮
- 双向模式同步：Chat ↔ Raw 模式跳转定位
- Claude Code 工具参考文档（22 个内置工具）

### 0.0.1 (2026-02-17) — 初始版本

- 拦截并记录 Claude API 请求/响应

