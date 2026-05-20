# cc-viewer mainAgent Wire Format

服务端 (`server/interceptor.js` + `server/lib/log-watcher.js`) 到客户端 (`AppBase.jsx` + `sessionManager.js` + `sessionMerge.js`) 的 mainAgent entry 协议规约。本文档是**单一真理源** — 字段名 / 写入条件 / 客户端消费契约 / 已知特殊窗口都以本文为准。

> **演进策略**：修改任何 entry 字段名 / 语义 / 触发条件 → 必须同步本文相应章节 + 涉及的 4 个文件顶部注释（见 §6 维护责任）。

---

## §1 Entry 形态矩阵

mainAgent entry 共 **4 种形态**，由信号字段联合判定：

| 形态 | 判定条件 | `body.messages` 内容 | 客户端消费路径 |
|------|---------|--------------------|---------------|
| **旧格式全量** | 无 `_deltaFormat` 字段 | 完整历史 | 直接使用；`createIncrementalReconstructor` 重置累积 |
| **Checkpoint** | `_isCheckpoint === true` 或 `_totalMessageCount === body.messages.length` | 完整截至该点的历史 | `delta-reconstructor` 重置 accumulated 为完整值 |
| **Delta** | `_deltaFormat === 1 && !_isCheckpoint && mainAgent === true` | **仅** 自上次 checkpoint 以来新增的消息子集（`messages.slice(_prevMessagesCount)`） | `delta-reconstructor` 拼接到累积末尾 |
| **In-place Replace** | `_inPlaceReplaceDetected === true` **且** `_isCheckpoint === true` 必须**同时**为真 | 完整历史（与上一帧 length 相同但末位不同） | `applyInPlaceLastMsgReplace()` 短路 sessionMerge，仅替末位保留前 N-1 引用 |

**关键不变量**：

- Delta entry 的 `_totalMessageCount` 必须 ≥ 前一条的 `_totalMessageCount`（单调非递减）
- 若违反 → `delta-reconstructor` 标 broken，由后续 checkpoint 反向修复（`server/lib/delta-reconstructor.js:95-117`）
- `inProgress: true` entry 必有占位 message（无 `body.messages`），重建时跳过避免累积偏移

---

## §2 关键字段词典

| 字段 | 写入位置 | 写入条件 | 客户端消费 | 生命周期 |
|------|---------|---------|----------|---------|
| `mainAgent` | `server/interceptor.js:604` | `isMainAgentRequest(body) === true`（`server/lib/interceptor-core.js:15-45`：检测 system text + tools 特征） | 标记后才进入 sessionMerge / sessionManager 主路径 | 永久 |
| `_isCheckpoint` | `server/interceptor.js:670` | (1) 进程重启 / 首请求 (2) `messages.length` 下降 (3) 每 N 条定期 (4) in-place replace 检测 | gate `applyInPlaceLastMsgReplace`；`delta-reconstructor` 重置 accumulated | 永久 |
| `_deltaFormat` | `server/interceptor.js:667/683` | 仅取值 `1`（启用 delta 存储） | `delta-reconstructor` 判定走拼接还是直接使用 | 永久 |
| `_totalMessageCount` | `server/interceptor.js:668/684` | delta：`= 原始 messages.length`；checkpoint：`= body.messages.length` | `delta-reconstructor` 校验单调性 + broken 修复参考点 | 永久 |
| `_inPlaceReplaceDetected` | `server/interceptor.js:678` | Plan C 检测 `messages.length === _prevMessagesCount && _deltaOriginalTailFp !== _prevTailFp` | `applyInPlaceLastMsgReplace()` 唯一消费方；命中后跳过 sessionMerge prefix-overlap | 永久 |
| `inProgress` | `server/interceptor.js:695` | 占位条目（请求未完成时写入） | `delta-reconstructor` 跳过（不进入累积） | 临时；后续 completed entry 覆盖 |
| `_eagerSnapshot` | `server/interceptor.js:642`（暂未公开消费） | Plan C eager-update 时 snapshot 旧 `_lastMessagesCount` / `_lastTailFp` | 客户端尚未消费；为未来扩展保留 | 内部 |

---

## §3 已知特殊窗口

### §3.1 CLI Plan Mode 短窗口（**故意发**）

CLI 在 `ExitPlanMode` 审批前后可能用极短的 sliding window（每个 entry 只含 `[latest assistant, latest tool_result]` 两条）连续发送请求，**不再传累积历史**。

- **新窗口与上一轮 messages 既不重叠也不连续**：单凭长度 `newLen vs currentLen` 无法区分流式更新和新对话片段，必须看内容
- **客户端处理**：`sessionMerge.js` 的反向锚点算法 anchor null 命中等长 fallback 分支，整段 append（不是替换），保留累积历史

