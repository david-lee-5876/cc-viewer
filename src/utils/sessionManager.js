export const HOT_SESSION_COUNT = 8;

/**
 * 给一组 messages 赋 `_timestamp` 和 `_generatedTs`。
 *
 * 背景：cc-viewer 通过下一次 API 请求的 body.messages 才能感知到上一次的 assistant 响应。
 * 旧逻辑给所有新增 message 统一赋 `entry.timestamp`，导致 assistant msg 的 _timestamp 是
 * "下一次 request 的 ts"，bubble 显示时间晚一拍。helpers.js:resolveProducerModelInfo 用
 * `idx-1` hack 修了 model icon，但 bubble 时间标签没修。
 *
 * 修法：保留 `_timestamp` 语义不变（仍然是 "carrier entry's ts"，所有现有消费者依赖此），
 * 给 assistant 角色的新增 message 额外赋 `_generatedTs = prevMainAgentTs`（生成时 entry 的 ts），
 * ChatMessage 显示 bubble 时优先用 `_generatedTs ?? _timestamp`。
 *
 * @param {Array} messages 当前 entry 的 messages 数组（in-place mutate）
 * @param {Array} prevMessages 上一次 mainAgentSessions 的 last session.messages
 * @param {boolean} isNewSession 是否触发新 session（postClearCheckpoint / 用户切换 / 长度骤降）
 * @param {number} prevCount prevMessages.length（缓存）
 * @param {string} currentTs 当前 entry.timestamp
 * @param {string|null} prevMainAgentTs 上一次 mainAgent entry 的 timestamp，无则 null
 * @returns {Array} messages（原数组引用）
 */
export function assignMessageTimestamps(messages, prevMessages, isNewSession, prevCount, currentTs, prevMainAgentTs) {
  if (!Array.isArray(messages)) return messages;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m) continue;
    if (!isNewSession && i < prevCount && prevMessages[i] && prevMessages[i]._timestamp) {
      // 历史 message：继承 prev 的 _timestamp 和 _generatedTs（如有）
      m._timestamp = prevMessages[i]._timestamp;
      if (prevMessages[i]._generatedTs) {
        m._generatedTs = prevMessages[i]._generatedTs;
      }
    } else if (!m._timestamp) {
      // 新增 message：赋 currentTs；assistant 角色额外赋 _generatedTs
      m._timestamp = currentTs;
      if (m.role === 'assistant' && prevMainAgentTs) {
        m._generatedTs = prevMainAgentTs;
      }
    } else if (m.role === 'assistant' && !m._generatedTs && prevMainAgentTs) {
      // 已有 _timestamp 但缺 _generatedTs（混合输入：部分 entry 来自旧版本）：补 _generatedTs
      m._generatedTs = prevMainAgentTs;
    }
  }
  return messages;
}

/**
 * 解析 bubble 对应的"生产请求 ts" —— 双向映射 msg ↔ request 的 lookup key。
 *
 * 语义对齐：
 *   - assistant msg：体现"哪次 API 调用 *生成* 此 response" → `_generatedTs` (= 上一次 mainAgent ts，
 *     即真正产出该 content 的 request 的 ts)。fallback 到 `_timestamp` 兼容旧 cache / 首条 entry。
 *   - user / 其他 role：体现"哪次 API 调用 *承载* 此 input" → `_timestamp` (carrier，本就 = 该请求自身 ts)。
 *
 * 用途：
 *   - ChatView 1228 reqIdx = tsToIndex[resolveBubbleProducerTs(msg)] —— "查看请求"按钮跳到 producer
 *   - ChatView 1791 tsItemMap[resolveBubbleProducerTs(msg)] —— 网络报文→对话反向跳转 highlight
 *
 * 不影响：`_timestamp` 作 carrier 语义（resolveModelInfo / 时间排序 / dedup key 等消费者保持不变）。
 *
 * @param {object} msg lastSession.messages[i]
 * @returns {string|null}
 */
export function resolveBubbleProducerTs(msg) {
  if (!msg) return null;
  if (msg.role === 'assistant') return msg._generatedTs || msg._timestamp || null;
  return msg._timestamp || null;
}

