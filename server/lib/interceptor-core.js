import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { renameSyncWithRetry } from './file-api.js';
import { join } from 'node:path';

const SUBAGENT_SYSTEM_RE = /(?:command execution|file search|planning) specialist|general-purpose agent|security monitor|performing a web search/i;

// cc_version 2.1.181+：CLI 在 billing header 显式标注子代理（cc_is_subagent=true）；真·主代理省略此字段（从不为 =false）。
// 这类子代理继承完整 "You are Claude Code" prompt + Edit/Bash/Agent 工具，会误中轻量 MainAgent 启发式，故须显式排除。
// 结尾 \b 锚定：仅匹配 `=true`（其后为 `;` / 空白 / 串尾），避免 `=truex` 之类误匹配。
const SUBAGENT_BILLING_RE = /cc_is_subagent=true\b/;

export function getSystemText(body) {
  const system = body?.system;
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) {
    return system.map(s => (s && s.text) || '').join('');
  }
  return '';
}

export function isMainAgentRequest(body) {
  if (!body?.system || !Array.isArray(body?.tools)) return false;

  const sysText = getSystemText(body);
  // cc_is_subagent=true ⇒ 子代理，绝非 MainAgent（cc_version 2.1.181+）。从源头让新日志的 mainAgent 字段为 false。
  if (SUBAGENT_BILLING_RE.test(sysText)) return false;
  if (!sysText.includes('You are Claude Code')) return false;
  if (SUBAGENT_SYSTEM_RE.test(sysText)) return false;

  const isSystemArray = Array.isArray(body.system);
  const hasToolSearch = body.tools.some(t => t.name === 'ToolSearch');

  if (isSystemArray && hasToolSearch) {
    const messages = body.messages || [];
    const firstMsgContent = messages.length > 0 ?
      (typeof messages[0].content === 'string' ? messages[0].content :
        Array.isArray(messages[0].content) ? messages[0].content.map(c => c.text || '').join('') : '') : '';
    if (firstMsgContent.includes('<available-deferred-tools>')) {
      return true;
    }
  }

  // v2.1.81+: 轻量 MainAgent 初始请求工具数可能 < 10，降低阈值兼容
  if (body.tools.length > 5) {
    const hasEdit = body.tools.some(t => t.name === 'Edit');
    const hasShell = body.tools.some(t => t.name === 'Bash' || t.name === 'PowerShell');
    const hasTaskOrAgent = body.tools.some(t => t.name === 'Task' || t.name === 'Agent');
    if (hasEdit && hasShell && hasTaskOrAgent) {
      return true;
    }
  }

  return false;
}

export function isPreflightEntry(entry) {
  if (entry.mainAgent || entry.isHeartbeat || entry.isCountTokens) return false;
  const body = entry.body || {};
  if (Array.isArray(body.tools) && body.tools.length > 0) return false;
  const msgs = body.messages || [];
  if (msgs.length !== 1 || msgs[0].role !== 'user') return false;
  const sysText = typeof body.system === 'string' ? body.system :
    Array.isArray(body.system) ? body.system.map(s => s?.text || '').join('') : '';
  return sysText.includes('Claude Code');
}

export function isAnthropicApiPath(urlStr) {
  try {
    const pathname = new URL(urlStr).pathname;
    // 不锚定起始 —— 兼容代理前缀路径（如 /proxy/group_xxx:8100/v1/messages）。
    // 末尾仍然锚定以避免 /v1/messages/unknown 这类无效后缀误命中。
    return /\/v1\/messages(\/count_tokens|\/batches(\/.*)?)?$/.test(pathname)
      || /^\/api\/eval\/sdk-/.test(pathname);
  } catch {
    return /\/v1\/messages/.test(urlStr);
  }
}

