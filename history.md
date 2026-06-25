# Changelog

## 1.6.326 (2026-06-25)

- feat(im/feishu,wecom): 飞书 / 企业微信回复新增「AI 卡片逐字流式」对标钉钉，新增通用开关 `aiCard`（默认关，opt-in）。飞书走 CardKit v1：建卡（`streaming_mode`）→ 引用 `card_id` 发 interactive 消息 → `cardElement.content` 逐字覆写正文（飞书自动 diff 出打字机）→ `card.settings` 关流+更新预览摘要，结束以 transcript 权威全文落定；缺 `cardkit:card:write` scope 或建卡失败自动回退到 1.0 占位卡片。企业微信走智能机器人长连接 stream 被动回复：入站帧 `req_id` 透传（挂进 `normalizeInbound` 的 target）→ `replyStream` 即时 ack 开流 / 逐帧 / `finish=true` 收尾，`replyStreamNonBlocking` 跳帧防积压，无 frame 回退 proactive 文本。核心流式总开关由钉钉专属 `aiCardTemplateId` 泛化为可选 `adapter.streamEnabled(cfg)`（适配器未定义则回落 `!!aiCardTemplateId`，钉钉零回归）；起流式前额外校验适配器具备 `updateAckCard`（杜绝能逐字推却无法 finalize）、飞书关流失败落诊断；`ui.im.aiCard`(+Help) 18 语言
- test(im/feishu,wecom): 新增飞书 CardKit（`streamEnabled` / 建卡+引用发送 / 缺 cardkit 能力回退 1.0 / 建卡 code 非0+throw 回退 / `cardElement.content` sequence 单调递增+uuid / finalize 覆写全文+关流+summary）与企业微信（`streamEnabled` / `sendAckCard` 开流+整帧透传 / 无 frame 回退 / `replyStreamNonBlocking` skipped 不丢内容 / `finish=true` 收尾）适配器分支单测，及 feishu/wecom 桥接端到端流式（ack 开流→finalize 收尾 streamId 全程一致、`aiCard` 关不开流回退）；feishu/wecom config 默认补 `aiCard:false`

## 1.6.325 (2026-06-24)

- feat(im/dingtalk): 钉钉回复新增「AI 卡片逐字流式 + flowStatus 状态标签」——填 `aiCardTemplateId`（AI 卡片场景模板，需声明流式变量 + flowStatus 变量）后，回复在对话过程中经 `/v1.0/card/streaming` 逐字吐字，并用 flowStatus 状态标签（处理中→执行完成/执行失败）替代「[收到]」文本，结束以 transcript 权威全文落定；未配置或流式失败时回退到普通卡片(`cardTemplateId`)单次更新或纯文本。逐字文本源复用 interceptor 主 agent SSE（仅 worker、跳过 thinking/teammate）；新增 `aiCardStreamKey` 配置（流式变量名，默认 `content`，模板用别名时填）；推送轮询 300ms；`stream-armed/stream-handle/stream-push` 审计便于诊断；help 注明「建卡失败静默回退普通卡片/纯文本」与「短/秒回回复无打字机（结果仍正确）」；`ui.dingtalk.aiCardTemplateId`/`aiCardStreamKey`(+Help) 18 语言
- test(im/dingtalk): 新增 AI 卡片 createAndDeliver/kick 帧/流式帧 7 字段(含 isError)/finalize+flowStatus/降级回退/可配置 streamKey、核心 streamTimer（阈值推送·跨 isStreaming 抖动·finalize 权威全文·/stop 停推·帧上限·finalize 截断·单 in-flight 守卫）、interceptor 逐字累加器（只收 text_delta）单测

## 1.6.324 (2026-06-23)

- feat(ui): 「日志管理」列表移除「对话轮次」列、下载按钮改纯图标(保留 hover 提示)；移除随之失效的 `ui.logTurns` i18n key
- feat(multi-instance): 「日志管理/历史」列表按 `--pid` 实例硬隔离——带 `--pid` 的实例只列自己 `<pid>__` 的日志、默认实例只列无标签日志；每行显示实例(pid)标签（桌面端列，无 pid 留空）；顶部「显示全部实例」开关可临时越过过滤看全部实例日志（开关状态持久，SSE 触发的 refetch 也跟随）；顺带修排序 bug：列表展示序与归档「最新不允许」判定改按时间戳（此前按文件名整串排序，`<pid>__` 前缀因 `'1'<'c'` 把最新日志排到列表最底/把活跃日志误判成非最新）；`ui.showAllInstanceLogs`/`ui.logInstanceId` 18 语言
- test(log-management): 新增 `listLocalLogs` 实例隔离 / pid 解析 / 时间戳排序、`archiveLogFiles`「最新」按时间戳、`ui.showAllInstanceLogs`+`ui.logInstanceId` 18 语言守卫单测;`npm test` 脚本清空继承的 `CCV_INSTANCE_ID`,使套件在 `ccv --pid` 会话内运行也确定性通过
- fix(multi-instance): `--pid` 实例日志按文件名前缀 `<pid>__<project>_<ts>.jsonl` 隔离——每个实例只读/续自己的日志血脉，多进程下 [对话] 与「血条」不再串台（根因：findRecentLog 此前在共享项目目录按项目名取「最近一个日志」、实例盲）；无 `--pid` 行为不变、实例日志仍计入项目级统计；新 `--pid` 首启可 best-effort 接管最近的无标签日志（mtime 守卫 + 无标签 temp 守卫 + 原子 rename，不双计）；并按实例收窄 cleanupTempFiles，避免不同 `--pid` 实例间 rename 掉对方活动 `_temp`

