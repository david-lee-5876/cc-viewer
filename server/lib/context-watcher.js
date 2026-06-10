import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getClaudeConfigDir } from '../../findcc.js';

export const CONTEXT_WINDOW_FILE = join(getClaudeConfigDir(), 'context-window.json');
export const CLAUDE_SETTINGS_FILE = join(getClaudeConfigDir(), 'settings.json');
// ~/.claude.json 是 claude code 的主配置（非 settings.json），存 projects[cwd].lastModelUsage
// 等。两者命名相似但层级和内容完全不同，不要混用。
export const CLAUDE_USER_CONFIG_FILE = join(homedir(), '.claude.json');

// Startup cache: read once, never re-read unless model changes
let _startupModelBase = null;   // e.g. 'opus-4-6'
let _startupContextSize = null; // e.g. 1000000

/**
 * Read context-window.json once at startup and cache model→size mapping.
 * Extracts model base name (e.g. 'opus-4-6') and context size from model.id (e.g. 'claude-opus-4-6[1m]').
 * @returns {{ modelId: string|null, contextSize: number }}
 */
export function readModelContextSize() {
  try {
    if (!existsSync(CONTEXT_WINDOW_FILE)) return { modelId: null, contextSize: 200000 };
    const raw = readFileSync(CONTEXT_WINDOW_FILE, 'utf-8');
    const data = JSON.parse(raw);
    const modelId = data?.model?.id || null;
    let contextSize = 200000;
    if (modelId) {
      const lower = modelId.toLowerCase();
      const sizeMatch = lower.match(/\[(\d+)([km])\]/);
      if (sizeMatch) {
        const num = parseInt(sizeMatch[1], 10);
        contextSize = sizeMatch[2] === 'm' ? num * 1000000 : num * 1000;
      } else if (/opus|mythons|fable[ -]5/i.test(lower)) {
        // Opus / mythons / fable-5 family models default to 1M context
        contextSize = 1000000;
      }
      // Cache the base name → size mapping
      const base = lower.replace(/^claude-/i, '').replace(/\[.*\]/, '').trim();
      _startupModelBase = base;
      _startupContextSize = contextSize;
    }
    return { modelId, contextSize };
  } catch {
    return { modelId: null, contextSize: 200000 };
  }
}

/**
 * Get context size for a given API model name (e.g. 'claude-opus-4-6-20250514').
 * Uses startup cache to avoid re-reading the file.
 * @param {string} apiModelName - model name from req.body.model
 * @returns {number} context window size in tokens
 */
export function getContextSizeForModel(apiModelName) {
  if (!apiModelName) return _startupContextSize || 200000;
  const lower = apiModelName.toLowerCase();
  // Extract base: 'claude-opus-4-6-20250514' → 'opus-4-6'
  const base = lower.replace(/^claude-/i, '').replace(/-\d{8}$/, '').trim();
  // Match against startup cache
  if (_startupModelBase && base === _startupModelBase) {
    return _startupContextSize;
  }
  // Opus / mythons / fable-5 family always have 1M context; other unknown models default to 200K
  if (/opus|mythons|fable[ -]5/i.test(lower)) return 1000000;
  return 200000;
}

/**
 * 读 ~/.claude.json 里 projects[cwd].lastModelUsage，挑出 cwd 下"用得最多/最显式"的模型。
 * 给 cc-viewer UI 血条 calibration 在启动期(lastMainAgent 仅有 haiku init ping 时)
 * 提供一个比"auto → 200K"更贴合 claude 自己默认行为的兜底。
 *
 * lastModelUsage 结构：{ [modelId]: { costUSD, inputTokens, outputTokens, ... } }
 * 没有 timestamp 字段（claude code 只累加 usage 不打时间戳），所以"最近"用以下代理：
 *   1) 去掉 haiku-*（辅助模型，从来不是主 model）
 *   2) 任一带 [1m] 后缀 → 直接返回（用户显式 opt-in 1M context 的强信号）
 *   3) 否则按 costUSD 倒序，取第一（用得最多 ≈ 当前主用）
 *
 * 任何 IO / 解析异常返回 null；调用方应当作"没找到偏好"处理（auto 走冷启动 1M）。
 *
 * @param {string} cwd - 绝对路径，必须与 claude 写入 ~/.claude.json projects key 完全一致
 * @param {string} [filePath] - 可选注入文件路径，默认 CLAUDE_USER_CONFIG_FILE；单测用
 * @returns {string|null} model id（含 [1m] 后缀，例 "claude-opus-4-7[1m]"）或 null
 */
export function readClaudeProjectModel(cwd, filePath = CLAUDE_USER_CONFIG_FILE) {
  try {
    if (!cwd || typeof cwd !== 'string') return null;
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    const lmu = data?.projects?.[cwd]?.lastModelUsage;
    if (!lmu || typeof lmu !== 'object') return null;
    const entries = Object.entries(lmu).filter(([k]) => typeof k === 'string' && !/haiku/i.test(k));
    if (!entries.length) return null;
    const withOneM = entries.find(([k]) => /\[1m\]/i.test(k));
    if (withOneM) return withOneM[0];
    entries.sort((a, b) => (b[1]?.costUSD || 0) - (a[1]?.costUSD || 0));
    return entries[0][0];
  } catch {
    return null;
  }
}

/**
 * Build a context_window SSE event payload from API usage data.
 * @param {object} usage - API response usage object
 * @param {number} contextSize - total context window size in tokens
 * @returns {object|null} context_window event data, or null if usage missing
 */
export function buildContextWindowEvent(usage, contextSize) {
  if (!usage) return null;
  const inputTokens = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  const outputTokens = usage.output_tokens || 0;
  const totalTokens = inputTokens + outputTokens;
  // 自适应纠偏:真正的 200K 模型输入上下文(input+cache)不可能 > 200K(超了 API 拒收),
  // 一旦越过整窗还判成 200K,必是 model 名识别错 → 升 1M,使 used_percentage / size 不再失真。
  // 与 src/utils/helpers.js 的 adaptContextWindow 同一规则(此处服务端无法 import 前端模块,内联)。
  const effectiveSize = (contextSize === 200000 && inputTokens > 200000) ? 1000000 : contextSize;
  const usedPct = Math.round((totalTokens / effectiveSize) * 100);
  return {
    total_input_tokens: inputTokens,
    total_output_tokens: outputTokens,
    context_window_size: effectiveSize,
    current_usage: usage,
    used_percentage: usedPct,
    remaining_percentage: 100 - usedPct,
  };
}
