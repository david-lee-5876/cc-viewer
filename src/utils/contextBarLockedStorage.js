// /clear 后 contextBarLocked 的 sessionStorage 持久化。
// 没这一步刷新页面会丢 state，但 requests[] 里还残留 pre-clear tokens，血条会弹回旧水位。
// 按 projectName 拆 key 防多项目串扰；空名跳过读写；私模 / quota 异常由 try/catch 兜底。
//
// 解锁路径：① ChatView 发出非 /clear 消息（handleUserMessageSent）；
// ② SSE load_end 增量模式回报有新 entry（AppBase 在 load_end handler 里直接解锁）。
// 第二条路径覆盖 mainAgent 已有新请求但 ChatView 没人在打字（终端 pty、工具回流等）的场景。

const KEY_PREFIX = 'ccv_contextBarLocked:';

function keyFor(projectName) {
  if (!projectName || typeof projectName !== 'string') return null;
  return KEY_PREFIX + projectName;
}

export function loadContextBarLocked(projectName) {
  const key = keyFor(projectName);
  if (!key) return false;
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function saveContextBarLocked(projectName, locked) {
  const key = keyFor(projectName);
  if (!key) return;
  try {
    // false 走 removeItem，避免孤儿 entry，与 load 的"无值 → false"语义对齐。
    if (!locked) {
      sessionStorage.removeItem(key);
      return;
    }
    sessionStorage.setItem(key, '1');
  } catch {
    /* private mode / quota — 忽略 */
  }
}