## 1.6.323 (2026-06-23)

- feat(chat): 「仅展示当前会话」开启后锁定到当前会话并只展示它——会话 id 改存服务端（按项目，可用 `ccv --pid <名>` 按实例隔离），同一实例多端（电脑+手机）经 SSE `session_pin` 实时一致；多开同一项目时不再被其他窗口/页面重载的会话切换打架；本窗口 /clear、/resume 仍跟随，刷新后保留，锁定会话失效则回退最新；pin 会话防移动端冷淘汰，streaming 浮层/自动滚动在锁定更早会话时抑制；旧浏览器本地 `ccv_pinnedSession_*` 自动清理；`ui.onlyCurrentSession.help` 文案 18 语言同步
- feat(cli): 新增 `ccv --pid <名>`（或 `--pid=<名>`）锁定实例 id（消毒为安全文件名、ccv 自身消费不透传给 claude，可与 `-c`/`--d` 共用）；启动横幅打印本次 PID + 该项目历史 PID 列表（`.instances.json`，去重/上限 50），网页标题与头部显示「项目(id)」；`cli.instanceId`/`cli.instanceHistory`/`cli.pidInvalid` 18 语言
- test(session-manager): 新增 `getSessionStableId` / `resolveDisplaySessions` 单测（未开 / pin==最新 / pin 中段切片+上界 / pin 失效回退 / 冷 session 命中）
- test(session-pin/instance-registry): 新增 `session-pin-store`（往返/null 清除/实例隔离/无项目短路/原子写）、`/api/session-pin` 路由（GET-POST 往返+广播）与 `instance-registry`（去重 move-to-end/上限/消毒/并发锁）单测
- feat(preferences): 新增「项目独立配置」——多人共用一台 server 时按项目隔离偏好。非本机(LAN)打开时偏好抽屉/移动端设置底部出现「启动项目独立配置」开关，开启后把当前全部偏好 fork 一份到当前项目名下（键为项目完整目录），此后该项目客户端的修改只作用于此 fork、不影响全局；关闭则删除该 fork。本机(127.0.0.1)打开时，若存在其他项目的独立配置则显示「配置管理」入口，弹窗内复用偏好控件逐项查看/编辑/删除各项目 fork；无独立配置时入口隐藏。fork 永不含 auth/IM 凭据与机器级路径（logDir 等）；管理接口本机鉴权
- feat(preferences): `prefsByProject` 存于 `preferences.json`，全局写 / fork 写 / auth 写统一走 `prefs-store` 锁 + 原子写（tmp→rename + 0600），避免并发写覆盖含密码的偏好文件
- test(project-prefs): 新增 `project-prefs` 单测（fork 快照剥离敏感/机器/元字段、toggle 增删、非本机 GET 解析 fork、本机回全局 + `_projectPrefsKeys`、update/delete 本机鉴权、POST `/api/preferences` 剥 `_` 元字段）；偏好新增 11 个 i18n key×18 语言并入快捷设置守卫单测

## 1.6.322 (2026-06-23)

- feat(ultraplan): 调研专家模板首段去掉 `TeamCreate`、新增「执行前须确保已加载 `EnterPlanMode`/`ExitPlanMode`/`TaskCreate`/`TaskGet`/`TaskList` 工具」一句；源模板、`ultraAgents/research-expert.json` demo 与 18 语言 `concepts/*/UltraPlan.md` 同步
- test(ultraplan): UltraPlan 一致性守卫单测扩展到调研专家块（18 语言须与源模板逐字节一致）
- feat(stats): 「工具使用统计」标题右侧加 (?) 弹出「所有工具」目录——按功能分类列出全部 37 个内置工具，点击某工具叠加二级弹窗展示该工具说明页（复用 `ConceptHelp` + `/api/concept` + `Tool-*.md`，目录弹窗保持在底层、无闪烁）；打开目录时收起承载它的 token 统计 hover 弹层（`ChatView` 该弹层改受控，经 `App`/`AppHeader.renderTokenStats` 透传 `closeParent`）；血条 Popover 的「官方工具」标题也可点击打开同一目录（不改文案颜色；`ToolsHelp` 支持 children 触发 + `onOpenChange`，经 `LiveTagPopover`/`CachePopoverContent` 接入 `_isCacheDetailModalOpen` 守卫使血条面板不收起）；新增工具目录单一来源 `src/utils/toolCatalog.js`，`ConceptHelp` 白名单 `Tool-*` 由其派生；桌面 `AppHeader` 与移动 `MobileStats` 同步；新增 12 个 i18n key×18 语言
- test(stats): 新增守卫单测——目录工具须在 18 语言均有 `Tool-*.md`、无重复、doc 名合法，且新增 i18n key 18 语言齐全
- feat(ultraplan): 「执行前加载工具」一句补全任务/消息类工具——代码专家加 `SendMessage`/`TaskUpdate`/`TaskStop`/`TaskOutput`，调研专家加 `TaskUpdate`/`TaskStop`/`TaskOutput`；源模板、`ultraAgents/{code,research}-expert.json` demo 与 18 语言 `concepts/*/UltraPlan.md` 同步

## 1.6.321 (2026-06-23)