/**
 * 构建轻量 session 索引。
 * 遍历 entries 按 _sessionId 分组统计 firstTs/lastTs/entryCount。
 * 遍历 mainAgentSessions 提取 msgCount/preview/userId。
 * @param {Array} entries - 已标记 _sessionId 的 entries
 * @param {Array} mainAgentSessions - _processEntries 产出的 sessions
 * @returns {Array} sessionIndex
 */
export function buildSessionIndex(entries, mainAgentSessions) {
  // 按 _sessionId 分组统计 entry 级别的 firstTs/lastTs/entryCount
  const groupMap = new Map();
  for (const entry of entries) {
    const id = entry._sessionId;
    if (id == null) continue;
    const ts = entry.timestamp || null;
    let g = groupMap.get(id);
    if (!g) {
      g = { firstTs: ts, lastTs: ts, entryCount: 0 };
      groupMap.set(id, g);
    }
    g.entryCount++;
    if (ts) {
      if (!g.firstTs || ts < g.firstTs) g.firstTs = ts;
      if (!g.lastTs || ts > g.lastTs) g.lastTs = ts;
    }
  }

  // 合并 mainAgentSessions 的信息：按 session 顺序遍历
  // _sessionId 按时间排序，与 mainAgentSessions 的顺序一致
  const sortedGroupKeys = Array.from(groupMap.keys()).sort();
  const result = [];

  for (let i = 0; i < mainAgentSessions.length; i++) {
    const session = mainAgentSessions[i];
    // 用 groupMap 的排序 key 对齐 session（而非 session.entryTimestamp，后者会被更新为最后一条 entry 的 timestamp）
    const sessionId = sortedGroupKeys[i] || session?.entryTimestamp || null;
    const g = sessionId ? (groupMap.get(sessionId) || { firstTs: null, lastTs: null, entryCount: 0 }) : { firstTs: null, lastTs: null, entryCount: 0 };

    let msgCount = 0;
    let preview = '';
    let userId = null;

    if (session) {
      msgCount = session.messages ? session.messages.length : 0;
      userId = session.userId || null;
      // preview: 第一条 role==='user' 的 message 的 text content 前 80 字符
      if (session.messages) {
        for (const msg of session.messages) {
          if (msg.role === 'user') {
            const text = extractTextContent(msg);
            if (text) {
              preview = text.slice(0, 80);
              break;
            }
          }
        }
      }
    }

    result.push({
      sessionId,
      firstTs: g.firstTs,
      lastTs: g.lastTs || session?.entryTimestamp || null,
      entryCount: g.entryCount,
      msgCount,
      preview,
      userId,
    });
  }

  return result;
}

/**
 * 从 message 中提取 text content。
 */
function extractTextContent(msg) {
  if (!msg) return '';
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block.type === 'text' && block.text) return block.text;
    }
  }
  return '';
}

/**
 * 分离热/冷数据。
 * @param {Array} entries - 全量 entries
 * @param {Array} mainAgentSessions - 全量 sessions
 * @param {Array} sessionIndex - buildSessionIndex 的输出
 * @param {number} hotCount - 热 session 数量
 * @param {Set} pinnedSessionIds - 强制为热的 sessionId 集合（不参与淘汰）
 * @returns {{ hotEntries, allSessions, coldGroups: Map<string, Array> }}
 */
