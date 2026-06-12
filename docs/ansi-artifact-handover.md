# 终端乱码残片问题：交接总结（供后续 plan 继续）

> 2026-06-13 由本地会话整理。目标：彻底解决浏览器终端中出现 ANSI 转义序列残片乱码的问题。

## 1. 问题现象

xterm.js 终端面板中随机出现转义序列残片被当成普通文本渲染，用户多次截图实证：

| 残片 | 原序列 | 截图时机 |
|------|--------|----------|
| `?2026l` | `\x1b[?2026l`（DEC 2026 同步输出 END） | 输入行附近 |
| `[9m` | `\x1b[9m`（删除线 SGR） | 任务列表中 |
| `6;136;136m` | `\x1b[38;2;136;136;136m`（真彩 SGR，前缀 `\x1b[38;2;13` 被裁） | 提示行下方 |
| `[3G` | `\x1b[3G`（CHA 光标定位） | 正文行首 |
| `[39m` | `\x1b[39m`（前景色恢复） | 提示行下方 |
| `8;2;102;102;102m` | `\x1b[38;2;102;102;102m`（前缀 `\x1b[3` 被裁） | 提示行附近 |

共同特征：序列**开头若干字节丢失**、尾部按字面渲染。注意 xterm.js 解析器跨 `write()` 有状态，纯粹的分块传输不会产生此现象——只有**字节被丢弃**（缓冲裁剪）才会。

## 2. 已定位的根因与已完成的修复（本仓库已提交）

### 根因
`findSafeSliceStart(buf, rawStart)`（原 `server/pty-manager.js:62-94`，`server/scratch-pty-manager.js:74-92` 有一份相同私有副本）在从头部裁剪缓冲时返回的"安全起点"会落在 ANSI 序列中间。三个洞：
1. 裁剪点落在 ESC 后的 `[`（0x5b 不在其检查范围）→ 立即 break → 残留 `[9m` 类
2. 扫描窗口仅 64 字节，真彩 SGR 终止符在窗口外 → 返回 scanLimit 落在序列中 → 残留 `6;136;136m` 类
3. 不识别 OSC

### 触发路径（裁剪发生处）
1. **回放缓冲**：claude PTY 滚动输出缓冲超 200KB（scratch 50KB）从头裁剪；每次 ws 连接（`server/server.js` wss connection 处整段重放 `getOutputBuffer()`）与反压恢复 `data-resync` 把裁剪后的缓冲发给前端 → 刷新/重连后残片显现
2. **洪泛限流**：`server/lib/pty-flood-coalescer.js` 限流模式下对实时 pending 两处裁剪（flushPending 超 64KB 预算 / pending 超 256KB cap）→ 正常使用中大输出时刻（TUI 全屏重绘、长总结输出、/resume 重放）残片随机显现

### 已完成的修复
- 新建 `server/lib/ansi-safe-slice.js`：锚点扫描算法——前向扫 4096 字节锚到下一个 ESC（硬锚）或 LF（软锚，仅无 ESC 时用）；无前向锚点时回看 64 字节判定 rawStart 是否在 CSI/OSC 内部（是→前跳过终止符；尾部未终结→返回 ESC 保留半截等续写）；UTF-16 低代理保护
- `server/pty-manager.js` / `server/scratch-pty-manager.js` 收编同源实现（删除重复副本）；新增裁剪滞回（200K→裁到 180K / 50K→45K）
- `server/lib/pty-flood-coalescer.js` 经 server.js DI 注入自动获得新实现（零代码改动）
- 同类加固：`src/utils/promptDetect.js` 的 `stripAnsi` 与 `splitTrailingAnsiCarry` 正则补 DEC 私有模式 `?`
- 测试：`test/ansi-safe-slice.test.js` 28 用例（缺陷 A-D、OSC 两种终止符、fallback 各分支、代理对）；`test/branch-pty-manager.test.js` 按新语义重建；全量 6783 测试通过
- 已经 5 维度多 agent 评审（正确性/回归/质量/测试/兼容），P0 零发现

## 3. 关键现状：修复尚未在线上验证（这是最重要的事实）

**运行中的 cc-viewer 服务进程（PID 79707，`node cli.js --im dingtalk --no-open`）启动于 6 月 9 日 20:25，早于全部修复（6 月 13 日 00:05+）。该 Node 进程从未重启，旧代码仍在运行。**

