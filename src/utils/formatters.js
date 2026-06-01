// 共享展示格式化工具。
// formatSize 用 4 档 (B/KB/MB/GB) — 与 WorkspaceList 旧版语义一致，覆盖原 LogTable 的 3 档版本。
// formatTimestamp 接 cc-viewer 日志 ts 字符串 (YYYYMMDD_HHMMSS...)；mobile=true 时省略年份。
export function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatTimestamp(ts, mobile) {
  if (!ts || ts.length < 15) return ts;
  if (mobile) return `${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}`;
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}`;
}

// formatPromptNavTime 接 ISO 8601 / Date-可解析字符串（消息的 _timestamp，如 ChatView 用户 Prompt
// 导航传入的 props.timestamp），输出本地时区的 "MM-DD HH:MM:SS"。缺失/非法 → ''。
// ⚠ 格式须与 ChatMessage.formatTime 的「完整模式」分支保持一致（导航时间要和气泡时间相同）；
//   改其一须同步另一处。见 src/components/chat/ChatMessage.jsx formatTime。
export function formatPromptNavTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  } catch { return ''; }
}