export function splitHotCold(entries, mainAgentSessions, sessionIndex, hotCount, pinnedSessionIds = new Set()) {
  const totalSessions = sessionIndex.length;
  if (totalSessions <= hotCount) {
    return { hotEntries: entries, allSessions: mainAgentSessions, coldGroups: new Map() };
  }

  // 计算哪些 sessionId 是热的：最新 hotCount 个 + pinned
  // sessionIndex 按顺序排列，最新的在末尾
  const hotSessionIds = new Set(pinnedSessionIds);
  // 从末尾开始填充热 slot，跳过已 pinned 的
  let remaining = hotCount - hotSessionIds.size;
  for (let i = sessionIndex.length - 1; i >= 0 && remaining > 0; i--) {
    const sid = sessionIndex[i].sessionId;
    if (!hotSessionIds.has(sid)) {
      hotSessionIds.add(sid);
      remaining--;
    }
  }

  // 分离 entries
  const hotEntries = [];
  const coldGroups = new Map();
  for (const entry of entries) {
    if (hotSessionIds.has(entry._sessionId)) {
      hotEntries.push(entry);
    } else {
      let group = coldGroups.get(entry._sessionId);
      if (!group) {
        group = [];
        coldGroups.set(entry._sessionId, group);
      }
      group.push(entry);
    }
  }

  // 构建 allSessions：冷 session 替换为占位符
  const allSessions = mainAgentSessions.map((session, i) => {
    const meta = sessionIndex[i];
    const sid = meta?.sessionId;
    if (sid && !hotSessionIds.has(sid)) {
      return {
        _cold: true,
        sessionId: sid,
        preview: meta.preview,
        msgCount: meta.msgCount,
        firstTs: meta.firstTs,
        lastTs: meta.lastTs,
        userId: meta.userId,
        messages: null,
        response: null,
        entryTimestamp: meta.lastTs,
      };
    }
    return session;
  });

  return { hotEntries, allSessions, coldGroups };
}

/**
 * 合并两个 sessionIndex（用于 loadMoreHistory 后合并旧索引和新索引）。
 * 策略：新索引完全覆盖重叠的 sessionId，旧索引中不在新索引范围内的保留。
 * @param {Array} oldIndex - 旧索引（可能包含更早的 cold session 信息）
 * @param {Array} newIndex - 新索引（从最新的 merged entries 构建）
 * @returns {Array} 合并后的完整索引
 */
export function mergeSessionIndices(oldIndex, newIndex) {
  if (!oldIndex || oldIndex.length === 0) return newIndex || [];
  if (!newIndex || newIndex.length === 0) return oldIndex;

  // 新索引覆盖的 sessionId 范围
  const newIdSet = new Set(newIndex.map(s => s.sessionId));

  // 从旧索引中保留不在新索引范围内的条目
  const merged = [];
  for (const item of oldIndex) {
    if (!newIdSet.has(item.sessionId)) {
      merged.push(item);
    }
  }

  // 添加新索引的所有条目
  for (const item of newIndex) {
    merged.push(item);
  }

  // 按 sessionId (timestamp string) 排序
  merged.sort((a, b) => {
    if (a.sessionId === b.sessionId) return 0;
    if (a.sessionId == null) return -1;
    if (b.sessionId == null) return 1;
    return a.sessionId < b.sessionId ? -1 : 1;
  });

  return merged;
}

