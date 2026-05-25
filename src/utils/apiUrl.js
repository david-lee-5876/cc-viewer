// 从 URL 中提取 LAN 访问 token，附加到所有 API 请求 / WebSocket 握手
const _urlToken = new URLSearchParams(window.location.search).get('token');

// 把 token 追加到任意 URL（HTTP path 或 ws:// 完整 URL 皆可）。无 token 时原样返回。
// WS 握手必须也带 token —— 否则启用鉴权后远程「?token=」终端会被 socket.destroy()。
export function appendToken(url) {
  if (!_urlToken) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${_urlToken}`;
}

export function apiUrl(path) {
  return appendToken(path);
}