export function assembleStreamMessage(events) {
  let message = null;
  const contentBlocks = [];
  let currentBlockIndex = -1;

  for (const event of events) {
    if (!event || typeof event !== 'object' || !event.type) continue;

    switch (event.type) {
      case 'message_start':
        message = { ...event.message };
        message.content = [];
        break;

      case 'content_block_start':
        currentBlockIndex = event.index;
        contentBlocks[currentBlockIndex] = { ...event.content_block };
        if (contentBlocks[currentBlockIndex].type === 'text') {
          contentBlocks[currentBlockIndex].text = '';
        } else if (contentBlocks[currentBlockIndex].type === 'thinking') {
          contentBlocks[currentBlockIndex].thinking = '';
        }
        break;

      case 'content_block_delta':
        if (event.index >= 0 && contentBlocks[event.index] && event.delta) {
          if (event.delta.type === 'text_delta' && event.delta.text) {
            contentBlocks[event.index].text += event.delta.text;
          } else if (event.delta.type === 'input_json_delta' && event.delta.partial_json) {
            if (typeof contentBlocks[event.index]._inputJson !== 'string') {
              contentBlocks[event.index]._inputJson = '';
            }
            contentBlocks[event.index]._inputJson += event.delta.partial_json;
          } else if (event.delta.type === 'thinking_delta' && event.delta.thinking) {
            contentBlocks[event.index].thinking += event.delta.thinking;
          } else if (event.delta.type === 'signature_delta' && event.delta.signature) {
            contentBlocks[event.index].signature = event.delta.signature;
          }
        }
        break;

      case 'content_block_stop':
        if (event.index >= 0 && contentBlocks[event.index]) {
          if (contentBlocks[event.index].type === 'tool_use' && typeof contentBlocks[event.index]._inputJson === 'string') {
            try {
              contentBlocks[event.index].input = JSON.parse(contentBlocks[event.index]._inputJson);
            } catch {
              contentBlocks[event.index].input = contentBlocks[event.index]._inputJson;
            }
            delete contentBlocks[event.index]._inputJson;
          }
        }
        break;

      case 'message_delta':
        if (message && event.delta) {
          if (event.delta.stop_reason) {
            message.stop_reason = event.delta.stop_reason;
          }
          if (event.delta.stop_sequence !== undefined) {
            message.stop_sequence = event.delta.stop_sequence;
          }
        }
        if (message && event.usage) {
          message.usage = { ...message.usage, ...event.usage };
        }
        break;

      case 'message_stop':
        break;
    }
  }

  if (message) {
    message.content = contentBlocks.filter(block => block !== undefined);
  }

  return message;
}

/**
 * Incremental stream assembler — mutable state for SSE live streaming.
 *
 * Usage:
 *   const asm = createStreamAssembler();
 *   asm.feed(event);          // consume each SSE event incrementally
 *   const snap = asm.snapshot();  // get current partial message
 *
 * Mirrors assembleStreamMessage but maintains mutable state for O(1) updates
 * rather than O(n) rebuild per call.
 */
export function createStreamAssembler() {
  let message = null;
  const contentBlocks = [];
  let currentBlockIndex = -1;

  return {
    feed(event) {
      if (!event || typeof event !== 'object' || !event.type) return;
      switch (event.type) {
        case 'message_start':
          message = { ...event.message };
          message.content = [];
          break;
        case 'content_block_start':
          currentBlockIndex = event.index;
          contentBlocks[currentBlockIndex] = { ...event.content_block };
          if (contentBlocks[currentBlockIndex].type === 'text') {
            contentBlocks[currentBlockIndex].text = '';
          } else if (contentBlocks[currentBlockIndex].type === 'thinking') {
            contentBlocks[currentBlockIndex].thinking = '';
          }
          break;
        case 'content_block_delta':
          if (event.index >= 0 && contentBlocks[event.index] && event.delta) {
            if (event.delta.type === 'text_delta' && event.delta.text) {
              contentBlocks[event.index].text += event.delta.text;
            } else if (event.delta.type === 'input_json_delta' && event.delta.partial_json) {
              if (typeof contentBlocks[event.index]._inputJson !== 'string') {
                contentBlocks[event.index]._inputJson = '';
              }
              contentBlocks[event.index]._inputJson += event.delta.partial_json;
            } else if (event.delta.type === 'thinking_delta' && event.delta.thinking) {
              contentBlocks[event.index].thinking += event.delta.thinking;
            } else if (event.delta.type === 'signature_delta' && event.delta.signature) {
              contentBlocks[event.index].signature = event.delta.signature;
            }
          }
          break;
        case 'content_block_stop':
          if (event.index >= 0 && contentBlocks[event.index]) {
            const blk = contentBlocks[event.index];
            if (blk.type === 'tool_use' && typeof blk._inputJson === 'string') {
              try { blk.input = JSON.parse(blk._inputJson); }
              catch { blk.input = blk._inputJson; }
              delete blk._inputJson;
            }
          }
          break;
        case 'message_delta':
          if (message && event.delta) {
            if (event.delta.stop_reason) message.stop_reason = event.delta.stop_reason;
            if (event.delta.stop_sequence !== undefined) message.stop_sequence = event.delta.stop_sequence;
          }
          if (message && event.usage) message.usage = { ...message.usage, ...event.usage };
          break;
      }
    },
    /**
     * Return a snapshot of the current message state.
     * For incomplete tool_use blocks (no content_block_stop yet), input is undefined
     * and _inputJsonPartial carries the raw accumulated string.
     * Deep clones to avoid mutation during live streaming.
     */
    snapshot() {
      if (!message) return null;
      const snapBlocks = [];
      for (let i = 0; i < contentBlocks.length; i++) {
        const b = contentBlocks[i];
        if (!b) continue;
        const clone = { ...b };
        if (b.type === 'tool_use' && typeof b._inputJson === 'string') {
          // Partial JSON - don't parse, expose as raw for UI hint
          clone._inputJsonPartial = b._inputJson;
          clone.input = undefined;
          delete clone._inputJson;
        }
        snapBlocks.push(clone);
      }
      return { ...message, content: snapBlocks };
    },
    hasMessage() { return message !== null; },
  };
}