### §3.2 K 条尾部重叠 + 后段新增（**故意发，非 race**）

CLI Plan Mode 后偶发发出 "前 K 条与上一轮末尾 K 条重叠 + 后段新增" 但 `newLen > curLen` 的窗口。**此为 CLI 端协议行为，服务端无法主动阻止**（service-side 无重叠检测代码）。

- **客户端必须容错**：`findReverseAnchor` 以 `newMessages[0]` 为锚反向扫到 `curMsgs[curLen-K]` 命中、overlapLen=K → push `newMessages[K..]`，不重复 push 末尾 K 条
- **历史漏点**：1.6.244 之前的 "正向 prefix-overlap + slice(0,64) 单条 fp" 在此窗口下盲推 `newMsgs[curLen..]` → 复制翻车（commit `9711024` 修复）

### §3.3 SUGGESTION MODE 末位替换

CLI idle 时注入 SUGGESTION MODE 占位符到末位，用户实际输入到达时把占位符**原地替换**为真输入。

- **服务端 Plan C 检测**：`messages.length` 不变但 `_deltaOriginalTailFp !== _prevTailFp` → 写 `_isCheckpoint:true` + `_inPlaceReplaceDetected:true` 完整 entry（`server/interceptor.js:633-678`）
- **客户端消费**：`applyInPlaceLastMsgReplace()` 信号驱动短路，仅替末位保留前 N-1 引用（`src/utils/sessionManager.js:305-360`）
- **历史漏点**：1.6.250 之前无信号驱动 → sessionMerge prefix-overlap 在 `newLen===curLen` 末位 fp 异时强制 overlap=0 → push 整段 → 长度翻倍

### §3.4 `/clear` 后首个 checkpoint

用户执行 `/clear` 命令后，**下一次** mainAgent 请求始终是新会话起点：
- `_isCheckpoint:true` + `body.messages` 大幅缩短 + `body.messages[0]` 含 `<command-name>/clear</command-name>` 标记
- **客户端消费**：`isPostClearCheckpoint(entry, prevMsgCount)` 返回 true → 创建新 session，**不**与上一 session 合并
- **优先级最高**：`sessionMerge.js` 的 B1 路径，先于 transient filter / userId 判断

### §3.5 `/compact` summary 重建

`/compact` 命令产生的 entry：`_isCheckpoint:true` + `messages.length < prevMsgCount` 但**不含** `/clear` 标记。
- **客户端消费**：`sessionMerge.js` 的反向锚点未命中（newMsgs 内容是 summary，与累积历史无重叠）+ `newLen < curLen` → 走 rebuild 分支，替换 `lastSession.messages` 引用

### §3.6 log-rotation 重叠（已知 race，本轮不修）

`server/lib/log-watcher.js:149-251` watchFile callback 在文件轮转 race 下可能同一 entry 推送两次。
- 客户端 dedup：`AppBase.jsx:1153-1162` `_requestIndexMap[${ts}|${url}]` 后值覆盖前值
- **风险**：若两次推送的 `body.messages` 不一致（不应发生，但理论上可能）→ 客户端 dedup 后保留后值；下游 sessionMerge 见到的是 idempotent 的 entry，反向锚点保护下不会复制

---

## §4 信号链路图

