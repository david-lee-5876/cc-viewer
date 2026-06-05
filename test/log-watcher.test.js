import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readLogFile, sendToClients, watchLogFile, unwatchAll, getWatchedFiles } from '../server/lib/log-watcher.js';

function makeTmpDir() {
  const dir = join(tmpdir(), `ccv-logwatch-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('readLogFile', () => {
  let dir;

  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('returns empty array for nonexistent file', () => {
    const result = readLogFile(join(dir, 'nope.jsonl'));
    assert.deepStrictEqual(result, []);
  });

  it('parses single entry', () => {
    const file = join(dir, 'log.jsonl');
    writeFileSync(file, JSON.stringify({ timestamp: 1, url: '/a', data: 'hello' }));
    const result = readLogFile(file);
    assert.equal(result.length, 1);
    assert.equal(result[0].data, 'hello');
  });

  it('parses multiple entries separated by \\n---\\n', () => {
    const file = join(dir, 'log.jsonl');
    const entries = [
      JSON.stringify({ timestamp: 1, url: '/a' }),
      JSON.stringify({ timestamp: 2, url: '/b' }),
      JSON.stringify({ timestamp: 3, url: '/c' }),
    ];
    writeFileSync(file, entries.join('\n---\n'));
    const result = readLogFile(file);
    assert.equal(result.length, 3);
  });

  it('filters out invalid JSON entries', () => {
    const file = join(dir, 'log.jsonl');
    const content = [
      JSON.stringify({ timestamp: 1, url: '/a' }),
      'not valid json {{{',
      JSON.stringify({ timestamp: 2, url: '/b' }),
    ].join('\n---\n');
    writeFileSync(file, content);
    const result = readLogFile(file);
    assert.equal(result.length, 2);
  });

  it('deduplicates by timestamp|url, later entry wins', () => {
    const file = join(dir, 'log.jsonl');
    const content = [
      JSON.stringify({ timestamp: 1, url: '/a', phase: 'request' }),
      JSON.stringify({ timestamp: 1, url: '/a', phase: 'response' }),
    ].join('\n---\n');
    writeFileSync(file, content);
    const result = readLogFile(file);
    assert.equal(result.length, 1);
    assert.equal(result[0].phase, 'response');
  });

  it('keeps entries with different timestamp|url keys', () => {
    const file = join(dir, 'log.jsonl');
    const content = [
      JSON.stringify({ timestamp: 1, url: '/a' }),
      JSON.stringify({ timestamp: 1, url: '/b' }),
      JSON.stringify({ timestamp: 2, url: '/a' }),
    ].join('\n---\n');
    writeFileSync(file, content);
    const result = readLogFile(file);
    assert.equal(result.length, 3);
  });

  it('returns empty array for empty file', () => {
    const file = join(dir, 'log.jsonl');
    writeFileSync(file, '');
    const result = readLogFile(file);
    assert.deepStrictEqual(result, []);
  });

  it('handles file with only whitespace', () => {
    const file = join(dir, 'log.jsonl');
    writeFileSync(file, '   \n  \n  ');
    const result = readLogFile(file);
    assert.deepStrictEqual(result, []);
  });
});

describe('sendToClients', () => {
  it('writes SSE formatted data to all clients', () => {
    const written = [];
    const clients = [
      { write: (data) => written.push(data) },
      { write: (data) => written.push(data) },
    ];
    const entry = { timestamp: 1, url: '/test' };
    sendToClients(clients, entry);
    assert.equal(written.length, 2);
    assert.equal(written[0], `data: ${JSON.stringify(entry)}\n\n`);
    assert.equal(written[1], `data: ${JSON.stringify(entry)}\n\n`);
  });

  it('handles client write errors gracefully', () => {
    const written = [];
    const clients = [
      { write: () => { throw new Error('disconnected'); } },
      { write: (data) => written.push(data) },
    ];
    // Should not throw
    sendToClients(clients, { timestamp: 1, url: '/test' });
    assert.equal(written.length, 1);
  });

  it('handles empty clients array', () => {
    // Should not throw
    sendToClients([], { timestamp: 1, url: '/test' });
  });

  it('keeps a backpressured client until the tolerance window elapses, then drops it', () => {
    // write 返回 false 模拟写缓冲满（backpressure）。首次推送只记录时间戳并挂 drain 监听，
    // 不应立即剔除——否则瞬时忙碌的渲染器会被误判 dead，触发重连风暴（Windows 卡死放大器）。
    let ended = false;
    const client = {
      write: () => false,
      once: () => {},
      end: () => { ended = true; },
    };
    const clients = [client];

    sendToClients(clients, { timestamp: 1, url: '/test' });
    assert.equal(clients.length, 1, 'first backpressured push must not drop the client');
    assert.equal(ended, false);
    assert.ok(client._sseBackpressureSince > 0, 'backpressure start timestamp recorded');

    // 模拟未排空持续超过容忍窗口（不依赖具体常量值，直接把起点推到很久以前）。
    client._sseBackpressureSince = Date.now() - 10 * 60 * 1000;
    sendToClients(clients, { timestamp: 2, url: '/test' });
    assert.equal(clients.length, 0, 'client is dropped after the tolerance window without draining');
    assert.equal(ended, true, 'dropped client is end()-ed');
  });
});

describe('watchLogFile (fs.watch migration)', () => {
  let dir;

  beforeEach(() => {
    dir = makeTmpDir();
    unwatchAll();
  });
  afterEach(() => {
    unwatchAll();
    rmSync(dir, { recursive: true, force: true });
  });

  function makeOpts(logFile, clients = []) {
    return {
      logFile,
      clients,
      getClaudePid: () => 12345,
      runParallelHook: async () => {},
      notifyStatsWorker: () => {},
      getLogFile: () => logFile,
    };
  }

  it('registers file in watchedFiles and prevents duplicate', () => {
    const file = join(dir, 'test.jsonl');
    writeFileSync(file, '');
    const opts = makeOpts(file);
    watchLogFile(opts);
    assert.ok(getWatchedFiles().has(file));
    const sizeBefore = getWatchedFiles().size;
    watchLogFile(opts);
    assert.equal(getWatchedFiles().size, sizeBefore);
  });

  it('unwatchAll clears all state', () => {
    const file1 = join(dir, 'a.jsonl');
    const file2 = join(dir, 'b.jsonl');
    writeFileSync(file1, '');
    writeFileSync(file2, '');
    watchLogFile(makeOpts(file1));
    watchLogFile(makeOpts(file2));
    assert.equal(getWatchedFiles().size, 2);
    unwatchAll();
    assert.equal(getWatchedFiles().size, 0);
  });

  it('detects new entries via safety-net timer', async () => {
    const file = join(dir, 'test.jsonl');
    writeFileSync(file, '');
    const received = [];
    const clients = [{ write: (data) => { received.push(data); return true; } }];
    watchLogFile(makeOpts(file, clients));

    appendFileSync(file, JSON.stringify({ timestamp: 't1', url: '/v1/messages' }) + '\n---\n');

    // Safety-net fires at 5s; wait up to 7s
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (received.length > 0) { clearInterval(check); resolve(); }
      }, 200);
      setTimeout(() => { clearInterval(check); resolve(); }, 7000);
    });

    unwatchAll();
    assert.ok(received.length > 0, 'should have received entry via safety-net or fs.watch');
    assert.ok(received[0].includes('"t1"'));
  });

  it('CCV_FORCE_POLL forces polling fallback', () => {
    const orig = process.env.CCV_FORCE_POLL;
    try {
      process.env.CCV_FORCE_POLL = '1';
      // Re-import would be needed to pick up the env change at module level.
      // Instead, test that watchLogFile succeeds (no throw) with the flag.
      const file = join(dir, 'poll.jsonl');
      writeFileSync(file, '');
      watchLogFile(makeOpts(file));
      assert.ok(getWatchedFiles().has(file));
      unwatchAll();
    } finally {
      if (orig === undefined) delete process.env.CCV_FORCE_POLL;
      else process.env.CCV_FORCE_POLL = orig;
    }
  });
});