/**
 * 信号驱动的 in-place last-msg replace 短路。
 *
 * ─── 双方协议（KEEP IN SYNC: interceptor.js:644 / lib/interceptor-core.js:fingerprintMsg） ───
 * 服务端 interceptor Plan C 在 wire 上检测到 mainAgent messages.length 不变但末位 fp 变化
 * （典型：CLI idle 注入 SUGGESTION MODE 末位 → 用户敲入真实输入替换）时，强制写
 * `_isCheckpoint: true` + `_inPlaceReplaceDetected: true` 完整 entry。
 * 本 helper 是该信号在客户端的唯一消费方。如果 interceptor 端字段重命名 / 删除 / 语义改变，
 * 必须同步本 helper（搜 `_inPlaceReplaceDetected` 跨两端）+ 更新本注释 + 跑
 * test/interceptor-delta-tail-fp.test.js + test/session-manager.test.js 双端回归。
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * 客户端 sessionMerge 的 prefix-overlap 算法（src/utils/sessionMerge.js:113）在该场景下必然误判：
 * newLen===currentLen + 末位 fp 异 → maxOv = newLen - 1 永远找不到 K=newLen 的全等匹配 →
 * overlap=0 → push 整段 newMessages → lastSession.messages 长度翻倍（doubled-history BUG）。
 *
 * 修法：直接消费服务端明确信号，不走 sessionMerge 启发式算法。命中时构造新 lastSession，前
 * N-1 条 message 元素引用复用（保留 _timestamp / _generatedTs 等所有 metadata），末位用
 * entry.body.messages[N-1]。返回 `{ applied: true, sessions }` 表示已短路；未命中返回
 * `{ applied: false }`，调用方走原 mergeMainAgentSessions 路径。
 *
 * 防回归（避开 1.6.249 拆 Layer 2 的两个坑）：
 *   - 不靠客户端 fp 启发式判断（直接看服务端明确信号 _inPlaceReplaceDetected:true）
 *   - 不覆盖整个 lastSession.messages（只替末位，保留前 N-1 引用）
 *
 * 守卫顺序（异常入参逐级 fallback 给 mergeMainAgentSessions 处理）：
 *   1. 信号未命中（_inPlaceReplaceDetected/_isCheckpoint 非 true）
 *   2. isNewSession（新 session 起点不应原地替换旧 session 末位）
 *   3. prevSessions / lastSession.messages 异常
 *   4. entry.body.messages 缺失
 *   5. N < 2（只有 1 条消息时 "前 N-1 条" 退化为空，等价完全替换 → 让原路径处理更安全）
 *   6. messages.length 与 lastSession.messages.length 不等
 *   7. entry.response 缺失（inProgress 状态不应被信号触发；服务端 Plan C 仅在 completed 写信号，
 *      此守卫是 belt+suspenders 防协议变化导致丢失 response 字段污染下游 ChatView Last Response）
 *
 * @param {Array} prevSessions
 * @param {object} entry — mainAgent entry，需含 _inPlaceReplaceDetected / _isCheckpoint / body.messages
 * @param {string} timestamp — entry 的 timestamp（用于赋新末位 message 的 _timestamp）
 * @param {boolean} isNewSession — 是否新 session 起点（true 时不短路，让原路径处理）
 * @returns {{ applied: boolean, sessions?: Array }}
 */
export function applyInPlaceLastMsgReplace(prevSessions, entry, timestamp, isNewSession) {
  // 老 jsonl 兼容策略：1.6.250 之前 / 1.6.250 ship 后 interceptor 漏检 race 期间写入的
  // entry 不会带 `_inPlaceReplaceDetected` 字段，本 helper 直接 fallback。客户端不做"事后
  // 回填"——已污染的 mainAgentSessions 内存翻倍只能靠用户刷新浏览器重读 jsonl 全量重建
  // 来清理（重建路径用 sessionMerge prefix-overlap，此时旧 entry 都已乱序到位，不会再翻倍）。
  if (!entry || entry._inPlaceReplaceDetected !== true || entry._isCheckpoint !== true) {
    return { applied: false };
  }
  if (isNewSession) return { applied: false };
  if (!Array.isArray(prevSessions) || prevSessions.length === 0) return { applied: false };
  const lastSession = prevSessions[prevSessions.length - 1];
  if (!lastSession || !Array.isArray(lastSession.messages)) return { applied: false };
  const messages = entry.body && Array.isArray(entry.body.messages) ? entry.body.messages : null;
  if (!messages || messages.length < 2) return { applied: false };
  if (messages.length !== lastSession.messages.length) return { applied: false };
  // entry.response 缺失（inProgress 等异常）→ fallback，避免 newLastSession.response=undefined
  // 污染下游 ChatView Last Response 渲染。服务端 Plan C 仅在 completed 写信号，正常情况这条守卫
  // 不会命中；保留作为协议变更时的防御层。
  if (!entry.response) return { applied: false };

  const N = messages.length;
  const stitched = lastSession.messages.slice(0, N - 1);
  const newLastMsg = messages[N - 1];
  if (newLastMsg && !newLastMsg._timestamp) newLastMsg._timestamp = timestamp;
  stitched.push(newLastMsg);
  const newLastSession = {
    userId: lastSession.userId,
    messages: stitched,
    response: entry.response,
    entryTimestamp: timestamp,
  };
  // 末位替换：返回新 sessions 数组保持原顺序、prev 长度不变。
  // 下游 ChatView _sessionItemCache[last] 按 index 索引该 session，依赖 index 恒定不能错位。
  return { applied: true, sessions: [...prevSessions.slice(0, -1), newLastSession] };
}
