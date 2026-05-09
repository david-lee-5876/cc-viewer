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