export function findRecentLog(dir, projectName) {
  try {
    const files = readdirSync(dir)
      // 排除 *_temp.jsonl：临时文件是未完成的写入态（resume 流程中途产物），
      // 不应被当作"最近完整日志"（否则 _temp 因 sort 排在正式文件之后会被误选）。
      .filter(f => f.startsWith(projectName + '_') && f.endsWith('.jsonl') && !f.endsWith('_temp.jsonl'))
      .sort()
      .reverse();
    if (files.length === 0) return null;
    return join(dir, files[0]);
  } catch { }
  return null;
}

export function cleanupTempFiles(dir, projectName) {
  try {
    const tempFiles = readdirSync(dir)
      .filter(f => f.startsWith(projectName + '_') && f.endsWith('_temp.jsonl'));
    for (const f of tempFiles) {
      try {
        const tempPath = join(dir, f);
        const newPath = tempPath.replace('_temp.jsonl', '.jsonl');
        if (existsSync(newPath)) {
          const tempContent = readFileSync(tempPath, 'utf-8');
          if (tempContent.trim()) {
            appendFileSync(newPath, tempContent);
          }
          unlinkSync(tempPath);
        } else {
          // 只有非空 temp 文件才 rename，空文件直接删除
          const sz = statSync(tempPath).size;
          if (sz > 0) {
            renameSyncWithRetry(tempPath, newPath);
          } else {
            unlinkSync(tempPath);
          }
        }
      } catch { }
    }
  } catch { }
}

export function migrateConversationContext(oldFile, newFile) {
  try {
    const content = readFileSync(oldFile, 'utf-8');
    if (!content.trim()) return;

    const parts = content.split('\n---\n').filter(p => p.trim());
    if (parts.length === 0) return;

    let originIndex = -1;
    for (let i = parts.length - 1; i >= 0; i--) {
      if (!/"mainAgent"\s*:\s*true/.test(parts[i])) continue;
      try {
        const entry = JSON.parse(parts[i]);
        if (entry.mainAgent) {
          const msgs = entry.body?.messages;
          // Delta storage: 使用 _totalMessageCount（delta 条目）或 msgs.length（旧格式）
          const msgCount = entry._totalMessageCount || (Array.isArray(msgs) ? msgs.length : 0);
          if (msgCount === 1) {
            originIndex = i;
            break;
          }
        }
      } catch { }
    }

    if (originIndex < 0) return;

    let migrationStart = originIndex;
    if (originIndex > 0) {
      try {
        const prevContent = parts[originIndex - 1];
        if (prevContent.trim().startsWith('{')) {
          const prev = JSON.parse(prevContent);
          if (isPreflightEntry(prev)) {
            migrationStart = originIndex - 1;
          }
        }
      } catch { }
    }

    const migratedParts = parts.slice(migrationStart);
    writeFileSync(newFile, migratedParts.join('\n---\n') + '\n---\n');

    const remainingParts = parts.slice(0, migrationStart);
    if (remainingParts.length > 0) {
      writeFileSync(oldFile, remainingParts.join('\n---\n') + '\n---\n');
    } else {
      // 所有内容已迁移到新文件，清空旧文件（不能删除，watcher 需要检测 truncation 来触发轮转）
      writeFileSync(oldFile, '');
    }
  } catch { }
}

/**
 * 计算单条 message 的轻量身份指纹，用于 delta storage 的 in-place last-msg replace 检测。
 * 仅服务端 interceptor 使用 —— 触发 Plan C checkpoint 让客户端拿到 wire 真实内容。
 * 历史上客户端 sessionManager.js 也复用过此算法做 isInPlaceLastMsgReplace 短路，
 * 后被拆除（因 short-circuit 导致 same-ts 多记录被合并）；现单层防御仅靠服务端。
 *
 * 80 字符前缀 + tool_use_id 后 8 字符 + tool_result body 下钻取真实文本（避开 String(array)
 * 塌陷成 "[object Object]" 的 collision 坑）。
 */