- fix(electron): 手机扫码编程弹窗——二维码弹层定位改用 tab bar 点击实测坐标 + 显示缩放换算（修复偏右错位），并支持点击页面空白处 / Esc 关闭（此前只能再次点图标开关）
- feat(ultraplan): 代码专家模板首段新增「执行前须确保已加载 `EnterPlanMode`/`ExitPlanMode`/`TaskCreate`/`TaskGet`/`TaskList` 工具」一句；源模板、`ultraAgents/code-expert.json` demo 与 18 语言 `concepts/*/UltraPlan.md` 同步
- test(ultraplan): 新增守卫单测——18 语言 `UltraPlan.md` 内嵌代码专家块须与源模板逐字节一致

## 1.6.320 (2026-06-22)

- feat(im): 新增 IM 内置默认技能 `manage-ccv-projects`——列出启动过的 ccv 项目、按需在局域网启动指定项目并回单行可访问地址、纯打招呼时主动自我介绍；worker 启动时受管同步注入到 `IM_<id>/.claude/skills/`（按包内最新覆盖内容、尊重停用态不挪回、删除后重建），配套语言无关脚本 `ccv-projects.mjs`（清理继承的 CCV_* 后台起 ccv、loopback 免鉴权探测、是否带 token 自适应、纯 Node 跨平台）；18 语言 SKILL.md
- feat(im): IM 人格预置 CLAUDE.md 改为按 `preferences.lang` 选语言（`server/imPreset/<lang>.md`，`{platform}`/`{id}` 运行时替换、目录缺失回退 zh，`openSync wx` 原子创建从不覆盖用户编辑），由中英双语改为单语言；18 语言
- feat(im): 「模型性格定义」编辑器新增「恢复默认」按钮（GET `claude-md?default=1` 拉取当前语言预置载入编辑框、二次确认后保存；新增 4 个 i18n 键 ×18 语言）
- test(im): 新增 `im-skills` / `im-lang` / `ccv-projects` 单测，及 imSkills/imPreset 多语言完整性守卫（遍历 18 语言验证注入与渲染、占位符替换、关键约束）

## 1.6.319 (2026-06-20)

- fix(terminal): Win/Linux 终端支持 Ctrl+C 复制 / Ctrl+V 粘贴（此前 xterm 把二者当控制字符并 preventDefault，只能用 Ctrl+Shift+V / Shift+Insert）——Ctrl+C 有选区时复制、复制成功才清选区，无选区仍发 SIGINT；Ctrl+V 主动读剪贴板走 bracketed-paste 包裹 + 注入消毒（保留图片粘贴、非安全上下文回退原生 paste），主终端与 scratch 终端同步，Mac 走 Cmd 不变
- fix(terminal): Ctrl+V 主动粘贴加 in-flight 闸防与原生 paste 叠加；剪贴板仅 text/html 时显式回退 readText；clipboard.read() 失败补诊断日志
- test(terminal): 新增 terminalClipboard 单测（键位判定 / 粘贴包裹决策 / 复制回退 + execCommand 边界）

## 1.6.318 (2026-06-18)

- fix(network): MainAgent 识别新增 `cc_is_subagent=true` 子代理排除（cc_version 2.1.181+，`\b` 锚定防 `=truex` 误匹配）——这类子代理继承完整 "You are Claude Code" prompt + Edit/Bash/Agent 工具会误中轻量判据；三处分类器同步排除（前端 `isMainAgent`、服务端 `isMainAgentRequest`、KV-cache `isMainAgentEntry`），均早于 `req.mainAgent` 短路以纠正已落盘旧日志；真·主代理无此字段（从不为 `=false`）不受影响
- fix(chat): 修复「系统标签起首 + 真实正文」的字符串型 user prompt 被整条隐藏（如 scoped-instruction 把 `<system-reminder>` 内联拼到用户提问前）——新增 `extractDisplayText`（镜像 `classifyUserContent` 二次回收），ChatView/AppHeader/Mobile/DetailPanel/teamModalBuilder/ImConversationModal 各字符串展示口改用它剥离 chrome 后显示真实正文；纯 chrome/合成/未知标签仍隐藏，用户中段引用的标签原样保留
- feat(chat): 跨会话 / teammate 协议通知（idle / shutdown_* / teammate_terminated / plan_approval_*）的裸协议 JSON 与新版 caveat 形态统一归为状态气泡，不再当普通用户 prompt 显示；服务端 stats-worker 同步过滤避免泄漏进 project-stats 预览（brace 配对剔除，支持嵌套 JSON）；plan_approval_* 补 teammate i18n 文案

## 1.6.317 (2026-06-18)

- feat(skills): Skill 管理弹窗支持永久删除单个 skill（二次确认 + 删除中转圈防重入；loopback-only 不暴露局域网，symlink 拒删 + realpath 越界防护）
- feat(skills): 同名 skill 同时存在于启用与禁用目录时标 ⚠ 重复徽标、开关报 DUPLICATE、import 阻止再写入，删除可化解；列表默认排序（项目级优先于用户级，同源按名）
- refactor(skills): 开关/删除逻辑抽到共享 skillModalController（AppHeader / Mobile 共用，消除镜像漂移）；ImSkillsModal 删/切后静默重拉清除残留 ⚠ 徽标
- test(skills): 补 deleteSkill / 重复态 / 删除路由 / skillModalController 单元测试
- docs(concept): 新增 ToolSearch 工具说明文档（18 语言）并接入帮助索引
- chore(ultraplan): UltraReview 预置文案补 TeamCreate / TeamDelete 不可用时回退说明（改用 Agent 起 teammate / 逐个通知退出，18 语言 + 模板源同步）

## 1.6.316 (2026-06-18)

