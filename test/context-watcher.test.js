import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readModelContextSize, buildContextWindowEvent, readClaudeProjectModel, CONTEXT_WINDOW_FILE } from '../server/lib/context-watcher.js';
import { getClaudeConfigDir } from '../findcc.js';

const CLAUDE_DIR = getClaudeConfigDir();

// 备份和恢复 context-window.json
let savedContextFile = null;
let contextFileExisted = false;

function backupContextFile() {
  try {
    contextFileExisted = existsSync(CONTEXT_WINDOW_FILE);
    if (contextFileExisted) savedContextFile = readFileSync(CONTEXT_WINDOW_FILE, 'utf-8');
  } catch { }
}

function restoreContextFile() {
  try {
    if (contextFileExisted && savedContextFile !== null) {
      writeFileSync(CONTEXT_WINDOW_FILE, savedContextFile);
    } else if (!contextFileExisted && existsSync(CONTEXT_WINDOW_FILE)) {
      unlinkSync(CONTEXT_WINDOW_FILE);
    }
  } catch { }
  savedContextFile = null;
}

describe('context-watcher: readModelContextSize', () => {
  it('returns default 200k when file does not exist', () => {
    backupContextFile();
    try {
      if (existsSync(CONTEXT_WINDOW_FILE)) unlinkSync(CONTEXT_WINDOW_FILE);
      const result = readModelContextSize();
      assert.equal(result.modelId, null);
      assert.equal(result.contextSize, 200000);
    } finally {
      restoreContextFile();
    }
  });

  it('infers 1M from model.id with [1m] tag', () => {
    backupContextFile();
    try {
      mkdirSync(CLAUDE_DIR, { recursive: true });
      writeFileSync(CONTEXT_WINDOW_FILE, JSON.stringify({
        model: { id: 'claude-opus-4-6[1m]' },
      }) + '\n');
      const result = readModelContextSize();
      assert.equal(result.modelId, 'claude-opus-4-6[1m]');
      assert.equal(result.contextSize, 1000000);
    } finally {
      restoreContextFile();
    }
  });

  it('infers 200k from model.id with [200k] tag', () => {
    backupContextFile();
    try {
      mkdirSync(CLAUDE_DIR, { recursive: true });
      writeFileSync(CONTEXT_WINDOW_FILE, JSON.stringify({
        model: { id: 'claude-sonnet-4-6[200k]' },
      }) + '\n');
      const result = readModelContextSize();
      assert.equal(result.modelId, 'claude-sonnet-4-6[200k]');
      assert.equal(result.contextSize, 200000);
    } finally {
      restoreContextFile();
    }
  });

  it('falls back to context_window.context_window_size from Claude Code statusLine', () => {
    backupContextFile();
    try {
      mkdirSync(CLAUDE_DIR, { recursive: true });
      writeFileSync(CONTEXT_WINDOW_FILE, JSON.stringify({
        model: { id: 'claude-sonnet-4-6' },
        context_window: { context_window_size: 200000 },
      }) + '\n');
      const result = readModelContextSize();
      assert.equal(result.contextSize, 200000);
    } finally {
      restoreContextFile();
    }
  });

  it('defaults Opus to 1M when no size tag in model.id', () => {
    backupContextFile();
    try {
      mkdirSync(CLAUDE_DIR, { recursive: true });
      writeFileSync(CONTEXT_WINDOW_FILE, JSON.stringify({
        model: { id: 'claude-opus-4-6' },
      }) + '\n');
      const result = readModelContextSize();
      assert.equal(result.contextSize, 1000000);
    } finally {
      restoreContextFile();
    }
  });

  it('returns default 200k when model.id has no size tag and no context_window field', () => {
    backupContextFile();
    try {
      mkdirSync(CLAUDE_DIR, { recursive: true });
      writeFileSync(CONTEXT_WINDOW_FILE, JSON.stringify({
        model: { id: 'claude-sonnet-4-6' },
      }) + '\n');
      const result = readModelContextSize();
      assert.equal(result.contextSize, 200000);
    } finally {
      restoreContextFile();
    }
  });
});