export function fingerprintMsg(m) {
  if (!m) return '';
  const c = m.content;
  let snip = '';
  if (Array.isArray(c) && c.length > 0) {
    const f = c[0];
    if (f && typeof f === 'object') {
      if (f.type === 'text') {
        snip = String(f.text || '').slice(0, 80);
      } else if (f.type === 'tool_use') {
        snip = '<tool_use:' + (f.name || '?') + ':' + (f.id || '').slice(-8) + '>';
      } else if (f.type === 'tool_result') {
        let body = '';
        if (typeof f.content === 'string') body = f.content;
        else if (Array.isArray(f.content) && f.content[0]) {
          const cf = f.content[0];
          body = (typeof cf === 'string') ? cf : (cf.text || cf.type || '');
        }
        snip = '<tool_result:' + (f.tool_use_id || '').slice(-8) + ':' + String(body).slice(0, 40) + '>';
      } else {
        snip = '<' + (f.type || '?') + '>';
      }
    }
  } else if (typeof c === 'string') {
    snip = c.slice(0, 80);
  }
  return (m.role || '?') + ':' + snip.replace(/\s+/g, ' ').slice(0, 80);
}

/**
 * Rotate log file when it exceeds maxSize.
 * Creates an empty new file (no content migration) and appends '\n' to old file
 * to trigger fs.watchFile callback for watcher migration.
 *
 * @param {string} currentFile - current log file path
 * @param {string} newFile - new log file path to rotate to
 * @param {number} maxSize - max file size in bytes
 * @returns {{ rotated: boolean, oldFile?: string, newFile?: string }}
 */
export function rotateLogFile(currentFile, newFile, maxSize) {
  try {
    if (!existsSync(currentFile)) return { rotated: false };
    const size = statSync(currentFile).size;
    if (size < maxSize) return { rotated: false };
    // 不迁移旧内容，创建空新文件（立即创建，避免 watcher 时序窗口）
    try { writeFileSync(newFile, ''); } catch { }
    // 触发旧文件 watcher 回调，使其检测到文件变更并切换到新文件
    try { appendFileSync(currentFile, '\n'); } catch { }
    return { rotated: true, oldFile: currentFile, newFile };
  } catch { }
  return { rotated: false };
}

/**
 * 在原始 JSON 字符串上定向替换顶层 "model" 字段的值，避免对巨型 wire body
 * （`-c` 重启后的全量 checkpoint 请求可达数十 MB）做二次 JSON.parse + 全量 re-stringify。
 *
 * 安全性依据：
 * - JSON 字符串值内的引号必然转义为 \"，裸 `"model":"<old>"` 字节序列只能出现在真实结构处；
 * - 候选必须满足成员边界（前一个非空白字符是 `{` 或 `,`）；
 * - 顶层 model 恒存在恒命中 → 嵌套对象若有同值 model 键则候选 ≥2 → 返回 null 由调用方
 *   回退 parse/stringify 旧路径（最坏退化为现状，绝不误改）。
 *
 * @param {string} jsonStr - 原始 wire body（紧凑或带单空格的 JSON 字符串）
 * @param {string} oldModel - 当前顶层 model 值（来自已解析的 body.model）
 * @param {string} newModel - 目标 model 值
 * @returns {string|null} 替换后的字符串；无法唯一定位时返回 null（调用方回退）
 */
export function replaceTopLevelModel(jsonStr, oldModel, newModel) {
  if (typeof jsonStr !== 'string' || typeof oldModel !== 'string' || !oldModel ||
      typeof newModel !== 'string' || !newModel) return null;
  const oldVal = JSON.stringify(oldModel);
  // 覆盖紧凑（JSON.stringify 默认）与冒号后单空格两种序列化形态；其它形态 → 0 候选 → 回退
  const needles = [`"model":${oldVal}`, `"model": ${oldVal}`];
  const candidates = [];
  for (const needle of needles) {
    let idx = jsonStr.indexOf(needle);
    while (idx !== -1) {
      // 成员边界校验：前一个非空白字符必须是 { 或 ,
      let p = idx - 1;
      while (p >= 0 && (jsonStr[p] === ' ' || jsonStr[p] === '\t' || jsonStr[p] === '\n' || jsonStr[p] === '\r')) p--;
      if (p >= 0 && (jsonStr[p] === '{' || jsonStr[p] === ',')) {
        candidates.push({ idx, needle });
      }
      idx = jsonStr.indexOf(needle, idx + 1);
    }
  }
  if (candidates.length !== 1) return null;
  const { idx, needle } = candidates[0];
  const replaced = needle.slice(0, needle.length - oldVal.length) + JSON.stringify(newModel);
  return jsonStr.slice(0, idx) + replaced + jsonStr.slice(idx + needle.length);
}
