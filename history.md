# Changelog

## 1.6.307 (2026-06-09)

- fix(im): 「对话记录」弹窗助手回复滞后/不显示、需手动刷新——根因是 IM worker 独立进程/端口，其 turn_end 落在 worker 自己进程，主服务收不到。改为主服务 fs.watch 各 IM 日志目录（弹窗请求 `/api/im/:platform/logs` 时惰性登记），写入即广播 `im_log_update` SSE，前端经 window 事件零滞后自动重拉（复用保滚动的纯刷新路径）；watcher 按目录登记，切项目（LOG_DIR 变）后自动关旧重建，新增 im-log-watcher 模块 + 单测
- fix(mermaid): mermaid 渲染失败时把 "Syntax error" 节点硬塞进 document.body 污染页面——开 `suppressErrorRendering` 官方开关（失败改走 removeTempElements），渲染前 `parse(suppressErrors)` 预校验非法/半截块不触发 render，rendered 标记移到成功后以便流式补全重试
- refine(im): 日志模式（`?logfile=`）下隐藏 IM 状态 chip 与 messaging 配置入口（该模式下 IM 无法配置/使用）

## 1.6.306 (2026-06-08)

- fix(chat): 修复图片上传未完成时按 Enter 导致图片漏发(纯文字发出、缩略图孤儿式留在预览)——新增 in-flight 上传守卫:发送时若有上传在途则自动缓发,显示「上传中」占位 + 发送按钮 spinner,待上传 resolve 后自动带图重发,10s 超时只提示重试不静默发纯文字;覆盖粘贴/选图/拖拽与 SDK/PTY 两种模式,守卫逻辑抽纯函数(uploadDeferLogic)并补单测

## 1.6.305 (2026-06-08)

- fix(usage): 左下角套餐用量 pill 开关改以「响应是否解析出 `anthropic-ratelimit-unified-*`」为准，不再用首请求的 authType 卡死——首请求走 x-api-key/Unknown 时不再永久压住 pill；componentDidUpdate 无条件扫描，footer 渲染条件加 `planUsage` 兜底

## 1.6.304 (2026-06-08)

- feat(workflow): 运行中工作流面板实时显示「阶段」列——从生成脚本 `workflows/scripts/<name>-<runId>.js` 顶部 `meta.phases` 纯文本解析（字符串感知括号配对，不执行脚本）填充 live journal，按 mtime/size 缓存；前端 WorkflowList 改用 `grouped` 判定（有 phases 但 agent 无 numeric phaseIndex 时仍走扁平列表，避免 agent 列消失），完成后权威快照接管分组
- feat(workflow): 时间轴横条头/尾各加一个菱形——hover 显示该 agent 的 prompt / result 预览（原生 title，菱形 ◆ 字形 + 投影，参照 Agent Team 甘特）；server 归一化与 live 推导透传 promptPreview/resultPreview
- refine(workflow): agent 列表表格化——模型 / Tokens / 工具 / 耗时 定宽右对齐成列 + 顶部表头（「代理 (N)」占首列标题）+ 阶段行追加 `阶段:描述`，组内 agent 行缩进
- refine(workflow): 「列表 / 时间轴」切换改用 antd Segmented（自带滑块切换动画）；全局调整 antd Segmented 选中态为主色蓝填充 + 白字（替换默认浅色滑块）
- refine(workflow): 左侧弹窗打开的工作流面板去掉展开/收起（WorkflowPanel 新增 collapsible 开关，内联面板不变）
- fix(workflow): 文本解析命中时补回 _ccvWorkflow 携带的 project（用于 journal 定位消歧）；历史 run 无 live 快照时列表状态字形改用完成态，不再误显「运行中」
- test: workflow-journal/live 单测改用 describe 作用域 setEnv，修复单进程多文件跑时 CCV_PROJECTS_DIR 互相顶替致路由 404
- feat(workflow): 左侧工具栏新增「UltraCode / Workflow」专区（对齐 Agent Team）——导航图标 → popover 列出本会话所有 workflow run（从 requests 解析、taskId 去重、最新在前）→ 点击弹大 Modal 复用 WorkflowPanel 展示完整过程（阶段/agent/甘特）；历史日志模式同样可用，对话内联面板保持不变
- fix(ui): logfile 历史日志只读模式强制忽略「仅展示当前会话」（全 session 完整展示，隐藏该开关）+ 一次性全量加载（去掉移动端 limit=300 与「加载更早」分页），渲染层自动渐进扩窗至全量，无需手工点击「加载更多」
- feat(render): macOS 桌面终端恢复 WebGL 渲染器（Chromium 系，Retina 下滚动/大流量更流畅）——以 longtask 守卫可用为准入能力门，Safari 无该 API 自动留 DOM；沿用 longtask 降级 + 7 天 sticky + onContextLoss 兜底；`_disposeWebgl` 补清恢复 timer 防降级/重试交错；mac 120s 定时刷新补 atlas 清理（DOM 下 no-op）
- feat(workflow): 聊天内联渲染 Workflow 工作流面板——phases 左列 + 按阶段分组的 agent 行（label / model / 状态 / token / 工具数 / 耗时），完成态读 workflow run journal，运行中从 `subagents/workflows/<runId>/` 实时推导逐帧动画，目录变化经 SSE `workflow_update` 实时推送，完成后权威快照接管
- feat(workflow): 「列表 / 时间轴」切换——时间轴为甘特图（横条按 startedAt 错峰、宽度=耗时、运行中延伸到 now 每秒走），完成条按阶段着色、失败/运行中/排队走语义色；甘特抽成共享组件 WorkflowTimeline（含 compact 版）
- feat(workflow): 输入框上方常驻实时 HUD（WorkflowLiveHud）——运行中工作流的进度 / token / 工具数 / 已用时 + 全部 agent 行（运行中显示 lastTool），支持列表/时间轴切换与折叠，完成后自动消失，内联卡片作历史记录
- feat(workflow): 新增只读路由 `GET /api/workflow-journal`（按 runId/taskId 定位、归一化面板模型、路径穿越防御、惰性 arm watch）；出口为 Workflow tool_result 注入 `_ccvWorkflow={runId,taskId,sessionId,project}`
- fix(workflow): Workflow 加入完整渲染白名单，简化工具模式下面板正常渲染
- fix(workflow): WorkflowPanel 补 `.metaTok`/`.metaTool` 样式定义；路由补 200 快照 / live 回退 / runId 优先用例
- fix(workflow): 工作流面板定位线索改由前端直接解析 tool_result 原始文本（`Task ID` / `Run ID` / `Transcript dir` 路径段的 sessionId），不再依赖服务端 `_ccvWorkflow` 注入——历史日志（含未 enrich 的旧日志）也能渲染面板；`_ccvWorkflow` 保留为回退兼容 live
- test: 新增 server 单测覆盖 lookupToolUseResult / enrich-workflow / workflow-journal / workflow-watcher / workflow-live / workflowStore

## 1.6.303 (2026-06-07)