- feat(terminal): UltraPlan 工具栏按钮 hover / 打开态文字呈现彩虹流光 + 加粗
- feat(ultraplan): 输入框聚焦时 footer 显示浅色「可粘贴剪贴板图片」提示（仅 iPad/PC）
- chore(i18n): UltraReview 预置文案适配——无 TeamCreate/TeamDelete 工具时改用 Agent 工具起 teammate / 逐个通知退出

## 1.6.315 (2026-06-18)

- feat(network): Context 标签页 tools 区显示相对上一条 MainAgent 请求的 tools 变化——新增项绿色高亮、移除项追加只读占位（删除线），标题附 `+N/-N` 徽标；RequestList 时间线 tools 变化单独紫点标记
- feat(network): Footer 国旗 IP 地理改多源按序兜底（ipinfo.io → ipwho.is → ipapi.co），单源限流 / 不可达时自动切换
- fix(network): entry-slim 不再降级 `body.tools`——改由 intern pool 按内容签名去重控内存；修复 tools_search 等 tools 逐请求变化场景下历史请求误继承末位请求 tools、变化时机丢失

## 1.6.314 (2026-06-17)

- fix(terminal): 复位保留 scrollback——ws 重连 / 反压 resync 的带内复位 `INBAND_RESET` 由 `\x07\x18\x1bc`（RIS，连 scrollback 一起清空，致重连/resync 后"只剩一页、历史上拉不到"）改为 `\x07\x18\x1b[2J\x1b[H\x1b[!p`（BEL+CAN 中止半截序列保零残片 + ED2 仅清可视区 + DECSTR 软复位属性，均不清 scrollback）；新增 `terminal-scrollback-preserve` 真实 xterm headless 测试断言 scrollback 保留 + RIS 清空回归守卫 + 零残片，oracle VT 模型补 ED2 语义

## 1.6.313 (2026-06-13)

- fix(terminal): 终端乱码残片根治——flushBatch 批边界半截序列缓带（新增 `splitTrailingIncomplete`，SYNC 包裹不再劈开序列）+ resync/重连重置改带内 `\x07\x18\x1bc` 替代 `terminal.reset()` + 写队列积压丢弃锚点推进 + send 抛错/消息解析失败接入 resync 兜底
- fix(terminal): `ccv -c` 打开页面终端持续空白修复——SIGWINCH 重绘兜底改为数据感知延迟重试（PTY 零输出时 2s/6s 补发）
- test(terminal): 端到端管线 oracle 测试——真实 coalescer/写队列 + VT 状态机裁判，九场景断言零残片不变量

## 1.6.312 (2026-06-13)

- fix(terminal): 乱码根治补全——截断后主动快照对齐（关闭交接文档 §4 的 P2 结构性缺口：安全切片只保证残片不上屏，被截掉的中段对增量 TUI 流不会自愈）。`pty-flood-coalescer` 新增 `onTruncate`（每轮洪泛实际丢字节时、回落直通后触发一次，携带累计丢弃量）；server.js 把 onResume 的「data-resync 快照 + nudge 冷却门」抽成 `sendResync()`，bpGate.onResume / floodGate.onTruncate / 客户端 `resync-request` 三路共用（主终端 + scratch 两条 ws 路径）；前端 `TerminalWriteQueue` 新增 `onTrim` 回调，积压整项丢弃后经新 ws 消息 `resync-request` 请求权威快照（客户端 2s 节流 + 服务端 `CCV_RESYNC_REQ_COOLDOWN_MS` 冷却兜底，默认 1s）。真实进程线上压测验证（CLI 模式起真 server + node-pty shell，5MB 真彩 SGR+CJK+emoji 洪泛）：零转义残片、零孤立代理对、截断后 data-resync 自动到达
- feat(chat): 对话视图 Write 工具内容改为 git diff 新增行渲染（绿底 + 行号 + `+` 前缀 + `+N` 统计 + 折叠），复用 Edit 的 DiffView（新增 label prop）
- fix(terminal): 根治终端偶现 `[9m`/`?2026l`/`6;136;136m` 类乱码——输出缓冲/洪泛限流截断起点改为锚点扫描（锚到下一个 ESC/LF，回看兜底跳过被切断的 CSI/OSC），实现收编 `server/lib/ansi-safe-slice.js` 三处调用同源（pty-manager / scratch-pty-manager / pty-flood-coalescer）；裁剪加滞回（200K→180K / 50K→45K）降低 slice 重分配频率；stripAnsi 与撕裂缓带正则补 DEC 私有模式（`\x1b[?…`）
- fix(mobile): 上下文抽屉内容区去掉 PC 弹层的 max-height 限高（zoom 0.6 下被压到半屏 + 嵌套双滚动），滚动交还抽屉本体
- chore(i18n): 清空上下文确认弹窗移除"此操作不可撤销"句（全部 17 语言）

## 1.6.311 (2026-06-12)

- feat(network): Context 标签页右侧新增「原文」switch——原地切换查看选中节点（工具/系统提示词/消息轮次）在请求体中的原始 JSON 纯文本，附复制按钮；当前轮次 assistant 原文为完整 response body

