/**
 * Unit tests for src/utils/contextBarLockedStorage.js
 *
 * 覆盖 round-trip、projectName 隔离、空名守卫、损坏值回退、storage throw 兜底。
 * Node 没有内置 sessionStorage，mock 到 globalThis（同 fileExpandedPathsStorage 测试套路）。
 */
import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadContextBarLocked,
  saveContextBarLocked,
} from '../src/utils/contextBarLockedStorage.js';

function installMockStorage() {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); },
    _peek: () => store,
  };
  return store;
}

function installThrowingStorage() {
  globalThis.sessionStorage = {
    getItem() { throw new Error('private mode'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('quota'); },
  };
}

after(() => { delete globalThis.sessionStorage; });

describe('contextBarLockedStorage — round trip', () => {
  beforeEach(() => { installMockStorage(); });

  it('saves true then loads true', () => {
    saveContextBarLocked('cc-viewer', true);
    assert.equal(loadContextBarLocked('cc-viewer'), true);
  });

  it('returns false when no entry exists', () => {
    assert.equal(loadContextBarLocked('cc-viewer'), false);
  });

  it('removes key when saving false', () => {
    const store = installMockStorage();
    saveContextBarLocked('cc-viewer', true);
    assert.equal(store.size, 1);
    saveContextBarLocked('cc-viewer', false);
    assert.equal(store.size, 0);
    assert.equal(loadContextBarLocked('cc-viewer'), false);
  });

  it('overwrites previous true with subsequent true (idempotent)', () => {
    const store = installMockStorage();
    saveContextBarLocked('cc-viewer', true);
    saveContextBarLocked('cc-viewer', true);
    assert.equal(store.size, 1);
    assert.equal(loadContextBarLocked('cc-viewer'), true);
  });

  it('save false on absent key is no-op (does not throw)', () => {
    const store = installMockStorage();
    saveContextBarLocked('cc-viewer', false);
    assert.equal(store.size, 0);
    assert.equal(loadContextBarLocked('cc-viewer'), false);
  });
});

describe('contextBarLockedStorage — project isolation', () => {
  beforeEach(() => { installMockStorage(); });

  it('different projects do not share state', () => {
    saveContextBarLocked('projectA', true);
    assert.equal(loadContextBarLocked('projectA'), true);
    assert.equal(loadContextBarLocked('projectB'), false);
  });

  it('clearing one project does not affect the other', () => {
    saveContextBarLocked('projectA', true);
    saveContextBarLocked('projectB', true);
    saveContextBarLocked('projectA', false);
    assert.equal(loadContextBarLocked('projectA'), false);
    assert.equal(loadContextBarLocked('projectB'), true);
  });
});

describe('contextBarLockedStorage — empty projectName guard', () => {
  beforeEach(() => { installMockStorage(); });

  it('load returns false when projectName is empty', () => {
    assert.equal(loadContextBarLocked(''), false);
    assert.equal(loadContextBarLocked(null), false);
    assert.equal(loadContextBarLocked(undefined), false);
  });

  it('save is a no-op when projectName is empty', () => {
    const store = installMockStorage();
    saveContextBarLocked('', true);
    saveContextBarLocked(null, true);
    saveContextBarLocked(undefined, true);
    assert.equal(store.size, 0);
  });

  it('rejects non-string projectName', () => {
    const store = installMockStorage();
    saveContextBarLocked(123, true);
    saveContextBarLocked({}, true);
    assert.equal(store.size, 0);
    assert.equal(loadContextBarLocked(123), false);
  });
});

describe('contextBarLockedStorage — corruption fallback', () => {
  it('returns false for any value other than "1"', () => {
    installMockStorage();
    // load 用严格相等 === '1'，'true' / '0' / 任意字符串都视为 false，避免被
    // 旧版数据或浏览器扩展误注入的值导致血条意外锁死。
    sessionStorage.setItem('ccv_contextBarLocked:p', 'true');
    assert.equal(loadContextBarLocked('p'), false);
    sessionStorage.setItem('ccv_contextBarLocked:p', '0');
    assert.equal(loadContextBarLocked('p'), false);
    sessionStorage.setItem('ccv_contextBarLocked:p', '');
    assert.equal(loadContextBarLocked('p'), false);
  });
});

describe('contextBarLockedStorage — storage exception tolerance', () => {
  it('load returns false when sessionStorage.getItem throws', () => {
    installThrowingStorage();
    assert.equal(loadContextBarLocked('p'), false);
  });

  it('save swallows exceptions silently', () => {
    installThrowingStorage();
    saveContextBarLocked('p', true);
    saveContextBarLocked('p', false);
  });
});

// AppBase componentDidMount 里 /api/project-name fetch 后的 hydrate 路径核心逻辑：
//   persistedLocked = logfile ? false : loadContextBarLocked(projectName)
//   setState({ projectName, contextBarLocked: persistedLocked })
// AppBase 本身是大 React class，沿用 sse-heartbeat.test.js 的 mock 风格而非真挂载。
describe('AppBase hydrate path — /api/project-name → setState', () => {
  function hydrate({ projectName, logfile }) {
    const persistedLocked = logfile ? false : loadContextBarLocked(projectName);
    return { projectName, contextBarLocked: persistedLocked };
  }

  beforeEach(() => { installMockStorage(); });

  it('hydrates contextBarLocked=true when storage has the lock', () => {
    saveContextBarLocked('cc-viewer', true);
    const next = hydrate({ projectName: 'cc-viewer', logfile: null });
    assert.equal(next.projectName, 'cc-viewer');
    assert.equal(next.contextBarLocked, true);
  });

  it('hydrates contextBarLocked=false when storage is empty', () => {
    const next = hydrate({ projectName: 'cc-viewer', logfile: null });
    assert.equal(next.contextBarLocked, false);
  });

  it('skips hydrate in localLog mode (?logfile=...) even if storage has lock', () => {
    saveContextBarLocked('cc-viewer', true);
    const next = hydrate({ projectName: 'cc-viewer', logfile: '/path/to/log.jsonl' });
    assert.equal(next.contextBarLocked, false);
  });

  it('returns false for empty projectName regardless of storage', () => {
    // 启动 race / workspace 模式下 projectName 可能为空。
    saveContextBarLocked('other', true);
    const next = hydrate({ projectName: '', logfile: null });
    assert.equal(next.contextBarLocked, false);
  });
});