describe('context-watcher: readClaudeProjectModel', () => {
  // 用 tmpdir 写 stub ~/.claude.json,readClaudeProjectModel 接受可选 filePath 参数,
  // 单测注入 tmp 文件不动用户真实 config(后者动辄数 MB)。
  function withTmpClaudeJson(content, fn) {
    const tmpFile = join(tmpdir(), `cc-viewer-claude-json-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(tmpFile, typeof content === 'string' ? content : JSON.stringify(content));
    try { return fn(tmpFile); }
    finally { try { unlinkSync(tmpFile); } catch {} }
  }

  it('returns null when file does not exist', () => {
    const result = readClaudeProjectModel('/some/cwd', join(tmpdir(), 'definitely-not-exist-' + Date.now() + '.json'));
    assert.equal(result, null);
  });

  it('returns null when cwd is missing or not a string', () => {
    withTmpClaudeJson({ projects: {} }, (tmpFile) => {
      assert.equal(readClaudeProjectModel(null, tmpFile), null);
      assert.equal(readClaudeProjectModel('', tmpFile), null);
      assert.equal(readClaudeProjectModel(123, tmpFile), null);
    });
  });

  it('returns null when projects[cwd] does not exist', () => {
    withTmpClaudeJson({ projects: { '/other/path': { lastModelUsage: { foo: {} } } } }, (tmpFile) => {
      assert.equal(readClaudeProjectModel('/my/cwd', tmpFile), null);
    });
  });

  it('returns null when lastModelUsage is empty', () => {
    withTmpClaudeJson({ projects: { '/my/cwd': { lastModelUsage: {} } } }, (tmpFile) => {
      assert.equal(readClaudeProjectModel('/my/cwd', tmpFile), null);
    });
  });

  it('returns null when only haiku is present (filtered out)', () => {
    withTmpClaudeJson({
      projects: { '/my/cwd': { lastModelUsage: { 'claude-haiku-4-5': { costUSD: 0.5 } } } },
    }, (tmpFile) => {
      assert.equal(readClaudeProjectModel('/my/cwd', tmpFile), null);
    });
  });

  it('prefers [1m] suffix over other models', () => {
    // [1m] 是用户显式选 1M context 的强信号,即使 costUSD 不是最大也优先返回
    withTmpClaudeJson({
      projects: { '/my/cwd': { lastModelUsage: {
        'claude-opus-4-7': { costUSD: 100 },
        'claude-opus-4-7[1m]': { costUSD: 10 },
      } } },
    }, (tmpFile) => {
      assert.equal(readClaudeProjectModel('/my/cwd', tmpFile), 'claude-opus-4-7[1m]');
    });
  });

  it('falls back to highest costUSD when no [1m] entry', () => {
    withTmpClaudeJson({
      projects: { '/my/cwd': { lastModelUsage: {
        'claude-sonnet-4-6': { costUSD: 5 },
        'claude-opus-4-7': { costUSD: 50 },
      } } },
    }, (tmpFile) => {
      assert.equal(readClaudeProjectModel('/my/cwd', tmpFile), 'claude-opus-4-7');
    });
  });

  it('skips haiku and picks among non-haiku entries', () => {
    withTmpClaudeJson({
      projects: { '/my/cwd': { lastModelUsage: {
        'claude-haiku-4-5': { costUSD: 200 },
        'claude-opus-4-7': { costUSD: 20 },
      } } },
    }, (tmpFile) => {
      assert.equal(readClaudeProjectModel('/my/cwd', tmpFile), 'claude-opus-4-7');
    });
  });

  it('returns null on invalid JSON (graceful catch)', () => {
    withTmpClaudeJson('{not-valid-json', (tmpFile) => {
      assert.equal(readClaudeProjectModel('/my/cwd', tmpFile), null);
    });
  });
});

describe('context-watcher: buildContextWindowEvent', () => {
  it('computes correct context_window data from usage', () => {
    const usage = {
      input_tokens: 5000,
      output_tokens: 1000,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 3000,
    };
    const result = buildContextWindowEvent(usage, 200000);
    assert.ok(result);
    assert.equal(result.total_input_tokens, 8200); // 5000 + 200 + 3000
    assert.equal(result.total_output_tokens, 1000);
    assert.equal(result.context_window_size, 200000);
    assert.equal(result.used_percentage, 5); // (9200 / 200000) * 100 ≈ 5
    assert.equal(result.remaining_percentage, 95);
  });

  it('computes correct percentage for 1M context', () => {
    const usage = { input_tokens: 50000, output_tokens: 10000 };
    const result = buildContextWindowEvent(usage, 1000000);
    assert.ok(result);
    assert.equal(result.context_window_size, 1000000);
    assert.equal(result.used_percentage, 6); // (60000 / 1000000) * 100 = 6
    assert.equal(result.remaining_percentage, 94);
  });

  it('returns null when usage is missing', () => {
    assert.equal(buildContextWindowEvent(null, 200000), null);
    assert.equal(buildContextWindowEvent(undefined, 200000), null);
  });

  it('handles zero tokens gracefully', () => {
    const usage = { input_tokens: 0, output_tokens: 0 };
    const result = buildContextWindowEvent(usage, 200000);
    assert.ok(result);
    assert.equal(result.used_percentage, 0);
    assert.equal(result.remaining_percentage, 100);
  });

  it('preserves current_usage in output', () => {
    const usage = { input_tokens: 1000, output_tokens: 500 };
    const result = buildContextWindowEvent(usage, 200000);
    assert.deepEqual(result.current_usage, usage);
  });
});