- feat(terminal): 终端工具栏新增四芒星快捷设置菜单——AgentTeam 快捷指令（自独立按钮迁入）+ 权限自动审批 / Plan 自动审批级联二级菜单快速切换（hover 悬浮、选完即收、行内显示当前值）；档位收敛唯一事实源 autoApproveOptions.js 与设置抽屉对齐（Plan 档改为 10s/30s/60s）
- feat(chat): 隐藏终端时对话输入框 [+] 菜单桌面端改为终端同款四芒星快捷菜单（权限/Plan 审批档位 + AgentTeam 级联子菜单），UltraPlan/上传/清空上下文平铺为输入栏独立圆钮（顺序与终端工具栏一致）；移动端 UltraPlan 移出菜单为独立圆钮；AgentTeam 未启用时子菜单显示去终端启用的引导提示；级联样式/图标/审批两行与 hover-intent 收敛 sharedChrome.module.css / quickMenuIcons.jsx / QuickAutoApproveRows.jsx / quickMenuHoverIntent.js 两端共用
- feat(ui): 上下文血条进度填充叠加 135° 浅色半透明斜纹（2px 纹宽 / 5px 间距）
- fix(chat): harness 注入的队友消息轮不再误显示为 user 气泡——包裹文本（"Another Claude session sent a message:" 前缀 + 尾部 IMPORTANT 免责段）纳入系统文本过滤，teammate 内容沿用既有 teammate 气泡渲染；混入的真实用户文本仍经二次回收保留
- feat(chat): 桌面隐藏终端时输入栏 UltraPlan 改为终端同款锚定弹层——UltraPlan 面板抽共享组件 UltraplanPanel（含拖拽 resize/管理专家/? 帮助，两入口共享尺寸记忆），移动端维持居中 Modal；顺带修 ChatView 缺 expertOrder/expertHidden 致专家排序显隐失效、补挂管理专家弹窗

## 1.6.310 (2026-06-11)

- feat(context): 上下文血条口径对齐 Claude Code `/context`——去掉 ÷0.835 的「auto-compact 进度」旧映射改为原始占用比(百分比整体下降约 16.5%),分子统一为 input+cache_creation+cache_read+末轮 output 且与 popover 显示同源,桌面三路径/移动端两分支/服务端 SSE 全部同口径,色变阈值 80/60→75/55;窗口规则表收编 `server/lib/context-rules.js` 前后端同源(haiku/旧 opus 4-0/4-1/4-5/3-opus 修正 200K、opus-4-6+ 1M、服务端 deepseek-v4 误判 200K 修复、裸 sonnet-4-6 有意维持 200K 由 [1m] 后缀与用量纠偏兜底),容错新版嵌套 `cache_creation` 分桶对象
- fix(ci): release Windows 构建根治——Windows 镜像全面滚到 VS2026 后 @electron/rebuild 自带的 node-gyp ^11.2 找不到任何 VS 致 node-pty 编译失败,overrides 强制 node-gyp ^12.1.0(12.1 起支持 VS2026)
- docs(readme): 17 个语言版 README 与 zh 基准同步(移除三个过期小节),新增 cc-viewer-share.svg 动画示意图(一台设备部署、多端异步共享)并全量嵌入

## 1.6.309 (2026-06-10)

- fix(chat): 根治流式期间无法脱离吸底——SSE 高频重启缓动链使锁常驻、用户滚动信号被吃掉；新增用户滚动意图暂停窗口：直接监听 wheel/touch/pointer 拖动（纯点击/tap 不开窗），窗口内暂停一切自动追底、sticky 实时翻转，停手 300ms（可调 `userScrollIdleMs`）终判并恢复追底；desktop 与安卓 Virtuoso 双路径覆盖，「回到底部」等显式动作不受抑制；容器外触摸（横滑代码块等）不误暂停追底；顺带修 unbind/换绑不释放缓动锁的孤儿锁（决策入口被堵死至下个缓动周期）

## 1.6.308 (2026-06-10)

- fix(ci): release Windows 构建钉回 windows-2025 镜像——windows-latest 滚动到 windows-2025-vs2026 后 node-gyp 找不到 VS2026，node-pty 原生编译失败
- fix(win): 根治 /plugins 菜单快速导航偶发整页永久卡死——真凶为 ChatView prompt 检测正则灾难性回溯（/plugins 菜单形态文本 8 行即 >90s，4KB buffer 等效无限占死主线程，旧「洪泛超消化力」结论被推翻），重写为线性行式解析器 promptDetect.js（新旧等价回归 + 对抗样本 <50ms 断言，`ccv_legacy_prompt_detect=1` 逃生开关）；xterm 喂入改消化力闭环：write callback 计时 AIMD 自适应 chunk（4~32KB，Windows 16KB 起步，500ms fail-open 不死锁）；顺带修 write 抛错时 chunk 静默丢失（指针快照位置错误）；新增 termDiag 本地诊断（控制台 `__ccvTermDiag()`，`localStorage.ccv_term_diag='1'` 开周期日志）；解析器 CRLF 行尾兼容（Windows ConPTY）+ ANSI 序列跨 write 撕裂缓带（splitTrailingAnsiCarry）+ 单项超大快照不再误报 "output trimmed"
- feat(context): 上下文血条识别 fable 模型——fable-5 及 fable-5.x 默认 1M 窗口（前端规则表/auto 校准 + 服务端 context-watcher 四处同步）
- fix(terminal): web terminal xterm 全链路加固——堵 input-sequential 非字符串 chunk 致服务进程崩溃（入口 every(string) 校验 + sendNext 守卫，拒绝路径回 ok:false 不静默丢弃）；粘贴/注入剥离内嵌 `\x1b[201~` 防 paste-injection（xterm 6.0 未内置，主面板 + scratch 双端覆盖；循环剥离到稳定堵分裂残片重组绕过 + 覆盖 8-bit C1 CSI `\x9b` 变体）；pendingImages 路径注入补 preventDefault（修注入即提交）；主 PTY spawn 加在途闸防双开 shell 泄漏（while 循环覆盖 ≥3 并发）；ws close 重连补 writeQ/terminal reset 防回放重复（主面板 + scratch）；resize cols/rows 钳制为有限正整数 + fit 0 尺寸守卫防 2×1 打到 ConPTY；初始 fit/mobile rAF 加 unmount 竞态守卫 + webgl 加载失败 catch 补 dispose
- fix(delta): 根治 team 关闭密集事件期 mainAgent 对话整段重复渲染——`_seq`/`_seqEpoch` 请求序号 + 重建器乱序守卫 + 重建完整性校验 + sessionMerge 等长分支内容感知 + merge 入口守卫谓词，四层防御堵「完成序倒置」（机制详见 docs/WIRE_FORMAT.md §3.7）；顺带堵 teammate 双标条目污染累积态、同条重发幂等、mergeLogFiles 内部字段泄漏；新增 delta-reorder.test.js 确定性复现用例；重建编排抽单一核心 _stepReconstruct（批量/段级/增量三 API 共用，防路径分叉）；mergeLogFiles 补剥 _inPlaceReplaceDetected（孤信号）与已废弃 _eagerSnapshot；补 _seq 生产端不变量测试（单调/epoch 稳定/teammate 不写）+ stale 就地补偿内容与 baselineSeen 门测试 + 双层重建 load-bearing 不变量回归测试（WIRE_FORMAT §3.7 文档化）

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