用户两次报告"重启后仍出现乱码"（`[39m`、`8;2;102;102;102m` 两张截图），但两次检查 `ps` 该进程 PID/启动时间均未变化——用户重启的不是这个服务进程（可能只刷新了浏览器页面，或重启了别的东西）。佐证：本地会话本身是该进程的子进程，若真重启过会话早已中断。

**因此"修复无效"的结论目前不成立，所有截图残片均产自旧代码。**

## 4. 下一步（建议的 plan 内容）

1. **真正重启服务并验证**（最高优先级）：
   - `kill 79707 && cc-viewer --im dingtalk --no-open`（注意会杀掉其下所有 claude 会话）
   - 自查命令：`ps -eo pid,lstart,command | grep "node .*cc-viewer" | grep -v grep`——启动时间必须晚于修复提交时间
   - 复现压测：长会话把输出顶过 200KB 后刷新页面（回放路径）；触发大段彩色输出（洪泛路径），观察是否仍有残片
2. **若重启后仍复现**，按优先级排查剩余候选路径：
   - 前端 `src/utils/terminalWriteQueue.js` `_maybeTrim()`：渲染落后 >2MB 时按队列项边界整项丢弃——跨 tick 分裂的序列两半位于相邻两项时，丢前项会孤儿化后项开头（已有 `\x18`(CAN) 前缀防御，但 CAN 对 OSC 态的中断语义需验证）
   - `data-resync` 前端处理：确认 `TerminalPanel.jsx` / `ScratchTerminal.jsx` 的 `terminal.reset()` 与写入顺序无竞态
   - 服务端 `server.js` 三处 send 与 coalescer 的交互时序（behind 期间 reset coalescer pending 与快照重放的衔接）
   - 检查是否有第二个 cc-viewer 实例/端口在服务该浏览器页（多实例时改对了 A 实例、看的是 B 实例）
3. **backlog**（评审遗留，非阻塞）：terminalWriteQueue 整项丢弃的序列撕裂理论缺口（P2）；注释措辞类 P3 若干

## 5. 本次提交涉及的其他改动（同批工作树，已一并提交）

- fix(mobile)：移动端上下文抽屉去掉 PC 弹层 max-height 限高（zoom 0.6 下被压半屏 + 嵌套双滚动）
- chore(i18n)：清空上下文确认弹窗移除"此操作不可撤销"句（17 语言）
- feat(chat)：对话视图 Write 工具内容改为 git diff 新增行渲染（复用 DiffView，新增 label prop）

## 6. 云端 plan 会话续作（2026-06-12，分支 claude/fix-encoding-issue-luhfe5）

### 已关闭的缺口

- **§4.3 backlog P2（截断后画面不自愈）已根治**：安全切片只保证残片不上屏，被截掉的中段对增量
  TUI 流（macOS/Linux forkpty）不会自愈。新增「截断后主动快照对齐」链路：
  - `pty-flood-coalescer.js` 新增 `onTruncate`（每轮洪泛实际丢字节、回落直通后触发一次）；
  - `server.js` 抽 `sendResync()`（快照无条件 + nudge 走既有冷却门），bpGate.onResume /
    floodGate.onTruncate / 客户端 `resync-request` 三路共用，主终端 + scratch 双路径；
  - 前端 `TerminalWriteQueue` 新增 `onTrim`，积压整项丢弃后发 `resync-request`
    （客户端 2s 节流 + 服务端 `CCV_RESYNC_REQ_COOLDOWN_MS` 冷却兜底）——同时关闭 §4.2 第一条
    候选路径（write-queue 整项丢弃的孤儿化风险，现在丢弃后必有快照对齐）。
- **运行期实证（fresh 进程跑新代码）**：CLI 模式起真 server + 真 node-pty shell，5MB 真彩
  SGR+CJK+emoji 洪泛压测（触发 flood start + 截断）：重建接收流**零转义残片、零孤立代理对、
  零 U+FFFD**，截断回落后 `data-resync` 自动到达。即 §2 修复 + 本次补全在真实进程中验证通过。

### 仍需用户本机执行（无法远程替代）

- §4.1 的服务重启仍是用户侧动作：本机 PID 79707 的旧进程必须真正重启才能加载全部修复
  （自查命令见 §4.1）。云端验证已证明新代码行为正确，剩余风险只在「旧进程还在跑」。