- fix(win): 启动报 "Cannot create process, error code: 193" 修复——`where claude` 首行常是 npm 无扩展名 sh shim/.cmd（非 PE），win32 改为只接受 .exe 行；原生安装器路径候选补查 .exe 变体（~/.local/bin/claude.exe 等）
- fix(render): 终端渲染器按平台分流——PC 从 WebGL 切回 xterm 内置 DOM 渲染器（更稳定），仅 Android 保留 WebGL；PC/iPad scrollback 3000→2000
- fix(ui): 套餐用量悬浮详情血条暗色下填充对比度过低——填充改 --text-secondary × 0.35
- fix(files): HTML 预览(coverage 等静态报告)样式不加载渲染成裸 HTML——file-raw 补 css/js/json/字体 MIME 映射(CSP sandbox 跨源下 octet-stream 样式表被浏览器严格 MIME 校验拒用)
- fix(win): /plugins 菜单卡死——直通态 ws 消息风暴限流（leading-edge 立即发 + 16ms 微合并 trailing，上限 ≈125 msg/s，CCV_FLOOD_PT_COALESCE_MS 可调）+ resync 重绘 nudge 冷却门（server/lib/resync-nudge-gate.js，防 behind→resume 死循环，CCV_RESYNC_NUDGE_COOLDOWN_MS 可调）+ 直通消息率/resync 计数日志
- fix(render): DOM 渲染器适配调优——写队列 trim 提示补 \x1b[?2026l 防 DEC 2026 配对撕裂渲染停顿；mac/iOS 字体栈补 PingFang SC 确定性承接 CJK；定时刷新分流（Android 60s L2 / PC·iPad 120s 仅全行重绘，去掉定时 fit+resize 的滚动跳动）；清理遗留 WebGL sticky key

## 1.6.302 (2026-06-07)

- fix(win): PTY→WS 洪泛限流器（server/lib/pty-flood-coalescer.js）——字节率超阈值合并 + last-wins 截断（速率上限 ≈1.9MB/s，DEC 2026 配平，CCV_FLOOD_* 可调参），根治切主题/大流量场景 ConPTY 重绘洪泛卡死客户端
- fix(win): /theme 注入修正——mismatch 不再重发（现代 CLI 为交互式选择器），超时检出选择器残留时 ESC 兜底关闭，并发切主题防重入
- fix(win): 文件浏览器「在系统中展示」失效修复——explorer.exe /select 改 verbatim 规范形式（仅路径加引号），含空格/中文路径可用

## 1.6.301 (2026-06-06)

- fix(base-path): 修复反代子路径下 API/SSE/file-raw 路由失效（剥前缀写回 parsedUrl.pathname）；CCV_BASE_PATH normalize 收敛到 server/lib/base-path.js + 启动校验告警 + index.html 注入转义修复
- fix(win): Ctrl+C 退出三层防御——cleanup watchdog 5s 强退 + 连按立退、win32 raw-mode keypress 兜底 SIGINT 不送达、killPty 改 taskkill /T 收割 ConPTY 进程树（server/lib/term-signals.js）
- fix(win): web 终端中文 IME 输入整体偏移——Windows 字体栈显式承接 CJK（Consolas+雅黑）+ rescaleOverlappingGlyphs + 字体就绪后重 fit

## 1.6.300 (2026-06-06)

- fix(security): 测试隔离守卫体系——findcc.js LOG_DIR/configDir 双铁闸(NODE_TEST_CONTEXT 下强制进程私有临时目录)、im-process-manager 测试态拒绝真实 spawn IM worker、updater 测试态拒绝真实 registry 请求与自更新;单元测试从机制上无法再触碰真实 ~/.claude 数据与外网
- feat: 启动期配置备份——preferences/profile/workspaces 每次启动自动备份到数据目录外的 cc-viewer-config-backups/(滚动保留 10 份)
- fix: 更新检查 30s 定时器补 .unref() 与 stop 时 clearTimeout,消除事件循环滞留与 stop/start 循环泄漏
- test: 新增守卫单测与静态扫描器(子进程 env 隔离纪律、spawnImProcess 注入纪律、全局 fetch 还原纪律,违规即挂整套);24 个测试文件完成路径/端口隔离改造(私有端口窗注册表,不再绑真实 7008-7099);npm test 脚本统一注入 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
- test: 分支覆盖定向补强——新增 50+ 个 branch-*.test.js 与配套守卫,全量 6402 测试 0 失败

## 1.6.299 (2026-06-06)

- test: 整体行覆盖率 72%→96%——新增/补强约 100 个测试文件（server 路由、interceptor、sdk-manager、cli、server WS/PTY、src/utils 全量）；新增 test/_shims ESM loader 让 node:test 直接导入 Vite 风格前端模块；helpers/synthetic-classification 旧内联拷贝测试归真为导入真实模块；sdk-manager 新增 __setQueryForTests 测试注入钩子
- test: 根治并行测试 flake——跨进程端口窗隔离、共享 tmp cache root 私有化、固定 sleep 改条件轮询；修复 ensure-hooks 旧测试 query-busting import 导致的覆盖率记账丢失
- test: 测试脚本加固——test:coverage:html 补 --test-force-exit（修复跑完不退出），三个 test 脚本统一加 --test-timeout=120000 防单用例挂死整轮
- chore: 删除死代码——cli.js runCliModeWorkspaceSelector（无调用点，electron/tab-worker.js 已内联同功能）；contentFilter.js classifyUserContent 的 skillBlocks 分离分支（被 isSystemText 同正则先行过滤，不可达，保留返回键）
- fix(win): 桌面端首屏 SSE 加载从 1000 条降至 400 条 + idle 超时从 2s 延至 5s，消除 Windows 冷启动时 V8 编译与 SSE 数据处理竞争导致的 Chrome tab 崩溃

## 1.6.298 (2026-06-05)

- perf(mobile): 移动端打开历史日志尾部优先加载——服务端新增 `readTailEntries()` 仅读文件末尾 2-8MB，`/api/local-log?limit=300` 跳过全文件扫描直接返回最新条目；客户端立即渲染，旧条目按需分页加载；`/api/entries/page` 支持 `file` 参数用于本地日志分页
- perf(terminal): PTY 输出批次启用 DEC Private Mode 2026 同步渲染——每个 `setImmediate` 批次用 `\x1b[?2026h`/`\x1b[?2026l` 包裹，xterm.js 6.0 延迟绘制直到批次结束，消除中间帧闪烁
- fix(terminal): WebGL longtask 自动降级——PerformanceObserver 监测 GPU 长任务，30 秒内 3 次 >200ms 则自动切 DOM 渲染器，localStorage 记录 7 天后重试；修正 4 处过时 Canvas 渲染器注释
- fix(win): SSE 重连风暴防治——`requestIdleCallback` 延迟 SSE 连接等浏览器初始化完成；桌面端重连改用 `?since=` 增量加载避免全量重载；重连退避从固定 2s 改为指数退避（2s→32s 上限）
- fix(win): 桌面端首屏加载从 1000 条降至 400 条（`?limit=400`），消除 Windows 上 `load_end` 同步处理导致的 Chrome tab 崩溃；旧条目通过分页按需加载

## 1.6.296 (2026-06-05)

- perf(win): 异步写入队列替代 interceptor 热路径的 appendFileSync，消除每次 API 请求 50-300ms 的事件循环阻塞
- perf(win): Atomics.wait 阻塞锁替换为异步文件锁（workspace-registry / ask-store），消除锁重试期间的线程挂起
- perf(win): Windows 启动时自动设置 UV_THREADPOOL_SIZE=16，缓解 NTFS + Defender 下异步 I/O 线程池饱和
- perf(win): 日志监听从 watchFile 500ms 轮询迁移至 fs.watch 事件驱动（Windows 走 ReadDirectoryChangesW），消除 stat 风暴；同目录多文件共享单个 watcher；80ms 防抖；5s 安全网兜底；CCV_FORCE_POLL=1 可回退
- perf(win): 日志读取路径全面异步化——streamReconstructedEntries / mergeLogFiles / listLocalLogs / readLocalLog / getWorkspaces 改为 fs.promises，不再阻塞事件循环
- perf(win): JSONL 日志分割阈值从 300MB 降至 150MB，减轻 NTFS + Defender 下大文件 I/O 压力
- perf(win): index.html 服务改为 mtime 缓存，避免每次请求重读文件
- feat(win): Windows 首次安装默认深色主题 + 仅展示当前会话，减少大文件加载和视觉刺眼
- feat: CCV_SYNC_WRITES=1 环境变量回退开关，可随时切回同步模式排查问题
- feat(im): IM 即时确认——收到消息后第一时间发送状态反馈；飞书/Discord 以可更新卡片呈现（完成后原地更新为回复），钉钉配置卡片模板后支持互动卡片（未配置则文本确认），企微降级为文本确认；超时路径补充回复通知；各平台设置新增「即时确认」开关
- feat(im): 排队消息告知前方等待数量和队列上限（busyQueued / queueFull 含 {ahead}/{max}）
- perf(im): IM worker 的 turn_end 去抖从 10s 降至 200ms——消除队列消息间的无谓等待，回复延迟大幅降低
- fix(im): turn_end 检测双保险——主信号为 Stop hook（200ms 去抖），备用为 idle 轮询（streaming 停止 15s 后主动触发），超时兜底从 10 分钟缩至 2 分钟；防止 Stop hook 漏触发导致队列卡死

## 1.6.294 (2026-06-03)

- fix(terminal): Windows 大流量长程任务页面卡死修复（ConPTY 输出洪泛防护）——前端 xterm 写队列积压超 2MB（移动端 1MB）自动丢最旧数据并提示，防内存膨胀 GC 卡死；服务端按 `ws.bufferedAmount` 对慢客户端停发，恢复后发 `data-resync` 快照一步对齐并触发 TUI 全屏重绘，60s 未恢复判定死连接断开；scratch 终端同源防护
- feat(electron/win): Windows 桌面版自定义标题栏——隐藏原生白色标题栏与菜单栏（快捷键保留），logo、标题、File/Edit/View/Window 菜单与项目 tabs 合并为一行；原生 最小化/最大化/关闭 按钮经 titleBarOverlay 保留（Win11 Snap Layouts、双击最大化不受影响）且配色随皮肤实时切换；菜单为跟随皮肤的 HTML 下拉，文案补 18 语言（macOS 原生菜单同步获得翻译）
- feat(electron): 启动白屏闪烁修复（窗口首帧按主题底色绘制）；窗口位置/大小/最大化状态持久化，显示器拔掉/越界时安全回落默认；内容区右键菜单补齐（剪切/复制/粘贴/全选/复制链接，18 语言）；Windows 任务栏 AppUserModelId 对齐 appId；tab bar 按钮 tooltip 补 18 语言
- fix(electron/win): 主进程防阻塞加固，针对 Windows 整窗永久冻结（渲染存活、hover 有高亮但全程无响应）——diag 日志 `appendFileSync` 改异步队列（256 条上限防错误风暴）；打包版主进程 console 输出静默、worker stdio 改 ignore（消除终端启动 + QuickEdit 点选导致的内核级写阻塞面）；审批级联（badge/flashFrame/广播）100ms 去抖合并
- fix(electron/win): 全部 child_process 调用点统一补 `windowsHide: true`，修复 Windows 桌面版启动多弹一个 Node.js 控制台窗口；新增静态扫描测试防回归
- feat(ui): 版本信息弹窗按安装渠道（electron / brew / npm）精准匹配升级命令——npm 命令补 `--registry` 指定官方源避免镜像滞后，brew 渠道提示 `brew upgrade cc-viewer`（补 18 语言）
- fix(perf): 修复 Web 桌面端长任务中后段「整个页面卡死/偶发崩溃」（Windows 高发、Mac 不复现）——桌面端原先不做虚拟化(`useVirtuoso` 仅移动端)且不裁剪渲染窗口，长会话把整段对话全量渲染成 DOM，单次更新 reconcile/layout 成本随条目数线性增长，主线程被打满（Windows 大 DOM layout 更重、渲染器内存上限更低，先于 Mac 撞上上限）。现桌面端复用移动端的渲染窗口裁剪：默认只渲染最近 400 条 item，更早的经「加载更早」按需展开（搜索/跳转到被裁剪区域时自动展开纳入）
- fix(perf): SSE 单客户端 backpressure 容忍上限 5s→30s——大会话首屏/重连重放时短暂忙碌的渲染器不再被误判 dead 而剔除，避免「断开→EventSource 自动重连→再次重放」风暴把瞬时卡顿放大成持续卡死
- feat(ui): 顶栏「网络报文 / 对话模式」切换按钮文案精简为「网络 / 对话」；对话中居中的 SVG loading 动画设为不可选中（user-select:none + pointer-events:none）
- feat(ui): 偏好设置「对话展示」多项设置追加 (?) 悬浮说明（权限自动审批 / 弹出全局审批 Modal / 审批提示音 / 展开思考过程 / 完整展示所有内容，补 18 语言）
- feat(ui): 代理热切换的「Max 用户请勿使用」告警改为仅当 Default(内置)端点为 api.anthropic.com 时显示
- feat(ui): VoicePack 设置区加浅灰底分组、上传音频按钮字号 12px；移除「恢复默认」按钮
- feat(ui): 偏好设置「对话展示」新增「Plan 自动审批」下拉（关 / 3s / 5s / 10s / 立即，同权限自动审批配置形式）——非关闭时 CLI(PTY) 模式下 Agent 提交的计划倒计时后自动批准并继续，倒计时期间卡片显示「{n}s 后自动批准 · 取消」可转手动，「立即」则无倒计时直接批准；仅作用于 PTY 路径（不含 SDK），随 `approvalModal.planAutoApproveSeconds` 持久化（补 18 语言）；原「自动审批」更名「权限自动审批」以区分
- feat(ui): 汉堡菜单「通讯软件」更名「通讯软件接入」；菜单文字不可选中、「钉住」按钮热区放大并加 hover 背景
- feat(im): 飞书/微信改用真实品牌 logo，配置面板操作区与表单加分隔线，平台 tab 选中态标题色与品牌 icon 同步；发送人白名单「选填」徽标改为 (?) 悬浮说明白名单作用
- feat(im): 「对话记录」按发送者展示真实姓名 + 头像（四平台）——origin marker 带 senderId，bridge 后台解析并持久化 senderId→{name,avatar}（钉钉用回调 senderNick 取真实姓名+默认头像、飞书走通讯录、Discord 事件免费带、企业微信 v1 降级默认），新增 `/api/im/:platform/senders`，对话气泡按发送者覆盖姓名/头像（解析不到则「外部用户」+ 默认头像，补 18 语言）
- fix(im): 钉钉机器人不再调通讯录 `topapi/v2/user/get` 取头像——机器人凭证无通讯录权限，调用必失败且与消息发送共用同一 appKey 触发风控限流，反而阻断模型回复下发；改为只用回调免费带出的 senderNick 显示真实姓名 + 默认头像
- feat(im): IM 桥接设置改为「配置失焦自动保存 + 启动/停止按钮」——取消「保存」按钮与「启用」开关；底部「启动/停止」显式控制 worker，启动后等 worker 真就绪才算成功（补 18 语言）
- feat(im): 连接状态徽标以真实进程状态为准并显示服务端口（已连接 · :70xx / 启动中… / 无响应 / 未连接），状态拉取失败即复位为断连不再残留「已连接」；「对话记录」弹窗标题栏也展示同一连接状态，避免误以为没连上
- feat(im): 「对话记录」里助手（MainAgent）一侧的头像/名字改用所属 IM 平台的 logo + 名称（如钉钉 logo +「钉钉」），仅作用于该弹窗、不影响主会话
- feat(im): 配置面板「更多设置」新增「模型性格定义」——[编辑] 弹独立窗口编辑该 IM 的 CLAUDE.md（叠加在配置弹窗之上、不关闭下层），保存后提示下次重启该 IM 生效；新增 `GET/POST /api/im/:platform/claude-md`（loopback-only、原子写、256KB 上限，补 18 语言）
- feat(im): 配置面板「更多设置」新增「${IM} SKILL 管理」——[+添加]（文件夹/zip/SKILL.md 上传）+ [管理]（启停开关，复用 SkillsManagerModal），作用于该 IM 工作目录下的 `.claude/skills/`；新增 `GET /api/im/:platform/skills`、`POST .../skills/toggle`、`POST .../skills/import`（loopback-only，复用 skills-api 的 listSkills/moveSkill + 从 skillsImport 抽出的可复用 importSkillTo），保存后提示下次重启该 IM 生效（补 18 语言）
- refactor(im): 配置面板精简——「会话拒绝注入」开关说明收进 (?) 悬浮提示；去掉钉钉的风险提示文案（保留飞书/企业微信/Discord 的接入步骤说明）

## 1.6.293 (2026-06-02)

- feat(ui): 汉堡菜单支持「钉住」——hover 菜单行右侧出现钉按钮，点击后钉变实心常驻，并在汉堡右侧生成常驻快捷方式图标，点击即触发对应入口；全局持久（localStorage，跨项目共享），Electron 原生 tab bar 同步显示（`ui.menuPin`/`ui.menuUnpin` 补 18 语言）
- feat(ui): 顶栏主题切换由滑块开关简化为纯图标按钮——点击切换，图标随当前主题在 太阳(亮)/月亮(暗) 间变化，30×30 无边框与国旗/二维码按钮对齐
- feat(ui): IM 对话记录弹窗优化——标题旁新增「配置」入口（打开对应平台配置面板）、刷新按钮紧贴标题且刷新时图标转圈、标题栏去白底；刷新时保留旧内容不再塌缩闪烁、失败有内容时只弹 toast；正文仅纵向滚动消除 hover 横向滚动条（`ui.imRecord.config` 补 18 语言）
- feat(im): IM 接入改为「每平台一个独立常驻 ccv 进程」——工作目录 `~/.claude/cc-viewer/IM_<id>/`、绑 127.0.0.1、以 `--dangerously-skip-permissions` 全自动运行；主 ccv 不再把 IM 消息注入当前会话（消除排队/上下文污染），独立 worker 各跑自己的 PTY
- feat(im): 主 ccv 启动时 reconcile 自动拉起已启用但未在跑的 IM worker（detached 常驻，主 ccv 关闭后仍在线）；配置启用/停用即驱动 worker spawn/stop；新增 `POST /api/im/:platform/process`（start/stop/restart）与 `GET /api/im/:platform/logs`
- feat(im): 全局唯一锁 `IM_<id>/im.lock`（HTTP 身份探测三态活性）防同一机器人多处接入；首次启动若缺 `IM_<id>/CLAUDE.md` 自动生成行为约束预置
- feat(ui): 点击 header IM logo 改为打开「对话记录」弹窗（读 worker 的 `.jsonl`、复用 ChatMessage 渲染、可刷新）；IM 配置入口保留在全局设置菜单；状态徽标改为进程感知（运行中/连接中/已停止/错误，`ui.im.statusRunning`/`ui.im.statusStopped`/`ui.imRecord.*` 补 18 语言）
- feat(security): skip-permissions worker 加固——PreToolUse 在 bypass 放行前硬拦截危险操作（递归 rm / git push / 提权 / 外泄 / 凭证目录读写等）、注入 `permissions.deny`、绑 127.0.0.1 不暴露局域网
- fix(im): 发送者白名单改为非必填——空白名单也可保存并启用（不再 400），保存时前端弹安全警告（运行期退化为 bind-first-conversation，首个会话绑定即可驱动）；save 失败改为透出服务端原因而非通用「保存失败」
- feat(im): IM worker 端口段从 7050 起扫；主交互式 ccv 默认端口上限收到 7049（`CCV_MAX_PORT` 可覆盖），两池不重叠
- feat(electron): iPad/设备预览模式——tab bar 右上角开关把窗口收窄到 500px 预览 pad 布局（main 持有状态、跨 tab 不丢，可手动再拉大），React viewMode 跟随设备模式信号切 pad⇄pc；header 控件（菜单/代理/IM 状态/审批 bell/主题/终端/视图模式/二维码）经序列化 header 模型迁入原生 tab bar 渲染、点击回传执行；tab bar 改版至 50px（`ui.menu`/`ui.deviceMode.toIpad`/`ui.deviceMode.toPc` 补 18 语言）
- feat(im): 多 IM 平台桥接——钉钉专用桥接重构为通用编排核心 `im-bridge-core.js` + 平台适配器 `adapters/` + 配置层 `im-config.js`，钉钉保留薄壳兼容旧接口
- feat(im): 新增飞书/Lark 桥接（长连接事件订阅，支持 feishu.cn / larksuite.com 区域选择）
- feat(im): 新增企业微信桥接（智能机器人长连接，botId + secret）
- feat(im): 新增 Discord 桥接（Gateway 长连接，bot token，支持 DM 与服务器频道）
- feat(im): 通用配置 API `/api/im/:platform/status|config|test`，`/api/preferences` 剥离所有 IM 平台密钥
- feat(ui): 消息设置改为描述符驱动（`imPlatforms.js` 注册表），新增飞书/企业微信/Discord 设置面板、状态徽标与品牌图标；未选中 tab 仅图标置灰、选中态显品牌色边框
- fix(deps): 升级 ws 至 8.21、override axios 1.16.1 / qs 6.15.2，修复飞书 SDK 传递依赖的安全告警
- feat(ui): 用户 Prompt 导航每条前增加时间列（MM-DD HH:MM:SS）
- feat(ui): 用户 Prompt 导航在跨会话处插入「Session」分隔线标定不同会话；「Session」文案抽成 i18n（`ui.session`，18 语言），主聊天区会话分隔线同步改用该 key
- fix(src): 源码裸控制字节改为转义（`ChatView.jsx` 的 NUL/0x01、`TerminalPanel.jsx` 注释里的 ESC、`projectAlias.js` 注释），运行时字节不变，避免文件被 grep/ripgrep/编辑器判定为二进制而搜不到
- chore(ci): 新增 `scripts/check-no-control-bytes.js` 守卫（`pretest` / `pretest:coverage` 钩子），拒绝源码出现裸 C0 控制字节（TAB/LF/CR 除外）；非 git 环境优雅跳过，含单测
- feat(ui): 偏好「对话展示」新增「仅展示当前会话」(默认关)，开启后[对话]仅渲染当前(最末)mainAgent 会话，隐藏更早会话、分隔线与「加载更早」按钮（`ui.onlyCurrentSession`，18 语言）
- fix(ui): 切换「仅展示当前会话」开关即时刷新[对话]与[用户 Prompt 导航]；顺带修复同源的 showFullToolContent / showThinkingSummaries 切换不刷新
- feat(ui):「仅展示当前会话」标签加 (?) 帮助提示，说明切换会话(新开 / `/clear` / `/resume`)时的展示行为（桌面悬浮 / 移动端点按；`ui.onlyCurrentSession.help`，18 语言）
- fix(ui):「仅展示当前会话」下跳转到被隐藏会话的消息时兜底清除 `chatScrollToTs`，避免其卡死导致后续跳转失效
- chore(ci): 控制字节守卫改扫「已跟踪 + 未忽略的未跟踪」文件，新文件 `git add` 前也纳入检查
- refactor(ui): 用户 Prompt 导航纯逻辑抽至 `utils/promptNav.js`；`formatPromptNavTime` 与 `ChatMessage.formatTime` 共用 `formatHms`/`formatMonthDayTime` 原语，去掉「改一处须同步另一处」的手工耦合
- test: 补 `scanFile`、`buildPromptNavItems` 与时间格式化原语单测

## 1.6.288 (2026-06-01)

- refactor(ui): 「显示大小」弃用 CSS zoom——Electron 改用原生 `webFrame.setZoomFactor`(preload 暴露 + 首屏从 localStorage 抢占),纯浏览器不再提供下拉、改在该行显示 (?) 提示用户用浏览器自带快捷键缩放(按 Mac ⌘ / Windows Ctrl 区分);Cmd/Ctrl +/- 键盘缩放仅 Electron 拦截,浏览器交还原生。规避 Chromium 128 标准化 CSS zoom 的坐标空间分裂(终端 cols/rows 不跟随、左右拖拽分隔条错位等),`ui.displayScale.browserHint` 补 18 语言

## 1.6.287 (2026-05-31)

- fix(ui): 「显示大小」CSS zoom 缩放后主框架底部留缝 / 顶部被切——根容器 `.layout` 由 `height:100vh` 改为 `height:100%`,并在 `global.css` 补齐 `html,body,#root{height:100%}` 高度链(百分比高度随 zoom 计算,vh 始终等于未缩放整屏才是留缝根因);顺带 `.loadingOverlay`/`.dragOverlay` 由 `100vw/100vh` 改 `100%`;移动端 `.mobileCLIRoot` 不受影响(不缩放)

## 1.6.286 (2026-05-31)

- fix(chat): SDK 模式「停止」改为真正 halt 在途待发——`interruptTurn` 额外清空服务端 `_messageQueue`(否则停止后 `sendUserMessage` drain 循环立刻续发下一条排队消息,多 client/连发场景可见),客户端 `handleInputStop` 同步清掉 typed-interrupt 武装的 `_pendingFlushQueue`(否则随后的 ask-hook-cancelled ack 会把它发出去);中断关弹窗的 kind→广播类型映射抽出纯函数 `sdkApprovalCloseType`(sdk-adapter.js)+ 全 kind/null 单测;`stopOptimistic` 清理收口为 `_clearStopOptimistic`(4 处去重);sdk-interrupt 在非 SDK 模式收到时打 warn 便于排查 client/server 配置漂移
- perf(chat): 流式吸底平滑追随(`StickyBottomController.startSmoothFollow` 的 step 缓动)新增帧率节流——原本 step 跟 rAF 跑满显示器刷新率(120Hz ProMotion 屏达 ~120fps),每帧读写 scrollTop 触发 forced reflow(trace 实测 get/set scrollTop 为 #1 JS 热点);改为按 `smoothFollowMinFrameMs`(默认 33ms≈30fps,可经 opts 调整、设 0 关闭)门控,未到间隔的帧只重排 rAF 不触碰 layout,与刷新率解耦,流式期 layout/paint 负载降 ~4×;配套单测覆盖门控跳帧与可调间隔
- fix(chat): 停止按钮按模式分流中断——SDK 模式 close 当前 query 但保留会话(下条消息 resume 续接)、drain 挂起审批并广播关闭各端审批弹窗;CLI/PTY 模式先发 focus-in(`\x1b[I`)再发 ESC,修复点 HTML 按钮致 xterm 失焦后 Claude 忽略 ESC;点击后乐观即时切非运行态(按钮/页内指示器/实时打字浮层),由 isStreaming 升/降沿 + 4s 兜底多路清除
- refactor(chat): 移除 send 按钮外圈彗尾流式 spinner(JSX + CSS + `streamingFading` prop)

## 1.6.285 (2026-05-31)

- feat(ui): 偏好设置「主题风格」新增「显示大小」预设选择器(50%-200%),经 CSS zoom 缩放整个界面(含侧边栏/顶栏/弹窗/portal),并支持 Cmd/Ctrl +/- 步进、Cmd/Ctrl 0 复位快捷键;落服务端 preferences(`displayScale`,无需改服务端)+ localStorage 首屏抢占防闪屏;移动端不受影响;桌面端 Electron 移除原生缩放菜单角色避免双重缩放;档位计算抽到纯函数 `src/utils/displayScaleHelper.js` + 配套单测

## 1.6.284 (2026-05-31)

- fix(chat): 同一请求内的多个 thinking 块(交错思考)在[对话]中合并为单个「思考过程」折叠框,各段之间用 `---` 水平线分隔

## 1.6.283 (2026-05-31)

- perf(chat): 缓解移动端(Virtuoso 路径)流式输出卡顿——吸底 `followOutput` 由 `smooth` 改为 `auto`,消除流式期间每帧持续的平滑滚动动画(原本驱动浏览器每帧在超大 DOM 上重算 IntersectionObserver,主线程被打满);并把预渲染窗口 `increaseViewportBy` 顶部由 400 收紧到 200,减少视窗外挂载的重消息
- feat(docs): 工具说明新增 LSP、Workflow 两个工具的概念帮助文档(`concepts/` 全 18 语言),并加入 `ConceptHelp` 的 `KNOWN_DOCS` 白名单——点击工具列表中的 LSP / Workflow chip 即可查看说明
- feat(ultraplan): UltraPlan popover 标题栏(? 帮助图标旁)新增「管理专家」图标,点开管理弹窗统一管理全部专家(内置代码/调研 + 自定义):列表展示标题+描述(自定义只显标题)、每个专家显示/隐藏开关、拖拽排序;tab 条改为数据驱动(不再写死内置按钮),显隐/顺序落服务端 preferences(`ultraplanExpertOrder`/`ultraplanExpertHidden`,无需改服务端),当前选中专家被隐藏/删除时自动回落首个可见;护栏「至少保留一个可见专家」;合成逻辑抽到纯函数 `src/utils/ultraplanExperts.js`(陈旧键自动忽略)+配套单测
- fix(chat): 对话里用户消息中的上传图片支持「裸路径」渲染——终端粘贴流程把 `/tmp/cc-viewer-uploads/xxx.png` 不加引号直接拼进提示词,旧正则只认引号包裹写法,导致这类图片只显示成纯文本路径;识别逻辑抽到纯函数 `src/utils/userImageRefs.js`(兼容 `[Image: …]`、单/双引号路径、裸上传路径,及 macOS `/private/tmp` 变体,仍以图片扩展名结尾为准;单/双引号会被整对吃掉、不残留成文本),配套单测
- feat(usage): 套餐用量 pill 仅订阅(OAuth)下渲染,额度搭车在常规响应头上,自动跟随最新响应更新(改用 state 快照、仅在有新响应时重算且解析值未变不重渲染,规避每帧扫描整条 requests);pill 文字/边框/血条统一取 footer 右侧同款低调灰(--text-disabled),不再按阈值红/黄/绿配色;footer pill 上周窗口仅在用量超过 60% 时才显示(否则只显示 5h,周用量仍可在 hover 详情查看);hover 详情弹窗改无边框 table 三列对齐(列间距 5px)、去掉「正常」状态标签、百分比改血条(数字叠加);移除「超额已拒绝 / 原因」及状态标签整段文案与对应 i18n 键
- feat(usage): 左下角状态栏(footer,国旗/版本旁)新增「套餐用量」pill——Claude 订阅(coding plan / OAuth)下展示 5 小时滚动窗口与周窗口的使用率(如 `5h 19% · 周 52%`),悬浮弹窗给出各窗口使用率/状态/重置倒计时及超额原因;数据取自最近一条带 `anthropic-ratelimit-unified-*` 限流头的响应(拦截器已原样记录,前端 `request.response.headers` 可读),纯前端实现,**未改动 cli.js / interceptor.js / 任何服务端代码,上下文血条区域零改动**;阈值配色 ≥80% 红 / ≥60% 黄;API key / 第三方模型的 token 用量请看左侧仪表盘的 Token 统计(本 pill 专注订阅 plan,API 模式不渲染),OAuth 暂无数据时显示静默占位「—」;新增纯函数 `src/utils/rateLimitParser.js`(`parseRateLimitHeaders` / `extractLatestPlanUsage` / `pickHeadlineWindow`)及单测;ui.usage.* 补齐 18 语言
- fix(proxy): 代理转发改为把 `EnvHttpProxyAgent` 显式作为 `fetch` 的 `dispatcher` 传入——**Node 26 起的回归**:转发用的内置全局 `fetch` 背后是 Node 自带的 undici,Node ≤25 时它与 userland undici 包共享 global dispatcher(故旧代码一直好用),实测 Node 26 起两者不再共享,单调 `setGlobalDispatcher` 失效,转发请求绕过 `http_proxy`/`https_proxy` 直连 `api.anthropic.com`(配了网络代理却不生效);新增 `getProxyDispatcher()` 暴露已构造的 dispatcher 供转发处显式传入(各 Node 版本通用),`setGlobalDispatcher` 仍保留以覆盖直接 `import 'undici'` 的调用路径;补 `getProxyDispatcher` 单测
- fix(proxy): 上游请求强制 `accept-encoding: identity` 取代仅剥 zstd 的旧策略——链路中的网关/代理可能透传上游的压缩 body 却剥掉 `content-encoding` 响应头,undici 看不到该头就不解压,把压缩字节当明文透传给 Claude CLI,触发 "API returned an empty or malformed response (HTTP 200)";让上游直接不压缩即从根上消除这类错配;删除已被取代的死代码 `stripZstdAcceptEncoding`,新增 `forceIdentityAcceptEncoding` 单测
- feat(ultraplan): 新增「预设专家」——仓库根 `ultraAgents/*.json` 随包发布预设(内置代码专家/调研专家 demo);自定义专家编辑器「专家名称」右侧加「载入模版」按钮(高度与名称输入框对齐),弹窗左列表 + 右只读预览,选中「载入」覆盖名称+内容(编辑器已有改动时先弹覆盖确认);新增只读端点 `GET /api/ultra-agents`(仅扫包内置目录、无参数)。`title` / `description` 在 JSON 协议层内联本地化(纯字符串或 `{lang:str}` 对象,前端 `resolveLocalized` 按当前语言解析、区域回退);`content` 为单语言字符串,直接取自 `src/utils/ultraplanTemplates.js` 的 `ULTRAPLAN_VARIANTS`(由单测钉死逐字节一致)

## 1.6.282 (2026-05-29)

- feat(messaging): 通讯软件集成弹窗从左右两栏改为上下布局,IM 工具选择改 Chrome 浏览器头部 tab 风格(选中态顶圆角、底边 2px 同色融进下方内容面板盖住接缝、去掉面板顶边横线消除露线);modal body 取 --bg-elevated 与面板 --bg-container 拉出层次,暗色主题给面板内 antd 输入框补 --bg-elevated 底色避免与面板同色消失;移除"选择要连接的 IM 工具"副标题
- feat(context): opus-4 家族(opus-4-7/4-8/4-9/4.x,连字符·点·空格分隔)与 mythons 统一判定 1M 上下文,前端(_classifyContextSize / getModelMaxTokens)与服务端(getContextSizeForModel / readModelContextSize)同步;裸 claude-3-opus 仍按 200K
- feat(context): 上下文血条自适应纠偏——模型被判 200K 但真实输入用量(input+cache,不含 output)已越过 200K 整窗时自动升为 1M(200K 模型物理上容不下 >200K 输入,必是名称误判),修血条卡死 100% 的错显;贯通前端 adaptContextWindow(AppHeader / Mobile)与服务端 buildContextWindowEvent 及 events.js 无 MainAgent 兜底路径同规则
- feat(auth): 默认登录密码规则简化为前 2 位大写字母 + 后 4 位数字(共 6 位,如 AB1234),保留按字符池分别做无偏 crypto 拒绝采样
- feat(dingtalk): 钉钉设置把"发送人白名单(staffId)"与"免审批会话拒绝注入"折叠进"更多设置"(原"查看详情"改名),首屏只留启用开关与 AppKey/AppSecret,降低信息负担
- feat(chat): 对话中工具标签弱化——去边框、底色取 --bg-code、文字用极淡 --text-disabled-faint,hover 提亮文字并加深底色(新增主题变量 --bg-code-hover,明暗各一档)

## 1.6.281 (2026-05-29)

- feat(terminal): 刷新按钮改用 xterm 官方 escape hatch 取代 DOM 高度抖动 hack——L1=clearTextureAtlas+refresh / L2=+fit / L3=dispose+reload WebglAddon(onContextLoss 同款配方,保 cols/rows/scrollback,不动 DOM 高度);60s 后台自动从 L3 降到 L2 避免长期 GPU context churn,L3 留给用户手动判定画面坏掉时的兜底;fit 调用统一走 _fitPreservingScroll(wasAtBottom 贴底 / 否则比例换算),修旧版本中刷新后 viewport 跳到顶或错位 ≈shrink 像素的 bug
- feat(ultraplan): 自定义专家 tab 编辑铅笔图标修复选中态遮挡 + 容器裁切——铅笔 z-index: 2 / top: 0,选中态(.roleBtnActive z-index: 1)不再覆盖,横向 tabs 行的 overflow: hidden 不再裁顶部
- feat(ultraplan): 内嵌 textarea 卡片的文件列表限高滚动(modal 80px / popover 60px)+ flex-shrink: 0,粘贴大量文件时 fileList 不再把 textarea 挤压到 0,超出限高内部出现滚动条
- feat(ultraplan): popover 默认初始尺寸由 420×520 调整为 560×480 (宽扁,匹配单次发问的常见交互)

## 1.6.280 (2026-05-28)

- feat(ultraplan): 自定义专家弹窗左栏(参考文档)加可折叠开关(14px 竖条 chevron,借鉴 Terminal 切换按钮),折叠/展开走 CSS 过渡(flex-basis + opacity + padding/border,250ms ease)而非硬切换;.split 固定 65vh 高度避免 Modal 在两种状态间跳动,折叠态 textarea 自动撑满多出的纵向空间;状态用 localStorage 跨弹窗记住
- feat(ultraplan): 自定义专家弹窗新建态主按钮文案改为「新建自定义专家」(对应 18 语言,ja/ko 沿用项目既定术语 カスタムエキスパート/커스텀 전문가),编辑态保留「保存」,语义更明确
- feat(ultraplan): 打开自定义专家编辑器时不再关闭背后的 UltraPlan 面板——`openCustomUltraplanEditor` 去掉收起逻辑、Popover `onOpenChange` 守卫把 `customUltraplanEditOpen` 加入忽略列表(防止编辑器 mask 点击被识别为 Popover 外部点击,机制是 rc-trigger 的 capture-mousedown 早于 rc-dialog 的 bubble-click)
- feat(terminal): 「刷新」按钮抖动量改为连击逐级加强——3 秒内连点 L1(25%/8-32px)→L2(50%/32-80px)→L3(75%/64-160px),空闲超时回 L1;轻症一击即愈,白屏/严重偏移可连点至 L3 跨多行强制 xterm 状态机翻新;并新增 60s 后台定时主动触发 L3 抖动(tab 隐藏跳过、mobile 非 iPad 不启用),预防长时间运行后渲染漂移堆积;在途 rAF 期间再次触发会被早返回守住,避免叠加 baseH 复读
- chore(chat): suggestion chip 设固定 height 35px(content-box,内部 padding+border 后总高 ~51px)

## 1.6.279 (2026-05-27)

- feat(ultraplan): 自定义专家弹窗改双栏——左栏常驻使用文档(代码块右上角一键复制),右栏编辑表单,去掉标题旁 ? 帮助入口;弹窗加宽至 ~1100;复制按钮在非安全上下文(局域网明文 HTTP)兜底不抛错、mermaid 代码块不挂复制按钮、弹窗开着时切语言重拉对应语种文档
- feat(ultraplan): 自定义专家新建时预填 `<system-reminder>` + `[SCOPED INSTRUCTION]` 外壳骨架供壳内补充正文(发送时 buildCustomTemplate 幂等、不重复包壳,样板文案统一为含工具提示的版本);使用文档「写作建议」删去「保留外壳」一条
- docs(ultraplan): 自定义专家使用文档的「改好的例子」也包上 `<system-reminder>` 外壳(复用 buildCustomTemplate,与右侧预填壳逐字节一致),避免读者对右侧预填文本产生误解;并把正文(输入框说明/逐段解释)从「cc-viewer 自动包壳、勿自己写」改述为「外壳已预填、在壳内编写」的新模型(18 语言同步)
- fix(ci): Homebrew tap 发版后自动 bump——`bump-homebrew.yml` 改为 reusable workflow(`workflow_call`),由 `release.yml` 发版后链式调用(按最小权限只显式传 `HOMEBREW_TAP_TOKEN`,不用 `secrets: inherit`),绕开「GITHUB_TOKEN 创建的 release 不触发下游 workflow」导致的漏 bump;移除 `release:` 触发避免双跑,手动 `workflow_dispatch` 入口版本号改为必填

## 1.6.278 (2026-05-27)

- feat(security): 本机(127.0.0.1=admin)打开代理热切换 / 钉钉设置时可查阅明文 API Key 与 AppSecret(编辑表单 👁 显示、可复制),已授权的远程客户端仍只拿脱敏值(代理 apiKey 仅 `****`+后4位、钉钉仅 `hasSecret`);门禁在 `GET /api/proxy-profiles` 与 `GET /api/dingtalk/status` 按 `isLocal` 切换,镜像 `/api/auth/state` 的密码明文策略;`defaultConfig.apiKey`(列表常显文本)始终脱敏
- feat(dingtalk): 对话中来自钉钉的消息在用户名左侧显示钉钉图标(Tooltip「来自钉钉」)——桥接注入时给消息加前置标记 `⟦im:dingtalk⟧`(斜杠命令跳过,避免破坏 CLI 命令识别),前端 `parseImOrigin` 剥离标记并据此渲染图标,会话预览/去重处一并剥离;新增 `src/utils/imOrigin.js` + `test/im-origin.test.js`,扩展 `test/dingtalk-bridge.test.js`
- feat(dingtalk): 钉钉设置面板精简——去掉顶部说明文案;AppKey/AppSecret 标记必填(`*`)、staffId 白名单标记「选填」;安全须知默认折叠到「查看详情」;连接状态指示由小圆点改为图标着色(已连接=蓝、否则=灰),并移至顶栏最左(紧邻汉堡菜单),去掉外层圆角描边只留图标
- chore(ui): 对话中 markdown ≤200 字符时隐藏 hover 的「另存为」操作栏(短内容无下载价值,可直接选中复制)
- fix(update): 版本信息弹窗的更新命令由 `npm update -g cc-viewer` 改为 `npm install -g cc-viewer`(update 跨大版本升级全局包常失败)

## 1.6.277 (2026-05-26)

- feat(dingtalk): 汉堡菜单新增「通讯软件」入口(可扩展多 IM,当前仅钉钉),钉钉 Stream 模式双向桥接当前 Claude Code 会话——仅填 AppKey/AppSecret(无需公网):钉钉消息以括号粘贴注入会话,整轮 `turn_end` 后读会话 transcript JSONL 回干净 markdown(主动发送 API、按 ~3800 字分块 + 令牌桶限流、token 缓存);`/stop`/`停止` 发 ESC 中断当前回合;收到即 ack + msgId LRU 去重防重投重复执行;忙时排队、无 Claude 会话(或裸 shell)拒绝注入且不自动 spawn;访问控制为可选 staffId 白名单(留空=绑定首个会话);skip-permissions 会话注入时回风险提示并写审计日志;桥接随 server 启停、保存配置即热重载。`server/pty-manager.js` 加进程类型标记(claude/shell)+ skip-permissions 标记;Stop hook 透传 `transcript_path`;凭据存 `preferences.json` `dingtalk` 键(base64、0600),写操作 loopback-only、appSecret 脱敏且从 `/api/preferences` 剥离;新增 `server/lib/dingtalk-config.js` / `dingtalk-bridge.js` / `server/routes/dingtalk.js` / 前端 `MessagingModal`+`DingTalkSettings`,依赖 `dingtalk-stream`,新增 `test/dingtalk-config.test.js` / `dingtalk-bridge.test.js` / `api-dingtalk.test.js`
- fix(dingtalk): 多角色 review 修复一批桥接问题——注入失败(PTY 退出/中途死亡)现回失败提示并立即解除队列,不再悬空到 10 分钟超时;`GET /api/dingtalk/status` 对非本机调用只回 `{enabled,hasSecret,connection.running}`,剥离 appKey/白名单/绑定会话/原始错误;回复去重改为按 turn 时间戳(不再误吞重复短确认语如「完成。」);入站消毒补剥 CR(`\r`);入站队列封顶 50,溢出回提示;新增「免审批会话拒绝注入」可选开关(`blockOnSkipPermissions`,默认关);`MessagingModal` 加 `destroyOnClose` 修关闭后仍轮询的泄漏;补限流/分块截断/群会话/token 缓存等护栏测试
- fix(dingtalk): 桥接系统提示(忙时排队/已中断/未授权/无会话等)改为跟随用户在 UI 配置的语言——服务端 i18n `currentLang` 此前恒为默认 `zh` 且从不同步,提示固定中文;现 server 启动读 `preferences.lang` 调 `setLang`、保存偏好(`/api/preferences`)时同步切换(登录页回落语言一并跟随),桥接 `t()` 自动生效无需改动;`test/dingtalk-bridge.test.js` 加语言路由用例
- fix(proxy): 代理热切换设了模型覆盖(`activeModel`)的 profile(如 aliyun/deepseek/theta)请求卡住/超时——proxy 转发时剥离客户端 `content-length` 头:interceptor 的模型替换会改写 body 长度,旧 `content-length` 透传给上游触发 undici `UND_ERR_REQ_CONTENT_LENGTH_MISMATCH` → 502 → CLI 静默重试退避;新增纯函数 `stripContentLengthHeader` + `test/proxy.test.js` 用例
- fix(update): 「new」版本徽标跨刷新持久化——server 把启动检查发现的「有新版」结果(major_available/deferred_busy/brew_managed)缓存到内存(`pendingMajorUpdate`,经 `deps` getter 暴露),`events` 路由在新 SSE 连接(刷新/新标签页)上补推 `update_major_available`;原先徽标仅靠启动后 30s 那一次广播,刷新即丢、须重启才再现。内存级,进程重启归零;新增纯函数 `sseUpdateBadgeFrame` + `test/sse-update-badge-frame.test.js`
- feat(terminal): 主终端右下角新增悬浮「刷新」按钮——抖动 `.terminalHost` 高度(收缩-恢复,幅度足以改变行数)驱动 xterm 本地重建 canvas + 清 WebGL 纹理图集 + 全量 refresh,修复 web 终端偶发花屏/白屏;中间尺寸不发 PTY、仅末尾按原尺寸 resize 一次,滚动位置保留;常驻半透明、hover 提亮,仅桌面/iPad 显示
- fix(test): `npm test`/`test:coverage` 加 `--test-force-exit`——多个起真实监听服务(端口 7010+)/ fs-watcher 的用例测完不释放句柄,进程隔离下 worker 不退出致 runner 永久挂起;改为测完即退(全量 ~8s、2413 pass);`engines.node` 提到 `>=20.14.0`(该 flag 起始版本)
- fix(ui): 从血条 Popover 内打开 CLAUDE.md / 记忆条目 / Skill 管理明细 Modal 时,背后的血条面板不再消失——Popover 改为受控(`open={cachePopoverOpen}`),`handleCachePopoverOpenChange` 在明细 Modal 打开期间忽略 hover 离开触发的关闭(原 hover Popover 因鼠标移到 Modal 上 mouseleave 即关);并去掉 `handleOpenSkillsModal` 里打开 Skill 管理时强制 `_cachePopoverOpen:false` 的关闭
- chore(ui): CLAUDE.md / 持久记忆条目明细 Modal(MemoryDetailModal)的 markdown 套上描边卡片容器(`.detailMarkdownCard`:1px 边框 + 6px 圆角 + 8/10 内边距 + 容器背景),与上下文弹窗「官方工具」等区块的 `cacheSectionBordered` 视觉保持一致
- chore(ui): 上下文(血条)弹窗「内置工具」改名为「官方工具」,并由可折叠分组(默认收起)改成与下方 MCP/Skill/CLAUDE.md 一致的 `cacheSectionBordered` 常驻展开样式;移除随之失效的 `renderGroup`/`sectionCollapsed` 及 `.cacheSectionTitle`/`.cacheSectionArrow` 死代码
- chore(auth): 二维码下方密码管理区重做为「项目中心」模型——整块代表当前项目防护:顶部开关=本项目是否受保护(关=写入禁用的项目覆盖,既不用自有也不用全局即豁免),开启时才显示「本项目/全局」tab 选择密码来源(本项目自有 / 继承全局);删除原「共用全局密码」开关(tab 已表达继承 vs 独立);切到「全局」而全局尚未启用时自动启用全局共享密码再清本项目覆盖(`postAuthConfig` 加 `thenClearOverride` 两步合一只弹一次提示);无项目上下文退化为单一全局维度
- chore(approval): 自动审批下拉删除 15/20/30/60 选项(保留 3/5/10)并新增「免审批」—— 经 `PermissionController.autoAllow` 在请求到达处直接放行:hook 路径(`perm-hook-pending`)回 allow、pty 子代理路径直接选「允许」项,均不设 pendingPermission,从源头绕过 ToolApprovalPanel(消除面板挂载再自动批准的一帧 + 退场动画闪烁);ToolApprovalPanel 保留 `<0` 立即批准分支兜底「已挂起时切到免审批」边界;免审批哨兵值收敛为命名常量 `AUTO_APPROVE_INSTANT`;pty 路径加 prompt 签名 + 时窗去重,防 PTY 慢回显/重绘期同一 prompt 二次放行;hook 路径 ws 未连通时 autoAllow 返回 false 回落面板路径,不静默丢成 timeout-deny;去掉按模型族区分默认倒计时的逻辑,默认统一 3s

## 1.6.276 (2026-05-25)

- feat(auth): 新增密码登录认证(与 URL token 并存) —— 远程未授权访问弹极简密码页,输对后服务端 `Set-Cookie: ccv_auth`(SameSite=Strict)并自动刷新进入;本机(127.0.0.1)永远免密且为 admin,在二维码 popover 下方可开启/改密/复制/关闭(空密码=无防护并警告),启用后二维码与 URL 自动去掉 ?token=(远程改走密码页登录);登录页密码框带显隐(眼睛)切换;CLI `--usePassword[=<pwd>]` 启动即开启(裸 flag 随机 6 位大写字母+数字,大写展示、登录忽略大小写,写入「本项目」作用域而非全局,并在启动输出中打印当前密码),开关与密码持久化为 `preferences.json`:全局 `auth` 键 + 可选 `authByProject[<projectDir>]` 项目级覆盖(项目级优先、否则回退全局;admin 可在二维码下方按「本项目/全局」切换管理、一键移除覆盖回退全局);密码 base64 轻混淆、非裸明文,文件 0600;`/api/preferences` 读写均剥离 `auth`/`authByProject` 键防密码泄漏与跨项目越权篡改;`--usePassword` 消费后即清除 env 避免泄漏进 Claude 子进程;鉴权统一收敛为纯函数 `decideAuth()`,HTTP 与 WS upgrade 共用(顺带补上 WS 此前缺失的鉴权);`/api/auth/login` 按源 IP 内存限流(60s/20 次→429);新增 `server/lib/auth.js` + `server/routes/auth.js` + `test/auth-lib.test.js` / `test/api-auth.test.js` / `test/usepassword-startup.test.js`
- chore(css): 文件查看器 Markdown 预览内边距收窄(24/36→10/20);MdxEditor 工具栏/代码块/表格控件整体瘦身(图标统一 12–14px、语言/类型选择框收窄、删除按钮 inline-flex 居中、hover 透明度 0.5→0.22)

## 1.6.275 (2026-05-25)

- refactor(server): `server/server.js`(5467 → 1791 行)的 `handleRequest` 巨型 if-chain(84 路由)按功能域拆到 `server/routes/*` 14 个模块(project-meta / misc / preferences / git / plugins / logs / voice-pack / skills / files-fs / files-content / workspaces / events / ask-perm / team)+ 无依赖的 `_dispatch.js` 有序首匹配 dispatcher(保留方法区分与 prefix/exact 顺序语义,`/api/file-raw` 与 `/api/ask-hook/:id/result` 用 predicate);路由经单例 `deps`(getter 暴露可变运行时状态、直引共享 Map、helper/常量)注入,prelude / 静态服务 / WebSocket / lifecycle / 全部 export 仍留 `server.js`,纯搬移零行为变更;`stopViewer` 的 `clients` 改原地清空(`clients.length = 0`)保持引用稳定,消除 stop/start 循环的悬垂引用;清理 `server.js` 迁移后失效的死 import 与 `deps` 冗余键;新增 `test/route-dispatch.test.js` 守方法区分 + predicate 路由不变量

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