```
┌─────────────────────────────────────────────────────────────────┐
│ 服务端                                                          │
│                                                                 │
│  Claude CLI request                                             │
│         │                                                       │
│         ▼                                                       │
│  server/interceptor.js                                          │
│    - isMainAgentRequest() 标记 mainAgent:true                  │
│    - Plan C: eager-update _lastMessagesCount/_lastTailFp        │
│    - 检测 in-place replace → 写 _inPlaceReplaceDetected:true   │
│    - 决定 delta vs checkpoint → 写 _isCheckpoint / _deltaFormat │
│         │                                                       │
│         ▼ (jsonl + \n---\n)                                     │
│  log file                                                       │
│         │                                                       │
│         ▼                                                       │
│  server/lib/log-watcher.js                                      │
│    - watchFile 增量读取 (byte offset)                           │
│    - createIncrementalReconstructor() 服务端预重建（可选）     │
│    - sendToClients() SSE 广播                                   │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼ (SSE wire: data: <entry JSON>)
┌─────────────────────────────────────────────────────────────────┐
│ 客户端                                                          │
│                                                                 │
│  AppBase.jsx::handleEventMessage (L1110)                        │
│    - push 到 _pendingEntries                                    │
│    - requestAnimationFrame 调度 _flushPendingEntries            │
│         │                                                       │
│         ▼                                                       │
│  AppBase.jsx::_flushPendingEntries (L1122)                      │
│    - dedup via _requestIndexMap[${ts}|${url}]                   │
│    - createIncrementalReconstructor() 客户端重建 delta          │
│    - applyInPlaceLastMsgReplace() 信号驱动短路 (sessionManager) │
│        ├ applied:true → 直接替换 mainAgentSessions              │
│        └ applied:false ↓                                        │
│    - mergeMainAgentSessions() 反向锚点合并 (sessionMerge)       │
│         │                                                       │
│         ▼                                                       │
│  setState({ mainAgentSessions, ... })                           │
│         │                                                       │
│         ▼                                                       │
│  ChatView render (无二次 merge，相信上游)                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## §5 客户端容错策略

| 容错层 | 机制 | 触发条件 |
|--------|------|---------|
| L1：服务端信号驱动短路 | `applyInPlaceLastMsgReplace()` | `_inPlaceReplaceDetected === true && _isCheckpoint === true` |
| L2：反向锚点对齐 | `sessionMerge.js::findReverseAnchor()` | 同 session 增量合并主路径 |
| L3：fp 三元组抗碰撞 | `messageFingerprint()` 用 `length + first32 + last32` | 所有 fp 比较 |
| L4：transient filter | `sessionMerge.js:68` | 批量加载历史时短消息片段保护 |
| L5：dedup 后值覆盖 | `_requestIndexMap` | 同 `${ts}|${url}` 二次到达 |

**诊断挂钩**（用户报"复制翻车"再现时打开）：
- `globalThis.__CCV_SESSIONMERGE_TRACE__ = true` → `applyInPlaceLastMsgReplace` 守卫拒绝路径打 console.warn
- `applyInPlaceLastMsgReplace.fallbackCount` → 各分类拒绝计数（按 `length-mismatch` / `response-missing` / `messages-too-short` / `new-session` / `no-prev-sessions` / `no-last-session-messages` 累加）
- `applyInPlaceLastMsgReplace.appliedCount` → 成功短路计数

---

## §6 维护责任

修改 entry 字段 / 语义时**必须**同步：

1. **本文相应章节**：§1 / §2 / §3 / §4
2. **服务端写入点**：`server/interceptor.js`（搜对应字段名定位）
3. **服务端处理**：`server/lib/interceptor-core.js`（fingerprintMsg 等共享函数）
4. **客户端解析**：`server/lib/delta-reconstructor.js` 的 `isCheckpointEntry()` / `isDeltaEntry()` 判定
5. **客户端消费**：
   - 信号路径：`src/utils/sessionManager.js::applyInPlaceLastMsgReplace`
   - 主合并：`src/utils/sessionMerge.js::mergeMainAgentSessions`
6. **测试**：
   - `test/interceptor-delta-tail-fp.test.js`（服务端信号生成）
   - `test/delta-e2e.test.js`（端到端 wire）
   - `test/session-manager.test.js`（客户端信号消费）
   - `test/incremental-merge.test.js`（客户端反向锚点）

**搜索关键词**：协议变更时跨两端搜以下字符串，确保都同步：
- `_inPlaceReplaceDetected`
- `_isCheckpoint`
- `_deltaFormat`
- `_totalMessageCount`
- `findReverseAnchor`
- `messageFingerprint`

---

## 附录 A：历史演进

| 版本 | 改动 | 解决的窗口 |
|------|------|----------|
| 1.6.245 | 引入 sessionMerge prefix-overlap 算法 + transient filter | Plan Mode 短窗口 |
| 1.6.247 | 引入 messageFingerprint（slice(0,64) 单条 fp） | 等长窗口区分流式 vs 新片段 |
| 1.6.250 | 服务端 `_inPlaceReplaceDetected` 信号 + 客户端 `applyInPlaceLastMsgReplace` 短路 | SUGGESTION MODE 末位替换 doubled-history |
| 1.6.251 | Plan C eager-update race 修复（snapshot 前置） | 30ms 内连续 firing 漏检 race |
| 1.6.252 | （proxy zstd / GitChanges UI；非 wire 协议改动） | — |
| 1.6.253 | 反向锚点对齐 + fp 三元组（length+first32+last32）+ 诊断挂钩 + 本文档 | K 条尾部重叠 + 共 64-char 头部碰撞 / 单一真理源 |
| 本轮 | `_commitDeltaState` 加幂等守卫（严格大于才更新；等长不动 fp） | 1.6.251 eager-update 遗留的 commit 乱序倒推 race |

> **协议兼容性声明**：本轮改动**无 wire 字段名 / 触发条件 / 客户端消费契约的变更**。算法升级（反向锚点 + fp 三元组）是客户端内存运算优化，旧 jsonl 日志可正常解析；服务端 `_inPlaceReplaceDetected` / `_isCheckpoint` / `_deltaFormat` / `_totalMessageCount` 信号字段及触发条件全部保持。
