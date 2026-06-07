// Preferences, Claude settings, and proxy-profile routes (moved verbatim from server.js).
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { LOG_DIR, setLogDir, getClaudeConfigDir } from '../../findcc.js';
import { PROFILE_PATH, _defaultConfig, getActiveProfileId, setActiveProfileForWorkspace, _loadProxyProfile } from '../interceptor.js';
import { setLang } from '../i18n.js';
import { reconcileVoicePackPrefs as vpReconcile } from '../lib/voice-pack-manager.js';
import { mergeApprovalModalPrefs as vpMergeAM } from '../lib/approval-modal-prefs.js';
import { readClaudeProjectModel } from '../lib/context-watcher.js';
import { sendEventToClients } from '../lib/log-watcher.js';
import { listPlatforms } from '../lib/im-config.js';

// IM bridge configs (dingtalk, feishu, …) carry base64 app secrets and are only exposed via the
// admin-only /api/dingtalk/* and /api/im/* surfaces (with secrets masked). Strip every platform's
// key from any /api/preferences read/write so an authorized LAN client can never see or set them.
function stripImConfigs(obj) {
  if (obj) for (const id of listPlatforms()) delete obj[id];
}

// /theme 选择器特征：选项文案高特异、不太可能出现在普通生成输出里（ESC 兜底的门控签名）
const THEME_PICKER_RE = /Auto \(match terminal\)|colorblind-friendly/;

// 并发切主题防重入：双端同时 POST themeColor 时只允许一条 /theme 同步链路在途，
// 防止双监听器 + 双 /theme 注入 + 双 ESC（后到的 POST 仅落盘偏好，跳过 PTY 同步）。
let _themeSyncInFlight = false;
export function _resetThemeSyncForTests() { _themeSyncInFlight = false; }

function preferencesGet(req, res, parsedUrl, isLocal, deps) {
  let prefs = {};
  try { if (existsSync(deps.getPrefsFile())) prefs = JSON.parse(readFileSync(deps.getPrefsFile(), 'utf-8')); } catch { }
  // auth 配置(含明文密码)与偏好同存于 preferences.json,但绝不能从这里下发 ——
  // 密码仅由 admin-only 的 /api/auth/state 暴露给本机。否则远程密码登录用户也能读到明文。
  // 全局 auth 与每个项目的 authByProject 覆盖都要剥离(后者同样含明文密码)。
  delete prefs.auth;
  delete prefs.authByProject;
  stripImConfigs(prefs); // dingtalk / feishu / … — admin-only, never to a LAN client
  prefs.logDir = LOG_DIR; // 始终返回当前运行时的日志目录
  // 日志设置出厂默认"继承"：键缺失（从未设置过）才注入；显式关闭持久化的是 null（键存在），不覆盖。
  // 虚拟默认 —— 仅注入回包不落盘（GET 不写文件），直接读 preferences.json 的代码看不到该默认。
  if (!('resumeAutoChoice' in prefs)) prefs.resumeAutoChoice = 'continue';
  // home-friendly 展示形态：设了 CLAUDE_CONFIG_DIR 的用户看到真实路径，默认用户看到 "~/.claude"
  // join() 而非字符串拼接，避免 Windows 分隔符不匹配导致比较失败
  const _cDir = getClaudeConfigDir();
  prefs.claudeConfigDir = _cDir === join(homedir(), '.claude') ? '~/.claude' : _cDir;
  // voice-pack id reconcile — strip references to audio files that no longer exist
  // so the client never tries to play a 404. Read-only here; client save path also runs this.
  if (prefs.approvalModal?.voicePack) {
    prefs.approvalModal.voicePack = vpReconcile(LOG_DIR, prefs.approvalModal.voicePack);
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(prefs));
}