## 1.6.251 ~ 1.6.300 版本汇总 (1.6.251 ~ 1.6.300 Version Summary)

> 以下为 1.6.251 ~ 1.6.300 所有版本的功能/修复摘要，详细变更记录已归档至 git 历史。
> Below is a condensed summary of versions 1.6.251 ~ 1.6.300. Full per-version detail lives in git history.

### 1.6.296 ~ 1.6.300 (2026-06-05 ~ 2026-06-06) — Windows 性能根治批、测试覆盖率 72%→96%、测试隔离守卫体系、移动端尾部优先加载

- **Windows 性能根治批**（1.6.296）：interceptor 热路径 appendFileSync 改异步写入队列（消除每请求 50-300ms 事件循环阻塞）；Atomics.wait 阻塞锁改异步文件锁；UV_THREADPOOL_SIZE=16；日志监听 watchFile 500ms 轮询迁移 fs.watch 事件驱动（同目录共享 watcher + 80ms 防抖 + 5s 安全网）；日志读取路径全面 fs.promises 异步化；JSONL 分割阈值 300MB→150MB；CCV_SYNC_WRITES=1 回退开关
- **测试覆盖率 72%→96%**（1.6.299）：新增/补强约 100 个测试文件（server 路由 / interceptor / sdk-manager / cli / WS/PTY / src/utils 全量）；test/_shims ESM loader 让 node:test 直接导入 Vite 风格前端模块；根治并行测试 flake（跨进程端口窗隔离、固定 sleep 改条件轮询）；test 脚本统一 --test-timeout=120000 + --test-force-exit
- **测试隔离守卫体系**（1.6.300）：findcc.js LOG_DIR/configDir 双铁闸（测试态强制进程私有临时目录）、测试态拒绝真实 spawn IM worker / registry 请求，单测从机制上无法触碰真实 ~/.claude 与外网；新增静态扫描守卫（env 隔离 / spawn 注入 / fetch 还原纪律）；24 个测试文件端口隔离改造；50+ branch-*.test.js 定向补强，全量 6402 测试 0 失败
- **启动期配置备份**（1.6.300）：preferences/profile/workspaces 每次启动自动备份到数据目录外（滚动保留 10 份）
- **移动端历史日志尾部优先加载**（1.6.298）：服务端 readTailEntries() 仅读文件末尾 2-8MB 跳过全文件扫描，旧条目按需分页
- **终端渲染稳定性**（1.6.298）：PTY 输出批次启用 DEC 2026 同步渲染消除中间帧闪烁；WebGL longtask 自动降级 DOM 渲染器（30s 内 3 次 >200ms，7 天后重试）
- **Windows 冷启动 Chrome tab 崩溃修复**（1.6.298-299）：桌面端首屏 SSE 1000→400 条 + idle 超时 2s→5s + requestIdleCallback 延迟连接 + 重连指数退避（2s→32s）+ ?since= 增量重连

### 1.6.293 ~ 1.6.294 (2026-06-02 ~ 2026-06-03) — IM 多平台独立 worker 体系、Windows 桌面版体验批、长任务页面卡死根治、Plan 自动审批

