// Unit tests for lib/ask-store.js
// 涉及文件锁 + tmp-rename 原子写 + corrupt 恢复，使用专用 LOG_DIR 隔离不同 test 间的全局状态。
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// 必须在 import server modules 之前设环境变量——findcc.js 的 LOG_DIR 是模块 top-level 计算的。
const tmpRoot = mkdtempSync(join(tmpdir(), 'ccv-ask-store-test-'));
process.env.CCV_LOG_DIR = tmpRoot;

const { loadAskStore, saveAskStore, setEntry, deleteEntry, pruneStale, replaceAll, markAnswered, markCancelled, consume, consumeIfFinal } = await import('../lib/ask-store.js');

const storeFile = join(tmpRoot, 'ask-store.json');
const lockFile = join(tmpRoot, 'ask-store.lock');

function cleanup() {
  try { rmSync(storeFile, { force: true }); } catch {}
  try { rmSync(lockFile, { force: true }); } catch {}
}

describe('lib/ask-store.js', () => {
  beforeEach(() => cleanup());
  after(() => { try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {} });

  describe('loadAskStore', () => {
    it('returns empty object when file missing', () => {
      assert.deepEqual(loadAskStore(), {});
    });

    it('returns empty object when file empty (whitespace only)', () => {
      writeFileSync(storeFile, '   \n  ');
      assert.deepEqual(loadAskStore(), {});
    });

    it('returns empty object on corrupt JSON (silent recovery)', () => {
      writeFileSync(storeFile, '{not json[');
      assert.deepEqual(loadAskStore(), {});
    });

    it('returns empty when schema version mismatches', () => {
      writeFileSync(storeFile, JSON.stringify({ version: 999, entries: { x: { id: 'x', questions: [] } } }));
      assert.deepEqual(loadAskStore(), {});
    });

    it('strips entries with missing questions array (defensive)', () => {
      writeFileSync(storeFile, JSON.stringify({
        version: 1,
        entries: {
          good: { id: 'good', questions: [{ question: 'Q' }], createdAt: 123 },
          bad: { id: 'bad', questions: 'not an array' },
          empty: null,
        },
      }));
      const loaded = loadAskStore();
      assert.equal(Object.keys(loaded).length, 1);
      assert.equal(loaded.good.id, 'good');
      assert.deepEqual(loaded.good.questions, [{ question: 'Q' }]);
    });
  });

  describe('saveAskStore + atomic write', () => {
    it('writes JSON with version=1 + entries shape', () => {
      saveAskStore({ 'toolu_a': { id: 'toolu_a', questions: [{ question: 'Q?' }], createdAt: 1000 } });
      const raw = JSON.parse(readFileSync(storeFile, 'utf-8'));
      assert.equal(raw.version, 1);
      assert.equal(raw.entries.toolu_a.id, 'toolu_a');
      assert.deepEqual(raw.entries.toolu_a.questions, [{ question: 'Q?' }]);
      assert.equal(raw.entries.toolu_a.createdAt, 1000);
      assert.equal(raw.entries.toolu_a.status, 'pending');
    });

    it('strips invalid entries on save (no questions array)', () => {
      saveAskStore({
        ok: { questions: [{ q: 1 }], createdAt: 100 },
        broken: { something: 'else' },
      });
      const raw = JSON.parse(readFileSync(storeFile, 'utf-8'));
      assert.ok(raw.entries.ok);
      assert.ok(!raw.entries.broken);
    });

    it('no .tmp- file lingers after successful save (atomic rename)', () => {
      saveAskStore({ a: { questions: [{ q: 'x' }] } });
      const lingering = readdirSync(tmpRoot).filter(f => f.startsWith('ask-store.json.tmp-'));
      assert.equal(lingering.length, 0, `found lingering tmp file(s): ${lingering.join(',')}`);
    });
  });

  describe('setEntry / deleteEntry round-trip', () => {
    it('setEntry persists then loadAskStore returns it', () => {
      setEntry('toolu_x', { questions: [{ q: 'a' }], createdAt: 500 });
      const loaded = loadAskStore();
      assert.equal(loaded.toolu_x.id, 'toolu_x');
      assert.equal(loaded.toolu_x.createdAt, 500);
    });

    it('setEntry ignores empty id (defensive)', () => {
      setEntry('', { questions: [{ q: 'a' }] });
      setEntry(null, { questions: [{ q: 'a' }] });
      assert.deepEqual(loadAskStore(), {});
    });

    it('setEntry ignores missing questions array', () => {
      setEntry('toolu_x', {});
      setEntry('toolu_x', { questions: 'string' });
      assert.deepEqual(loadAskStore(), {});
    });

    it('deleteEntry removes the entry', () => {
      setEntry('a', { questions: [{ q: 1 }] });
      setEntry('b', { questions: [{ q: 2 }] });
      deleteEntry('a');
      const loaded = loadAskStore();
      assert.ok(!loaded.a);
      assert.ok(loaded.b);
    });

    it('deleteEntry on missing id is a no-op (no throw)', () => {
      assert.doesNotThrow(() => deleteEntry('never-existed'));
    });
  });

  describe('pruneStale', () => {
    it('removes entries older than maxAge, keeps fresh ones', () => {
      const now = Date.now();
      saveAskStore({
        fresh: { id: 'fresh', questions: [{ q: 1 }], createdAt: now - 10_000 },
        stale: { id: 'stale', questions: [{ q: 1 }], createdAt: now - 100_000_000 },
      });
      const survivors = pruneStale(60_000); // 60s
      assert.ok(survivors.fresh);
      assert.ok(!survivors.stale);
      // Disk state matches
      assert.deepEqual(Object.keys(loadAskStore()).sort(), ['fresh']);
    });
  });

  describe('replaceAll', () => {
    it('overwrites entire store atomically', () => {
      setEntry('old', { questions: [{ q: 1 }] });
      replaceAll({ brand_new: { id: 'brand_new', questions: [{ q: 9 }], createdAt: 1 } });
      const loaded = loadAskStore();
      assert.ok(!loaded.old);
      assert.ok(loaded.brand_new);
    });
  });

  describe('markAnswered / markCancelled / consume (Phase 3 short-poll handoff)', () => {
    it('markAnswered persists answers + flips status to answered', () => {
      setEntry('toolu_x', { questions: [{ q: 'a' }], createdAt: 100 });
      markAnswered('toolu_x', { 'a': 'yes' });
      const loaded = loadAskStore();
      assert.equal(loaded.toolu_x.status, 'answered');
      assert.deepEqual(loaded.toolu_x.answers, { a: 'yes' });
      assert.ok(loaded.toolu_x.answeredAt > 0);
    });

    it('markAnswered on missing entry creates minimal record (server restart race recovery)', () => {
      markAnswered('toolu_orphan', { 'q': 'answer' });
      const loaded = loadAskStore();
      assert.equal(loaded.toolu_orphan.status, 'answered');
      assert.deepEqual(loaded.toolu_orphan.answers, { q: 'answer' });
    });

    it('markCancelled flips status to cancelled with reason', () => {
      setEntry('a', { questions: [{ q: 1 }] });
      markCancelled('a', 'user interrupted');
      const loaded = loadAskStore();
      assert.equal(loaded.a.status, 'cancelled');
      assert.equal(loaded.a.cancelReason, 'user interrupted');
      assert.equal(loaded.a.answers, null);
    });

    it('consume returns entry then removes from disk (one-shot)', () => {
      setEntry('p', { questions: [{ q: 1 }] });
      markAnswered('p', { q: 'val' });
      const first = consume('p');
      assert.equal(first.status, 'answered');
      assert.deepEqual(first.answers, { q: 'val' });
      const second = consume('p');
      assert.equal(second, null, 'second consume should return null (already consumed)');
      assert.deepEqual(loadAskStore(), {});
    });

    it('consume on missing id returns null (no throw)', () => {
      assert.equal(consume('never-existed'), null);
    });
  });

  describe('P0 regression: race + ghost + stale cleanup guards', () => {
    it('setEntry status guard: 不可把 answered 倒回 pending（root of setImmediate race）', () => {
      setEntry('toolu_x', { questions: [{ q: 'a' }], createdAt: 100 });
      markAnswered('toolu_x', { 'a': 'yes' });
      // 模拟 setImmediate 排队的 placeholder setEntry 后到达：必须 noop
      setEntry('toolu_x', { questions: [{ q: 'a' }], createdAt: 100 });
      const loaded = loadAskStore();
      assert.equal(loaded.toolu_x.status, 'answered', 'setEntry 不能覆盖已 answered 状态');
      assert.deepEqual(loaded.toolu_x.answers, { a: 'yes' });
    });

    it('setEntry status guard: 不可把 cancelled 倒回 pending', () => {
      setEntry('a', { questions: [{ q: 1 }] });
      markCancelled('a', 'user abort');
      setEntry('a', { questions: [{ q: 1 }] });
      const loaded = loadAskStore();
      assert.equal(loaded.a.status, 'cancelled');
      assert.equal(loaded.a.cancelReason, 'user abort');
    });

    it('markAnswered first-write-wins: 第二次 markAnswered 不覆盖第一次答案', () => {
      setEntry('a', { questions: [{ q: 1 }] });
      const first = markAnswered('a', { q: 'first' });
      const second = markAnswered('a', { q: 'second' });
      assert.equal(first, true, '第一次必须真写入');
      assert.equal(second, false, '第二次必须 noop（first-wins）');
      const loaded = loadAskStore();
      assert.deepEqual(loaded.a.answers, { q: 'first' });
    });

    it('markCancelled first-write-wins: 不会把 answered 改成 cancelled', () => {
      setEntry('a', { questions: [{ q: 1 }] });
      markAnswered('a', { q: 'x' });
      const wrote = markCancelled('a', 'should not apply');
      assert.equal(wrote, false);
      const loaded = loadAskStore();
      assert.equal(loaded.a.status, 'answered');
    });

    it('consumeIfFinal: pending 不删（保留给后续 GET）', () => {
      setEntry('a', { questions: [{ q: 1 }] });
      const got = consumeIfFinal('a');
      assert.equal(got.status, 'pending');
      // disk 仍存在
      assert.ok(loadAskStore().a);
    });

    it('consumeIfFinal: answered 一次性消费', () => {
      setEntry('a', { questions: [{ q: 1 }] });
      markAnswered('a', { q: 'val' });
      const first = consumeIfFinal('a');
      assert.equal(first.status, 'answered');
      assert.equal(consumeIfFinal('a'), null);
      assert.deepEqual(loadAskStore(), {});
    });

    it('consumeIfFinal: cancelled 一次性消费', () => {
      setEntry('a', { questions: [{ q: 1 }] });
      markCancelled('a', 'r');
      const first = consumeIfFinal('a');
      assert.equal(first.status, 'cancelled');
      assert.equal(first.cancelReason, 'r');
      assert.equal(consumeIfFinal('a'), null);
    });

    it('pruneStale 用 max(createdAt, answeredAt) 保留刚 answered 的老 entry', async () => {
      const now = Date.now();
      // 直接写一个 createdAt=23h ago 的 answered entry（answeredAt 是 now）
      saveAskStore({
        oldButFresh: {
          id: 'oldButFresh',
          questions: [{ q: 1 }],
          createdAt: now - 23 * 60 * 60 * 1000,
          status: 'answered',
          answers: { q: 'yes' },
          answeredAt: now,
          cancelReason: null,
        },
        trulyStale: {
          id: 'trulyStale',
          questions: [{ q: 1 }],
          createdAt: now - 25 * 60 * 60 * 1000,
          status: 'pending',
          answers: null,
          answeredAt: null,
          cancelReason: null,
        },
      });
      const survivors = pruneStale(24 * 60 * 60 * 1000);
      assert.ok(survivors.oldButFresh, 'answeredAt 新的 entry 必须保留（防 ask-bridge 拿不到答案）');
      assert.ok(!survivors.trulyStale, '真正过期 entry 必须清');
    });
  });
});