function preferencesPost(req, res, parsedUrl, isLocal, deps) {
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > deps.MAX_POST_BODY) req.destroy(); });
  req.on('end', () => {
    try {
      const incoming = JSON.parse(body);
      // auth 只能经 admin-only 的 /api/auth/config 修改;剥掉 incoming.auth 与 incoming.authByProject
      // 防止任意已授权客户端(含远程密码登录用户)借 /api/preferences 改开关/密码、或植入/篡改
      // 任意项目的覆盖,绕过 admin 门禁。
      delete incoming.auth;
      delete incoming.authByProject;
      // IM bridge configs 同理：只能经 admin-only 的 /api/dingtalk/config、/api/im/* 修改，禁止借
      // /api/preferences 植入凭据。
      stripImConfigs(incoming);
      // 如果修改了日志目录，先切换再保存到新位置（新目录下生成 preferences.json）
      if (incoming.logDir && typeof incoming.logDir === 'string') {
        setLogDir(incoming.logDir);
      }
      let prefs = {};
      try { if (existsSync(deps.getPrefsFile())) prefs = JSON.parse(readFileSync(deps.getPrefsFile(), 'utf-8')); } catch { }
      // Deep-merge approvalModal so partial updates (e.g. `{ voicePack: { events: { askQuestion: id } } }`)
      // don't blow away unrelated approval prefs. Shallow Object.assign for everything else.
      const { approvalModal: incAM, ...incRest } = incoming;
      Object.assign(prefs, incRest);
      if (incAM && typeof incAM === 'object') {
        prefs.approvalModal = vpMergeAM(prefs.approvalModal, incAM, {
          reconcile: (vp) => vpReconcile(LOG_DIR, vp),
        });
      }
      // 确保目录存在
      const prefsFile = deps.getPrefsFile();
      const prefsDir = dirname(prefsFile);
      if (!existsSync(prefsDir)) mkdirSync(prefsDir, { recursive: true });
      writeFileSync(prefsFile, JSON.stringify(prefs, null, 2));
      // UI 切语言时同步服务端 i18n currentLang，让 DingTalk 桥接等服务端 t() 立即跟随。
      // setLang 自带 locale 校验，非法值回落 en。
      if (incoming.lang) setLang(incoming.lang);
      // preferences.json 可能携带 auth 的 base64 密码 —— 与 lib/auth.js writePrefs 一致地
      // 重申 0600,避免该路径(无 mode/不 chmod)把密码文件留成默认 umask 的可读权限。
      try { chmodSync(prefsFile, 0o600); } catch { /* best-effort; non-POSIX or race */ }
      // 主题切换时同步到 Claude Code CLI：发 /theme，监听输出验证结果。
      // 现代 CLI（≥2.x）的 /theme 是交互式选择器（args 被忽略），注入后对话框可能
      // 残留在终端：
      //   - mismatch 时**不再重发** /theme —— toggle 语义已不存在，重发只会把选择器
      //     再次打开，把终端困进"确认-重开"循环（Windows ConPTY 下每轮全屏重绘洪泛）。
      //   - 5s 超时若 buf 检出选择器特征（选项文案，见 THEME_PICKER_RE），补发一次
      //     ESC 关闭残留对话框。无特征绝不发 ESC —— CLI 正在流式生成时 /theme 只是被
      //     排队、对话框未开，误发 ESC 会 interrupt 用户正在跑的任务（宁漏关不误发）。
      if (incoming.themeColor && deps.writeToPty && deps.onPtyData && !_themeSyncInFlight) {
        _themeSyncInFlight = true;
        const target = incoming.themeColor === 'light' ? 'light' : 'dark';
        let buf = '';
        const removeListener = deps.onPtyData((data) => {
          buf += data;
          if (buf.length > 4096) buf = buf.slice(-2048); // 限制 buf 大小
          // 解析 PTY 输出中的 "Theme set to light" 或 "Theme set to dark"
          const match = buf.match(/Theme set to (light|dark)/);
          if (match) {
            removeListener();
            clearTimeout(timeout);
            _themeSyncInFlight = false;
            if (match[1] !== target) {
              console.warn(`[preferences] CLI theme sync mismatch: got ${match[1]}, wanted ${target} (no retry; modern /theme is an interactive picker)`);
            }
          }
        });
        // 5 秒超时，避免监听器泄漏；检出选择器残留时 ESC 兜底关闭
        const timeout = setTimeout(() => {
          removeListener();
          _themeSyncInFlight = false;
          if (THEME_PICKER_RE.test(buf)) {
            try { deps.writeToPty('\x1b'); } catch {}
          }
        }, 5000);
        try { deps.writeToPty('/theme\r'); } catch {}
      }
      // 回显里也剥离 auth/authByProject(含 base64 密码) —— GET 已剥离,POST 回显同样不能漏给
      // 已授权的远程客户端。磁盘上的值已在上面写入,这里只清内存对象供响应用。
      delete prefs.auth;
      delete prefs.authByProject;
      stripImConfigs(prefs);
      prefs.logDir = LOG_DIR;
      // 与 GET 一致：回显里补齐 resumeAutoChoice 虚拟默认（已在上方落盘，文件不含该默认值）
      if (!('resumeAutoChoice' in prefs)) prefs.resumeAutoChoice = 'continue';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(prefs));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  });
}

function claudeSettingsGet(req, res, parsedUrl, isLocal, deps) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  const fileEnv = deps.claudeSettings.env || {};
  // 与 Claude Code 保持一致：settings.json env 优先，fallback 到 process.env
  const env = { ...fileEnv };
  if (!env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS && process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS) {
    env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  }
  // claudeProjectModel：从 ~/.claude.json projects[cwd].lastModelUsage 推断，
  // 给前端血条 calibration 'auto' 模式作启动期回落（避免 haiku init ping 让血条
  // 错显 200K，详见 src/utils/helpers.js resolveCalibrationTokens）。
  const projectCwd = process.env.CCV_PROJECT_DIR || process.cwd();
  const claudeSettings = deps.claudeSettings;
  res.end(JSON.stringify({ env, model: claudeSettings.model || null, showThinkingSummaries: claudeSettings.showThinkingSummaries || false, claudeAvailable: process.env.CCV_CLAUDE_MISSING !== '1', claudeProjectModel: readClaudeProjectModel(projectCwd) }));
}

