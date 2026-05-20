// Claude Code 硬编码的 builtin skill 名单（本地无文件、不可禁用）。
// 与 server/lib/skills-api.js 的 BUILTIN_NAMES 保持一致；前端用于 popover chip 过滤。
export const BUILTIN_SKILL_NAMES = new Set([
  'update-config', 'keybindings-help', 'simplify', 'fewer-permission-prompts',
  'loop', 'schedule', 'claude-api', 'init', 'review', 'security-review',
]);

// 把 /api/skills 返回的 skill 对象映射到 Claude Code system-reminder 里的显示名。
// 插件 skill: `<pluginShort>:<skillDir>`；其它源用裸名。pluginName 形如 `short@marketplace`。
export function skillToDisplayName(s) {
  if (!s || typeof s.name !== 'string') return '';
  if (s.source === 'plugin' && typeof s.pluginName === 'string' && s.pluginName.includes('@')) {
    const short = s.pluginName.split('@')[0];
    if (short) return `${short}:${s.name}`;
  }
  return s.name;
}

// 把 /api/skills 的权威结果与历史 system-reminder 解析结果合并为「当前在用」chip 列表。
// - fsSkills=null  → 返回 null，由调用方回退到历史解析
// - 只保留 enabled=true 且非 builtin 的条目
// - description 优先 fs（SKILL.md frontmatter），缺失时回退历史 system-reminder 的 desc，再缺则空串
// - 按显示名去重（user/project 同名只保留最后一条；plugin 因为带前缀天然不冲突）
export function mergeActiveSkills(fsSkills, historicalSkills) {
  if (!Array.isArray(fsSkills)) return null;
  const descMap = new Map((historicalSkills || []).map(s => [s.name, s.description]));
  const out = new Map();
  for (const s of fsSkills) {
    if (!s || !s.enabled || s.source === 'builtin') continue;
    const name = skillToDisplayName(s);
    if (!name || BUILTIN_SKILL_NAMES.has(name)) continue;
    out.set(name, { name, description: s.description || descMap.get(name) || '' });
  }
  return [...out.values()];
}

// 从 <system-reminder> 内部文本里抽出 skills 列表。
// 识别 header 句 "skills are available for use with the Skill tool" 后，按行扫描
// `- <name>: <desc>` 格式；name 内允许冒号（plugin:foo / skill-creator:skill-creator
// 都按原样保留），按首个 ': '（冒号+空格）切分。description 可跨多行，遇空行 / 下一个 `- `
// flush；遇非 dash 非续行非空文本视为列表结束。
//
// 纯函数，无传递依赖 —— 可直接被 node --test 导入（避免 src/utils/contentFilter.js
// 里缺 .js 后缀的 import 引起的 Node ESM resolver 失败）。
export function parseLoadedSkills(innerText) {
  if (typeof innerText !== 'string') return [];
  const headerIdx = innerText.indexOf('skills are available for use with the Skill tool');
  if (headerIdx < 0) return [];
  const lineStart = innerText.indexOf('\n', headerIdx);
  if (lineStart < 0) return [];
  const tail = innerText.slice(lineStart + 1);
  const lines = tail.split(/\r?\n/);
  const skills = [];
  let current = null;
  const flush = () => {
    if (current && current.name) skills.push(current);
    current = null;
  };
  for (const line of lines) {
    if (/^-\s+/.test(line)) {
      flush();
      const rest = line.replace(/^-\s+/, '');
      const colonSpaceIdx = rest.indexOf(': ');
      if (colonSpaceIdx > 0) {
        current = {
          name: rest.slice(0, colonSpaceIdx).trim(),
          description: rest.slice(colonSpaceIdx + 2).trim(),
        };
      } else {
        const name = rest.replace(/:\s*$/, '').trim();
        current = { name, description: '' };
      }
    } else if (current && line.trim()) {
      // 续行：保留换行符。弹窗用 white-space: pre-wrap 渲染，
      // 让多段落 description（如 test-spec-designer 的触发场景/关键词）保持可读的结构。
      current.description = current.description
        ? current.description + '\n' + line.trim()
        : line.trim();
    } else if (!line.trim()) {
      flush();
    } else {
      break;
    }
  }
  flush();
  return skills;
}
