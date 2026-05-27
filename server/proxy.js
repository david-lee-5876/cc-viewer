
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import * as interceptor from './interceptor.js';
import { setupInterceptor } from './interceptor.js';
import { extractApiErrorMessage, formatProxyRequestError } from './lib/proxy-errors.js';
import { getClaudeConfigDir } from '../findcc.js';

// Setup interceptor to patch fetch
setupInterceptor();

// Node bundled undici 在 22.15 之前不识 zstd；上游若选 zstd 压缩，response.body 会被原样
// 透传给 Claude CLI，触发 "Failed to parse JSON"。在转发前从 accept-encoding 摘掉 zstd，
// 让上游回退到 gzip/deflate/br——所有 Node 版本都能正确解。
export function stripZstdAcceptEncoding(headers) {
  if (!headers) return headers;
  const key = Object.keys(headers).find(k => k.toLowerCase() === 'accept-encoding');
  if (!key) return headers;
  const val = headers[key];
  if (typeof val !== 'string' || !/\bzstd\b/i.test(val)) return headers;
  const filtered = val
    .split(',')
    .map(s => s.trim())
    .filter(s => s && !/^zstd(\s*;.*)?$/i.test(s))
    .join(', ');
  return { ...headers, [key]: filtered || 'gzip, deflate, br' };
}

// 代理会改写请求 body（interceptor 的模型替换 JSON.parse→改 model→JSON.stringify），
// 客户端声明的 content-length 随之失真。透传旧值会触发 undici
// UND_ERR_REQ_CONTENT_LENGTH_MISMATCH → 502 → CLI 静默重试退避（表现为请求卡住）。
// 删除该头，交给 undici 按实际 body 重算（已知长度的 Buffer/string 不会退化为 chunked）。
export function stripContentLengthHeader(headers) {
  if (!headers) return headers;
  const key = Object.keys(headers).find(k => k.toLowerCase() === 'content-length');
  if (!key) return headers;
  const { [key]: _omit, ...rest } = headers;
  return rest;
}

function getBaseUrlFromSettings(settingsPath) {
  try {
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      if (settings.env && settings.env.ANTHROPIC_BASE_URL) {
        return settings.env.ANTHROPIC_BASE_URL;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

function getOriginalBaseUrl() {
  // 热切换 profile 最高优先：UI 里用户选中的 baseURL 直接作为上游目标，
  // 让 log/UI 显示的 URL 与实际去向一致，且避免 settings.json 残留的本地
  // 代理 URL（如 127.0.0.1:xxxx）导致 ccv proxy 自环 404。
  // Via namespace import to pick up watchFile 刷新（ES module live binding）。
  const ap = interceptor._activeProfile;
  if (ap && ap.baseURL) return ap.baseURL;

  let cwd;
  try { cwd = process.cwd(); } catch { cwd = null; }

  // Check config files in priority order (highest first)
  const configPaths = [];
  if (cwd) {
    configPaths.push(join(cwd, '.claude', 'settings.local.json'));
    configPaths.push(join(cwd, '.claude', 'settings.json'));
  }
  configPaths.push(join(getClaudeConfigDir(), 'settings.json'));

  for (const configPath of configPaths) {
    const url = getBaseUrlFromSettings(configPath);
    if (url) return url;
  }

  // Check env var
  if (process.env.ANTHROPIC_BASE_URL) {
    return process.env.ANTHROPIC_BASE_URL;
  }

  // Default
  return 'https://api.anthropic.com';
}

export function startProxy() {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const originalBaseUrl = getOriginalBaseUrl();

      // Use the patched fetch (which logs to cc-viewer)
      try {
        // Convert incoming headers
        let headers = { ...req.headers };
        delete headers.host; // Let fetch set the host
        headers = stripZstdAcceptEncoding(headers);
        headers = stripContentLengthHeader(headers); // body 会被改写，旧 content-length 必须丢弃

        const buffers = [];
        for await (const chunk of req) {
          buffers.push(chunk);
        }
        const body = Buffer.concat(buffers);

        const fetchOptions = {
          method: req.method,
          headers: headers,
        };

        // 标记此请求为 CC-Viewer 代理转发的 Claude API 请求
        // 拦截器识别到此 Header 会强制记录，忽略 URL 匹配规则
        fetchOptions.headers['x-cc-viewer-trace'] = 'true';

        if (body.length > 0) {
          fetchOptions.body = body;
        }

        // 拼接完整 URL，保留 originalBaseUrl 中的路径前缀
        const cleanBase = originalBaseUrl.endsWith('/') ? originalBaseUrl.slice(0, -1) : originalBaseUrl;
        const cleanReq = req.url.startsWith('/') ? req.url.slice(1) : req.url;
        const fullUrl = `${cleanBase}/${cleanReq}`;

        const response = await fetch(fullUrl, fetchOptions);

        // fetch 自动解压，需移除编码相关 header 避免客户端重复解压
        const responseHeaders = {};
        for (const [key, value] of response.headers.entries()) {
          // Skip Content-Encoding and Transfer-Encoding to let Node/Client handle it
          if (key.toLowerCase() !== 'content-encoding' && key.toLowerCase() !== 'transfer-encoding' && key.toLowerCase() !== 'content-length') {
            responseHeaders[key] = value;
          }
        }

        // 如果是错误响应，尝试解析并打印具体的错误信息
        if (!response.ok) {
          try {
            const errorText = await response.text();
            if (process.env.CCV_DEBUG) {
              console.error(`[CC-Viewer Proxy] ${extractApiErrorMessage(response.status, errorText)}`);
            }

            res.writeHead(response.status, responseHeaders);
            res.end(errorText);
            return;
          } catch (err) {
            // 读取 body 失败，回退到流式处理
            if (process.env.CCV_DEBUG) {
              console.error('[CC-Viewer Proxy] Failed to read error body:', err);
            }
          }
        }

        res.writeHead(response.status, responseHeaders);

        if (response.body) {
          const { Readable, pipeline } = await import('node:stream');
          // @ts-ignore
          const nodeStream = Readable.fromWeb(response.body);
          // 持久 error handler 兜底：防止 pipeline 清理后延迟到达的 error 事件导致进程崩溃
          nodeStream.on('error', () => {});
          // pipeline handles stream errors; without this, unhandled 'error' events crash the process.
          pipeline(nodeStream, res, (err) => {
            if (err && process.env.CCV_DEBUG) {
              console.error('[CC-Viewer Proxy] Stream pipeline error:', err.message);
            }
          });
        } else {
          res.end();
        }
      } catch (err) {
        // Log proxy errors only when debugging
        if (process.env.CCV_DEBUG) {
          console.error('[CC-Viewer Proxy] Error:', err);
        }

        res.statusCode = 502;
        res.end('Proxy Error');
      }
    });

    // Start on random port
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(address.port);
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}