function claudeSettingsPost(req, res, parsedUrl, isLocal, deps) {
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > deps.MAX_POST_BODY) req.destroy(); });
  req.on('end', () => {
    try {
      const incoming = JSON.parse(body);
      const settingsPath = join(getClaudeConfigDir(), 'settings.json');
      let settings = {};
      try { if (existsSync(settingsPath)) settings = JSON.parse(readFileSync(settingsPath, 'utf-8')); } catch { }
      Object.assign(settings, incoming);
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      Object.assign(deps.claudeSettings, incoming);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  });
}

function proxyProfilesGet(req, res, parsedUrl, isLocal, deps) {
  try {
    const data = existsSync(PROFILE_PATH) ? JSON.parse(readFileSync(PROFILE_PATH, 'utf-8')) : deps.defaultProxyProfiles;
    // 用 interceptor.getActiveProfileId() 返回 effective active（workspace > profile.json.active > 'max'）
    const effectiveActive = getActiveProfileId();
    // 本机(127.0.0.1)= admin：下发明文 profile.apiKey 供本人在编辑表单(👁 折叠)里查阅/复制；已授权
    // 的远程客户端只拿脱敏值(****+后4位)。保存时若回传脱敏值，POST 侧 isMasked() 会保留磁盘原值。
    // 镜像 /api/auth/state 的密码、/api/dingtalk/status 的 appSecret 策略。
    const full = { ...data, active: effectiveActive };
    const payload = isLocal ? full : deps.maskProfiles(full);
    // defaultConfig.apiKey 始终脱敏：它在列表里是常显文本(无 👁 折叠)，且 Max/OAuth 默认配置的 key
    // 可能是 OAuth token；只有可编辑 profile 的 key 才按 isLocal 明文下发。
    if (_defaultConfig) payload.defaultConfig = { ..._defaultConfig, apiKey: _defaultConfig.apiKey ? deps.maskApiKey(_defaultConfig.apiKey) : null };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(deps.defaultProxyProfiles));
  }
}

function proxyProfilesPost(req, res, parsedUrl, isLocal, deps) {
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > deps.MAX_POST_BODY) req.destroy(); });
  req.on('end', () => {
    try {
      const incoming = JSON.parse(body);
      if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.profiles)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid profile data: profiles must be an array' }));
        return;
      }
      // 确保 max profile 始终存在
      if (!incoming.profiles.some(p => p.id === 'max')) {
        incoming.profiles = [{ id: 'max', name: 'Default' }, ...(incoming.profiles || [])];
      }
      // 如果 apiKey 是 mask 值（未修改），从磁盘读取原始值保留
      let existing = {};
      try { if (existsSync(PROFILE_PATH)) existing = JSON.parse(readFileSync(PROFILE_PATH, 'utf-8')); } catch { }
      const existingMap = {};
      if (existing.profiles) existing.profiles.forEach(p => { if (p.apiKey) existingMap[p.id] = p.apiKey; });
      for (const p of incoming.profiles) {
        if (p.apiKey && deps.isMasked(p.apiKey) && existingMap[p.id]) {
          p.apiKey = existingMap[p.id];
        }
      }
      // 只写 profiles 列表到 profile.json；active 不再入文件（避免跨进程串台）
      // 保留老数据里的 active 字段不变，以便老版本 ccv 或手动编辑者的回退能力
      const toWrite = { ...existing, profiles: incoming.profiles };
      const dir = dirname(PROFILE_PATH);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(PROFILE_PATH, JSON.stringify(toWrite, null, 2), { mode: 0o600 });
      // active 走 workspace 级别存储（当前进程独占）
      if (typeof incoming.active === 'string' && incoming.active) {
        setActiveProfileForWorkspace(incoming.active);
      } else {
        _loadProxyProfile(); // 仅列表变化时也刷新一次以反映删除 / 重命名
      }
      // SSE 广播仅给本进程客户端（sendEventToClients 本就是 per-process；另外 active 不跨进程）
      const effectiveActive = getActiveProfileId();
      const activeProfile = incoming.profiles?.find(p => p.id === effectiveActive) || null;
      const maskedProfile = activeProfile?.apiKey ? { ...activeProfile, apiKey: deps.maskApiKey(activeProfile.apiKey) } : activeProfile;
      sendEventToClients(deps.clients, 'proxy_profile', { active: effectiveActive, profile: maskedProfile });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  });
}

export const preferencesRoutes = [
  { method: 'GET', match: 'exact', path: '/api/preferences', handler: preferencesGet },
  { method: 'POST', match: 'exact', path: '/api/preferences', handler: preferencesPost },
  { method: 'GET', match: 'exact', path: '/api/claude-settings', handler: claudeSettingsGet },
  { method: 'POST', match: 'exact', path: '/api/claude-settings', handler: claudeSettingsPost },
  { method: 'GET', match: 'exact', path: '/api/proxy-profiles', handler: proxyProfilesGet },
  { method: 'POST', match: 'exact', path: '/api/proxy-profiles', handler: proxyProfilesPost },
];