- **IM 接入重构为「每平台一个独立常驻 ccv worker 进程」**（1.6.293）：工作目录 ~/.claude/cc-viewer/IM_<id>/、绑 127.0.0.1、skip-permissions 全自动运行，主 ccv 不再注入当前会话（消除排队/上下文污染）；reconcile 自动拉起、im.lock 防多处接入、PreToolUse 在 bypass 前硬拦截危险操作；端口段 7050 起与主池不重叠
- **IM 多平台桥接**（1.6.293）：钉钉桥接重构为通用编排核心 im-bridge-core + 平台适配器，新增飞书/Lark（长连接）、企业微信（智能机器人）、Discord（Gateway）三平台；描述符驱动设置面板
- **IM 体验完善**（1.6.294-296）：即时确认（飞书/Discord 可更新卡片）、排队位置告知、turn_end 去抖 10s→200ms + Stop hook/idle 轮询双保险；对话记录按发送者显示真实姓名+头像；每 IM 独立 CLAUDE.md「模型性格定义」编辑与 SKILL 管理；配置失焦自动保存 + 启动/停止按钮；连接状态徽标以真实进程状态为准
- **Windows 桌面版体验批**（1.6.294）：自定义标题栏（logo/菜单/tabs 合一行，titleBarOverlay 保留原生按钮与 Snap Layouts）；启动白屏修复、窗口状态持久化、右键菜单补齐、AppUserModelId 对齐；主进程防阻塞加固（diag 日志异步队列、打包版 console 静默、审批级联去抖）；child_process 全量 windowsHide
- **Web 桌面端长任务页面卡死根治**（1.6.294）：桌面端复用移动端渲染窗口裁剪（默认只渲染最近 400 条，更早按需展开）——原先全量渲染 DOM 致 reconcile/layout 随条目数线性增长打满主线程；SSE backpressure 容忍 5s→30s 消除误判剔除→重连重放风暴
- **ConPTY 输出洪泛防护**（1.6.294）：前端写队列积压超 2MB 丢最旧并提示；服务端按 ws.bufferedAmount 停发 + data-resync 快照对齐 + 60s 死连接判定
- **「Plan 自动审批」首发**（1.6.294）：偏好新增下拉（关/3s/5s/10s/立即），CLI(PTY) 模式下计划倒计时自动批准、可取消转手动；原「自动审批」更名「权限自动审批」
- **UI 杂项**（1.6.293）：汉堡菜单「钉住」生成常驻快捷方式；主题切换简化为太阳/月亮图标按钮；用户 Prompt 导航加时间列与 Session 分隔线；「仅展示当前会话」偏好；源码裸控制字节转义 + pretest 守卫；Electron iPad 设备预览模式（500px 收窄 + header 控件迁原生 tab bar）

### 1.6.283 ~ 1.6.288 (2026-05-29 ~ 2026-06-01) — 显示缩放体系演进、套餐用量 pill、SDK 停止语义、流式性能

