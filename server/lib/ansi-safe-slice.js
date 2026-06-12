/**
 * 在输出缓冲区从头部截断时，找到安全的截断起点，
 * 避免切片落在 ANSI 转义序列中间——丢掉 ESC[ 前缀后剩余字节
 * 会被 xterm.js 当普通文本渲染（表现为 `[9m`、`?2026l`、`6;136;136m` 类乱码）。
 *
 * 算法：从 rawStart 向后扫描，锚到下一个无歧义的解析重启点：
 * - 硬锚点 ESC (0x1b)：从 ESC 起始永远是合法序列起点（CSI/SGR/OSC/DCS 通吃）；
 *   最坏情况锚到 OSC 终止符 ST（ESC \）自身，ground state 下是无害 no-op。
 * - 软锚点 LF (0x0a)：仅当窗口内无 ESC 时使用（纯文本流如 shell 日志），
 *   返回 LF 之后的位置。不与 ESC 平级是因为 OSC payload 理论上可含 LF。
 * - 都没有且窗口未覆盖尾部：返回 scanLimit（多丢 ≤scanWindow 字节，发生在
 *   滚动缓冲头部，可忽略）。
 * - 都没有且窗口覆盖尾部：回看一小窗判断 rawStart 是否落在某 CSI/OSC 内部
 *   （前方无 ESC/LF 意味着该序列的终止符只能在 rawStart 之后）——是则前跳到
 *   终止符之后，否则返回 rawStart——绝不清空保留数据（洪泛限流的 last-wins
 *   语义依赖这一点）。fallback 起点若落在 UTF-16 低代理上则 +1，避免孤儿化
 *   代理对（高代理起点配对仍完整，无需处理）。
 *
 * 注意：只保 ANSI 序列边界，不保 DEC 2026 同步标记的配对——头部截断只可能
 * 孤儿化 END（?2026l，xterm 下无害 no-op），不可能产生无 END 的 BEGIN；
 * 跨 2026 块截断的配平由调用方负责（见 pty-flood-coalescer.js 的标记剥离）。
 */
const DEFAULT_SCAN_WINDOW = 4096;
const BACK_SCAN = 64;

export function findSafeSliceStart(buf, rawStart, scanWindow = DEFAULT_SCAN_WINDOW) {
  if (rawStart <= 0) return 0;
  if (rawStart >= buf.length) return buf.length;
  const scanLimit = Math.min(rawStart + scanWindow, buf.length);
  let afterLf = -1;
  for (let i = rawStart; i < scanLimit; i++) {
    const ch = buf.charCodeAt(i);
    if (ch === 0x1b) return i;
    if (ch === 0x0a && afterLf === -1) afterLf = i + 1;
  }
  if (afterLf !== -1) return afterLf;
  const idx = scanLimit >= buf.length ? resolveInSequence(buf, rawStart) : scanLimit;
  const c = buf.charCodeAt(idx);
  return (c >= 0xdc00 && c <= 0xdfff) ? idx + 1 : idx;
}

// 前向无任何锚点时的兜底：回看 BACK_SCAN 字节找最近的 ESC，判断 rawStart 是否
// 正落在它引导的 CSI/OSC 内部（引导符与 rawStart 之间无终止符），是则前跳过终止符。
// 注意调用前提：rawStart 之后整个 buf 内都没有 ESC（前向扫描已覆盖到结尾），
// 所以 OSC 只需考虑 BEL 终止形态（ESC\ 形态会被前向锚点拦下，到不了这里）。
function resolveInSequence(buf, rawStart) {
  const backStop = Math.max(0, rawStart - BACK_SCAN);
  for (let k = rawStart - 1; k >= backStop; k--) {
    if (buf.charCodeAt(k) !== 0x1b) continue;
    const intro = buf.charCodeAt(k + 1);
    if (intro === 0x5b) { // CSI：终止符为 0x40-0x7e（引导符之后起算）
      for (let j = k + 2; j < rawStart; j++) {
        const cj = buf.charCodeAt(j);
        if (cj >= 0x40 && cj <= 0x7e) return rawStart; // 序列已终结，rawStart 在纯文本里
      }
      for (let j = Math.max(rawStart, k + 2); j < buf.length; j++) {
        const cj = buf.charCodeAt(j);
        if (cj >= 0x40 && cj <= 0x7e) return j + 1;
      }
      // 序列到结尾仍未终结（还在被 PTY 续写）：保留半截序列头，等续写补全；
      // 若改为丢弃，下一 chunk 送来的序列尾会变成新的孤儿残片。
      return k;
    }
    if (intro === 0x5d) { // OSC：BEL 终止
      for (let j = k + 2; j < rawStart; j++) {
        if (buf.charCodeAt(j) === 0x07) return rawStart;
      }
      for (let j = Math.max(rawStart, k + 2); j < buf.length; j++) {
        if (buf.charCodeAt(j) === 0x07) return j + 1;
      }
      return k;
    }
    return rawStart; // 其他短转义（charset 切换等）≤3 字节，rawStart 已在其后
  }
  return rawStart; // 回看窗口内无 ESC：rawStart 在纯文本里
}