- **「显示大小」三步演进**：CSS zoom 预设选择器 50%-200% + Cmd/Ctrl +/- 快捷键（1.6.285）→ 根容器高度链修复留缝（1.6.287）→ 弃用 CSS zoom 改 Electron 原生 webFrame.setZoomFactor、纯浏览器交还原生缩放（1.6.288，规避 Chromium 128 CSS zoom 坐标空间分裂）
- **套餐用量 pill**（1.6.283）：footer 新增 Claude 订阅（OAuth）5 小时/周窗口使用率展示，数据取自 anthropic-ratelimit-unified-* 响应头，纯前端实现；hover 详情血条化；低调灰收敛配色
- **代理转发两项根治**（1.6.283）：Node 26 起 global dispatcher 不再共享——EnvHttpProxyAgent 显式作为 fetch dispatcher 传入；上游强制 accept-encoding: identity 根治网关剥 content-encoding 头致 CLI 收到压缩字节报 malformed response
- **SDK 停止语义修复**（1.6.286）：「停止」真正 halt 在途待发（清服务端 _messageQueue + 客户端 _pendingFlushQueue）；停止按钮按模式分流（SDK close query 保会话 / PTY focus-in 再 ESC 修失焦吞 ESC）；点击乐观即时切非运行态
- **流式吸底帧率节流**（1.6.286）：StickyBottomController 平滑追随按 33ms（~30fps）门控与显示器刷新率解耦，流式期 layout/paint 负载降 ~4×；移动端 Virtuoso followOutput smooth→auto 消除每帧平滑滚动动画（1.6.283）
- **UltraPlan 专家体系**（1.6.283）：「管理专家」弹窗统一管理内置+自定义（显隐开关/拖拽排序/落 preferences）；「预设专家」ultraAgents/*.json 随包发布 + 编辑器「载入模版」；title/description JSON 协议层内联本地化
- **杂项**：同请求多 thinking 块合并单折叠框（1.6.284）；LSP/Workflow 概念帮助文档 18 语言（1.6.283）；用户消息裸路径上传图片渲染（1.6.283）；opus-4 家族/mythons 1M 上下文判定 + 血条自适应纠偏（200K 判定但输入越窗自动升 1M）（1.6.282）；IM 弹窗 Chrome tab 风格（1.6.282）；默认登录密码规则简化 AB1234 形态（1.6.282）

### 1.6.274 ~ 1.6.281 (2026-05-24 ~ 2026-05-29) — 密码登录认证、钉钉桥接首发、server.js 路由拆分、components 目录重组、终端刷新演进

- **密码登录认证体系**（1.6.276）：远程未授权访问弹密码页（Set-Cookie SameSite=Strict），本机永远免密 admin；全局 + 项目级覆盖两层持久化（base64 混淆、0600、/api/preferences 剥离）；CLI --usePassword 启动即开启；鉴权收敛纯函数 decideAuth() HTTP/WS 共用（补上 WS 缺失鉴权）；登录限流 60s/20 次
- **钉钉 Stream 双向桥接首发**（1.6.277）：仅填 AppKey/AppSecret 无需公网；消息注入会话 + turn_end 读 transcript 回干净 markdown（分块+令牌桶限流）；/stop 中断、ack+LRU 去重、忙时排队、staffId 白名单、审计日志；多角色 review 修复批（状态脱敏、CR 消毒、队列封顶、语言跟随 UI 配置）
- **server.js 路由拆分**（1.6.275）：5467→1791 行，84 路由 if-chain 按功能域拆 14 个 server/routes/* 模块 + 有序首匹配 dispatcher，deps 单例注入，纯搬移零行为变更
- **components 目录重组**（1.6.274）：扁平目录按功能域分 10 个子目录（chat/terminal/git/files/viewers/approval/settings/mobile/dashboard/common）；AppHeader.module.css 1507 行按归属拆分；五个对话展示偏好单一真相源收口 SettingsContext；askFlowController 从 ChatView 抽离（4777→3990 行）
- **终端「刷新」按钮三步演进**：高度抖动驱动 xterm 重建（1.6.277）→ 连击逐级加强 L1/L2/L3 + 60s 后台预防性触发（1.6.280）→ 改 xterm 官方 escape hatch（clearTextureAtlas/fit/WebglAddon reload，保 cols/rows/滚动位置）（1.6.281）
- **审批档位简化 +「免审批」**（1.6.278）：删 15/20/30/60s 保留 3/5/10；新增免审批（AUTO_APPROVE_INSTANT=-1）在请求到达处直接放行（hook 回 allow / pty 直选允许），含 prompt 签名时窗去重与 ws 断连回落
- **本机明文查看凭据**（1.6.278）：127.0.0.1 admin 可查看代理 API Key / 钉钉 AppSecret 明文，远程仍脱敏；IM 来源消息显示平台图标（⟦im:dingtalk⟧ 标记）
- **UltraPlan 自定义专家编辑器**（1.6.279-280）：双栏布局（左使用文档右表单）、预填 system-reminder 外壳骨架、左栏可折叠、打开编辑器不再关闭背后面板（rc-trigger capture-mousedown 守卫）
- **杂项**：Homebrew bump 改 reusable workflow 链式调用修漏 bump（1.6.279）；「new」版本徽标 SSE 补推跨刷新持久（1.6.277）；代理 content-length 剥离修模型覆盖 profile 卡死（1.6.277）；血条 Popover 内打开明细 Modal 不再消失（1.6.277）；项目中心密码管理模型（1.6.277）；per-project 别名（1.6.272）

### 1.6.251 ~ 1.6.273 (2026-05-10 ~ 2026-05-20) — ask 无超时体系、语音包、Windows 适配批、服务端收纳 server/、日志压缩归档

- **ask 体系大修**（1.6.263/270）：GUI AskUserQuestion 实质无超时与 TUI 对齐（先 60min+倒计时，后彻底无超时）；ask-store 持久化 + server 重启恢复 UI；ask-bridge 短轮询协议（POST 返 askId + GET 25s wait + 404 重建）；web 端取消 + 输入框打字打断（SDK sentinel deny / Hook cancelled 分支）；十余项 race/边界修复（first-write-wins、单 lock consume、pruneStale、晚到 ack 关 modal 等）；注入 hook 加 24h timeout 防 Claude Code 10min 强制中断
- **语音包体系**（1.6.264/268/271）：4 类生命周期事件绑定音频（plan 审批/ask/超时预警/turn 结束），内置 Pixel Buddy chiptune + 用户上传（magic bytes/Range 206/深合并 reconcile）；新增三国 sanguo 内置包（zh 新用户默认）；turn-end Stop hook + 10s trailing debounce 双保险；「审批提示音」与「语音包」合并单开关
- **服务端代码收纳 server/**（1.6.273）：根目录只留 cli.js/findcc.js + 一行 re-export shim；注入改 bare specifier（cc-viewer/interceptor.js）与物理路径解耦 + LEGACY 升级路径；stale hooks 主动 purge；--uninstall 清理 managed hooks；node-pty pnpm hoist 修复；_paths.js 集中路径常量；ask-store 跨进程锁加 PID 校验（1.6.273）
- **Windows 适配批 1/2**（1.6.257-258，Issue #84）：路径校验 + '/' 改 + sep、startsWith('/')→isAbsolute、CRLF split、保留名守卫、symlink 拒绝防 TOCTOU、renameSyncWithRetry、git restore per-file mutex、上传目录平台分支
- **日志压缩归档**（1.6.267）：.jsonl 批量压 .jsonl.zip，查看/下载/合并/统计透明支持（tmpdir 解压缓存 + Zip Slip 防护 + 启动清理）；合并上限前后端统一 400MB
- **血条 auto 校准**（1.6.273）：启动期回落 ~/.claude.json lastModelUsage 推断偏好 model，解决 haiku init ping 错显 200K；/clear lock 多条解锁兜底（1.6.267/269）
- **文件/Git 面板**（1.6.251/255/256）：GitChanges 新增「本地未推送 commit」折叠区（哨兵字符 + hex 校验防注入）；自动刷新机制重写（监听 tool_result 双阶段、覆盖 subAgent/teammate）；文件夹折叠/目录展开/scroll 位置按项目持久化；electron 35→42 消 17 个 high CVE（1.6.256）
- **对话渲染**（1.6.262/266）：web_search 结果卡片化 + 分组容器；工具结果 base64/url 图片渲染（白名单+降级）；SubAgent 末轮工具结果跨请求补偿；多 text 块 synthesis 合并 markdown
- **杂项**：sessionMerge 反向锚点对齐根治复制翻车残余 + WIRE_FORMAT.md 单一真理源（1.6.253）；doubled-history Plan C eager update 补竞态漏检（1.6.251）；zstd accept-encoding 剥离（1.6.252）；移动端三 Modal 改抽屉 + 清理 !important（1.6.261）；图片查看器触控板 pinch 灵敏度修复（1.6.260）；zsh 不 source ~/.zshrc 修复、symlink 目录展开（1.6.269）；UltraPlan modal 拖拽手柄（1.6.273）；内置 slash 命令本地化标签、雪山白主题深底用户气泡（1.6.270）；侧栏 popover 视口贴顶（1.6.254）

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

