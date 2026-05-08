import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  spawnClaude,
  writeToPty,
  writeToPtySequential,
  resizePty,
  killPty,
  _setPtyImportForTests,
  onPtyData,
  onPtyExit,
  getPtyPid,
  getPtyState,
  getCurrentWorkspace,
  getOutputBuffer,
  withDefaultThinkingDisplay,
  _clearThinkingDisplayRejectedPaths,
  _isThinkingDisplayRejected,
  _markThinkingDisplayRejected,
} from '../pty-manager.js';

// ─── getPtyPid / getPtyState / getCurrentWorkspace (no PTY running) ───

describe('pty-manager: state queries without PTY', () => {
  it('getPtyPid returns null when no PTY', () => {
    assert.equal(getPtyPid(), null);
  });

  it('getPtyState returns not running when no PTY', () => {
    const state = getPtyState();
    assert.equal(state.running, false);
  });

  it('getCurrentWorkspace returns not running when no PTY', () => {
    const ws = getCurrentWorkspace();
    assert.equal(ws.running, false);
    assert.equal(ws.cwd, null);
  });

  it('getOutputBuffer returns empty string initially', () => {
    const buf = getOutputBuffer();
    assert.equal(typeof buf, 'string');
  });
});

// ─── writeToPty / resizePty / killPty (no-op when no PTY) ───

describe('pty-manager: operations without PTY', () => {
  it('writeToPty does not throw when no PTY', () => {
    assert.doesNotThrow(() => writeToPty('test'));
  });

  it('resizePty does not throw when no PTY', () => {
    assert.doesNotThrow(() => resizePty(80, 24));
  });

  it('killPty does not throw when no PTY', () => {
    assert.doesNotThrow(() => killPty());
  });
});

// ─── onPtyData / onPtyExit listener registration ───

describe('pty-manager: listener registration', () => {
  it('onPtyData registers and unregisters listener', () => {
    let called = false;
    const unsubscribe = onPtyData(() => { called = true; });
    assert.equal(typeof unsubscribe, 'function');
    unsubscribe();
    // Listener removed, but we can't easily verify without spawning PTY
    assert.equal(called, false);
  });

  it('onPtyExit registers and unregisters listener', () => {
    let called = false;
    const unsubscribe = onPtyExit(() => { called = true; });
    assert.equal(typeof unsubscribe, 'function');
    unsubscribe();
    assert.equal(called, false);
  });

  it('multiple listeners can be registered', () => {
    const unsub1 = onPtyData(() => {});
    const unsub2 = onPtyData(() => {});
    assert.equal(typeof unsub1, 'function');
    assert.equal(typeof unsub2, 'function');
    unsub1();
    unsub2();
  });
});

// ─── spawnClaude integration (requires claude binary) ───

describe('pty-manager: spawnClaude integration', () => {
  let spawned = [];

  beforeEach(() => {
    spawned = [];
    _setPtyImportForTests(() => ({
      spawn(command, args, opts) {
        const dataHandlers = [];
        const exitHandlers = [];
        let killed = false;
        const inst = {
          pid: 12345 + spawned.length,
          command,
          args,
          opts,
          write(data) {
            for (const cb of dataHandlers) cb(`out:${data}`);
          },
          resize() {},
          kill() {
            if (killed) return;
            killed = true;
            for (const cb of exitHandlers) cb({ exitCode: 0 });
          },
          onData(cb) { dataHandlers.push(cb); },
          onExit(cb) { exitHandlers.push(cb); },
          _isKilled() { return killed; },
        };
        spawned.push(inst);
        return inst;
      },
    }));
  });

  afterEach(() => {
    killPty();
    _setPtyImportForTests(null);
  });

  it('getPtyPid returns PID when PTY is running', async () => {
    await spawnClaude(9999, process.cwd(), [], '/bin/echo');
    assert.equal(getPtyPid(), 12345);
    killPty();
    assert.equal(getPtyPid(), null);
  });

  it('getPtyState reflects running state after spawn', async () => {
    await spawnClaude(9999, process.cwd(), [], '/bin/echo');
    const state = getPtyState();
    assert.equal(state.running, true);
    killPty();
    assert.equal(getPtyState().running, false);
  });

  it('getCurrentWorkspace returns cwd after spawn', async () => {
    await spawnClaude(9999, process.cwd(), [], '/bin/echo');
    const ws = getCurrentWorkspace();
    assert.equal(ws.running, true);
    assert.equal(ws.cwd, process.cwd());
  });

  it('onPtyData receives data from PTY', async () => {
    await spawnClaude(9999, process.cwd(), [], '/bin/echo');
    await new Promise((resolve) => {
      const unsub = onPtyData((data) => {
        unsub();
        assert.ok(data.includes('out:'));
        resolve();
      });
      writeToPty('echo test\r');
    });
  });

  it('onPtyExit fires when PTY exits', async () => {
    await spawnClaude(9999, process.cwd(), [], '/bin/echo');
    await new Promise((resolve) => {
      const unsub = onPtyExit((exitCode) => {
        unsub();
        assert.equal(exitCode, 0);
        resolve();
      });
      killPty();
    });
  });

  it('getOutputBuffer accumulates PTY output', async () => {
    await spawnClaude(9999, process.cwd(), [], '/bin/echo');
    writeToPty('echo test\r');
    await new Promise(r => setTimeout(r, 0));
    const buf = getOutputBuffer();
    assert.ok(buf.includes('out:'));
  });

  it('resizePty does not throw while running', async () => {
    await spawnClaude(9999, process.cwd(), [], '/bin/echo');
    assert.doesNotThrow(() => resizePty(80, 24));
  });

  it('spawnClaude kills existing PTY before spawning new one', async () => {
    await spawnClaude(9999, process.cwd(), [], '/bin/echo');
    const first = spawned[0];
    await spawnClaude(9999, process.cwd(), [], '/bin/echo');
    assert.equal(first._isKilled(), true);
    assert.equal(spawned.length, 2);
  });

  it('spawnClaude strips inherited CLAUDE_CODE_NO_FLICKER by default', async () => {
    const prevNoFlicker = process.env.CLAUDE_CODE_NO_FLICKER;
    const prevKeep = process.env.CCV_KEEP_CLAUDE_CODE_NO_FLICKER;
    process.env.CLAUDE_CODE_NO_FLICKER = '1';
    delete process.env.CCV_KEEP_CLAUDE_CODE_NO_FLICKER;
    try {
      await spawnClaude(9999, process.cwd(), [], '/bin/echo');
      assert.equal(spawned[0].opts.env.CLAUDE_CODE_NO_FLICKER, undefined);
    } finally {
      if (prevNoFlicker === undefined) delete process.env.CLAUDE_CODE_NO_FLICKER;
      else process.env.CLAUDE_CODE_NO_FLICKER = prevNoFlicker;
      if (prevKeep === undefined) delete process.env.CCV_KEEP_CLAUDE_CODE_NO_FLICKER;
      else process.env.CCV_KEEP_CLAUDE_CODE_NO_FLICKER = prevKeep;
    }
  });

  it('spawnClaude preserves CLAUDE_CODE_NO_FLICKER with explicit cc-viewer opt-in', async () => {
    const prevNoFlicker = process.env.CLAUDE_CODE_NO_FLICKER;
    const prevKeep = process.env.CCV_KEEP_CLAUDE_CODE_NO_FLICKER;
    process.env.CLAUDE_CODE_NO_FLICKER = '1';
    process.env.CCV_KEEP_CLAUDE_CODE_NO_FLICKER = '1';
    try {
      await spawnClaude(9999, process.cwd(), [], '/bin/echo');
      assert.equal(spawned[0].opts.env.CLAUDE_CODE_NO_FLICKER, '1');
    } finally {
      if (prevNoFlicker === undefined) delete process.env.CLAUDE_CODE_NO_FLICKER;
      else process.env.CLAUDE_CODE_NO_FLICKER = prevNoFlicker;
      if (prevKeep === undefined) delete process.env.CCV_KEEP_CLAUDE_CODE_NO_FLICKER;
      else process.env.CCV_KEEP_CLAUDE_CODE_NO_FLICKER = prevKeep;
    }
  });

  // 轮询等条件满足；替代固定 setTimeout 在慢 CI 上的 flake
  const waitUntil = async (predicate, { timeoutMs = 500, intervalMs = 5 } = {}) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) return;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`waitUntil timeout after ${timeoutMs}ms`);
  };

  // 构造一个 mock pty：第一次 spawn 吐 errorText 并 exit 1，后续正常
  const makeMockPtyOnceCrash = (errorText) => () => ({
    spawn(command, args, opts) {
      const dataHandlers = [];
      const exitHandlers = [];
      const idx = spawned.length;
      const inst = {
        pid: 1000 + idx, command, args, opts,
        write() {}, resize() {}, kill() {},
        onData(cb) { dataHandlers.push(cb); },
        onExit(cb) { exitHandlers.push(cb); },
      };
      spawned.push(inst);
      if (idx === 0) {
        queueMicrotask(() => {
          for (const cb of dataHandlers) cb(errorText);
          for (const cb of exitHandlers) cb({ exitCode: 1 });
        });
      }
      return inst;
    },
  });

  it('retries without --thinking-display when claude crashes with unknown option (single quotes)', async () => {
    _clearThinkingDisplayRejectedPaths();
    _setPtyImportForTests(makeMockPtyOnceCrash("error: unknown option '--thinking-display'\n"));

    const origError = console.error;
    console.error = () => {};

    await spawnClaude(9999, process.cwd(), [], '/bin/fake-claude');
    await waitUntil(() => spawned.length >= 2);

    console.error = origError;

    assert.equal(spawned.length, 2, 'should have spawned twice (initial + retry)');
    assert.ok(spawned[0].args.includes('--thinking-display'), 'first spawn has flag');
    assert.ok(!spawned[1].args.includes('--thinking-display'), 'retry spawn strips flag');
    assert.equal(_isThinkingDisplayRejected('/bin/fake-claude'), true, 'path marked as rejecting the flag');
  });

  it('retries also on double-quoted error variant', async () => {
    _clearThinkingDisplayRejectedPaths();
    _setPtyImportForTests(makeMockPtyOnceCrash('error: unknown option "--thinking-display"\n'));

    const origError = console.error;
    console.error = () => {};

    await spawnClaude(9999, process.cwd(), [], '/bin/fake-claude-dq');
    await waitUntil(() => spawned.length >= 2);

    console.error = origError;

    assert.equal(spawned.length, 2);
    assert.ok(!spawned[1].args.includes('--thinking-display'));
    assert.equal(_isThinkingDisplayRejected('/bin/fake-claude-dq'), true);
  });

  it('does not retry if crash is unrelated to --thinking-display', async () => {
    _clearThinkingDisplayRejectedPaths();

    let spawnCount = 0;
    _setPtyImportForTests(() => ({
      spawn(command, args, opts) {
        const exitHandlers = [];
        const inst = {
          pid: 200 + spawnCount,
          command, args, opts,
          write() {}, resize() {}, kill() {},
          onData() {},
          onExit(cb) { exitHandlers.push(cb); },
        };
        spawned.push(inst);
        if (spawnCount === 0) {
          // 非 flag 相关的崩溃，不应触发 retry
          queueMicrotask(() => {
            for (const cb of exitHandlers) cb({ exitCode: 2 });
          });
        }
        spawnCount++;
        return inst;
      },
    }));

    await spawnClaude(9999, process.cwd(), [], '/bin/fake-claude-2');
    // 等待异步 exit 处理完——用短轮询确认 spawned 计数稳定
    await waitUntil(() => spawned[0] != null);
    await new Promise(r => setTimeout(r, 30)); // 短暂额外等待确保不会有第二次 spawn

    assert.equal(spawned.length, 1, 'should NOT retry for unrelated crash');
    assert.equal(_isThinkingDisplayRejected('/bin/fake-claude-2'), false, 'non-flag crash does not touch rejected set');
  });

  it('skips injection when CCV_SKIP_THINKING_DISPLAY=1', async () => {
    _clearThinkingDisplayRejectedPaths();
    const prev = process.env.CCV_SKIP_THINKING_DISPLAY;
    process.env.CCV_SKIP_THINKING_DISPLAY = '1';

    _setPtyImportForTests(() => ({
      spawn(command, args, opts) {
        const inst = {
          pid: 500, command, args, opts,
          write() {}, resize() {}, kill() {},
          onData() {}, onExit() {},
        };
        spawned.push(inst);
        return inst;
      },
    }));

    try {
      await spawnClaude(9999, process.cwd(), [], '/bin/fake-claude-env');
      assert.equal(spawned.length, 1);
      assert.ok(!spawned[0].args.includes('--thinking-display'),
        'env var short-circuits injection');
    } finally {
      if (prev === undefined) delete process.env.CCV_SKIP_THINKING_DISPLAY;
      else process.env.CCV_SKIP_THINKING_DISPLAY = prev;
    }
  });

  it('skips injection when claudePath is in rejected set (no crash+retry loop)', async () => {
    _clearThinkingDisplayRejectedPaths();
    _markThinkingDisplayRejected('/bin/fake-claude-pre-rejected');

    let spawnCount = 0;
    _setPtyImportForTests(() => ({
      spawn(command, args, opts) {
        const exitHandlers = [];
        const inst = {
          pid: 400 + spawnCount,
          command, args, opts,
          write() {}, resize() {}, kill() {},
          onData() {},
          onExit(cb) { exitHandlers.push(cb); },
        };
        spawned.push(inst);
        spawnCount++;
        return inst;
      },
    }));

    await spawnClaude(9999, process.cwd(), [], '/bin/fake-claude-pre-rejected');
    assert.equal(spawned.length, 1, 'single spawn, no crash loop');
    assert.ok(!spawned[0].args.includes('--thinking-display'), 'flag skipped because path was pre-rejected');
  });

  it('does not retry when user explicitly passed --thinking-display themselves', async () => {
    _clearThinkingDisplayRejectedPaths();

    let spawnCount = 0;
    _setPtyImportForTests(() => ({
      spawn(command, args, opts) {
        const dataHandlers = [];
        const exitHandlers = [];
        const inst = {
          pid: 300 + spawnCount,
          command, args, opts,
          write() {}, resize() {}, kill() {},
          onData(cb) { dataHandlers.push(cb); },
          onExit(cb) { exitHandlers.push(cb); },
        };
        spawned.push(inst);
        if (spawnCount === 0) {
          queueMicrotask(() => {
            for (const cb of dataHandlers) cb("error: unknown option '--thinking-display'\n");
            for (const cb of exitHandlers) cb({ exitCode: 1 });
          });
        }
        spawnCount++;
        return inst;
      },
    }));

    // 用户显式传了 flag：即使崩溃也不是「我们注入」的锅，不自动改用户意图
    await spawnClaude(9999, process.cwd(), ['--thinking-display', 'off'], '/bin/fake-claude-3');
    await waitUntil(() => spawned[0] != null);
    await new Promise(r => setTimeout(r, 30)); // 短暂额外等待确保不会有第二次 spawn

    assert.equal(spawned.length, 1, 'user-provided flag → no auto-retry');
  });
});

// ─── writeToPtySequential delay rules ───

describe('pty-manager: writeToPtySequential delay rules', () => {
  let writeTimestamps = [];
  let spawned = [];

  beforeEach(() => {
    writeTimestamps = [];
    spawned = [];
    _setPtyImportForTests(() => ({
      spawn(command, args, opts) {
        const inst = {
          pid: 22000 + spawned.length,
          command,
          args,
          opts,
          write(data) {
            writeTimestamps.push({ data, t: Date.now() });
          },
          resize() {},
          kill() {},
          onData() {},
          onExit() {},
        };
        spawned.push(inst);
        return inst;
      },
    }));
  });

  afterEach(() => {
    killPty();
    _setPtyImportForTests(null);
  });

  // 工具栏快捷按钮路径：[paste-end-chunk, '\r'] 写入 paste 块后必须等 settleMs
  // 给 Ink TUI 完成 bracket-paste 状态切换，再写 \r 才能可靠触发提交。
  it('paste-end chunk waits settleMs (not 80ms) before next chunk', async () => {
    await spawnClaude(9999, process.cwd(), [], '/bin/echo');
    writeTimestamps = []; // 清掉 spawn 注入的初始 write
    await new Promise((resolve) => {
      writeToPtySequential(
        ['\x1b[200~/clear\x1b[201~', '\r'],
        resolve,
        { settleMs: 250 }
      );
    });
    assert.equal(writeTimestamps.length, 2, 'two writes expected');
    const gap = writeTimestamps[1].t - writeTimestamps[0].t;
    assert.ok(gap >= 200, `expected paste-end → \\r gap >=200ms, got ${gap}ms`);
    assert.ok(gap < 500, `expected paste-end → \\r gap <500ms, got ${gap}ms`);
  });

  // inquirer 路径回归：普通字符 chunk（非 paste-end / 非 toggle）仍走硬编码 80ms，
  // 不被新加的 isPasteEnd 分支误命中。
  it('regular char chunk still waits ~80ms (not settleMs)', async () => {
    await spawnClaude(9999, process.cwd(), [], '/bin/echo');
    writeTimestamps = [];
    await new Promise((resolve) => {
      writeToPtySequential(
        ['a', 'b'],
        resolve,
        { settleMs: 500 } // 故意拉大 settleMs，验证普通 chunk 不受影响
      );
    });
    assert.equal(writeTimestamps.length, 2);
    const gap = writeTimestamps[1].t - writeTimestamps[0].t;
    assert.ok(gap >= 50, `expected regular char gap >=50ms, got ${gap}ms`);
    assert.ok(gap < 300, `expected regular char gap <300ms (not settleMs:500), got ${gap}ms`);
  });
});

// ─── output buffer truncation ───

describe('pty-manager: output buffer limits', () => {
  it('getOutputBuffer returns string', () => {
    const buf = getOutputBuffer();
    assert.equal(typeof buf, 'string');
  });

  // Note: Testing MAX_BUFFER truncation requires spawning PTY and generating >200KB output,
  // which is impractical for unit tests. This is better suited for integration tests.
});

// ─── withDefaultThinkingDisplay ───

describe('pty-manager: withDefaultThinkingDisplay', () => {
  it('appends --thinking-display summarized when flag is absent', () => {
    const out = withDefaultThinkingDisplay([]);
    assert.deepEqual(out, ['--thinking-display', 'summarized']);
  });

  it('appends at the END so existing args come first', () => {
    const out = withDefaultThinkingDisplay(['-p', 'hello']);
    assert.deepEqual(out, ['-p', 'hello', '--thinking-display', 'summarized']);
  });

  it('leaves args unchanged when user passed --thinking-display in space form', () => {
    const input = ['--thinking-display', 'off', '-p', 'x'];
    const out = withDefaultThinkingDisplay(input);
    assert.deepEqual(out, input);
    assert.equal(out, input, 'should return same reference to signal no-op');
  });

  it('leaves args unchanged when user passed --thinking-display in equals form', () => {
    const input = ['--thinking-display=full', '-p', 'x'];
    const out = withDefaultThinkingDisplay(input);
    assert.deepEqual(out, input);
    assert.equal(out, input);
  });

  it('does not mutate input array when appending', () => {
    const input = ['-p', 'hello'];
    const before = [...input];
    withDefaultThinkingDisplay(input);
    assert.deepEqual(input, before, 'input array must not be mutated');
  });

  it('returns non-array input unchanged (defensive)', () => {
    assert.equal(withDefaultThinkingDisplay(null), null);
    assert.equal(withDefaultThinkingDisplay(undefined), undefined);
  });

  it('detects the flag even mid-array (not just at start)', () => {
    const input = ['-p', 'hello', '--thinking-display', 'summarized'];
    const out = withDefaultThinkingDisplay(input);
    assert.equal(out, input, 'existing flag mid-array should suppress append');
    // And no duplicate flag appended
    const count = out.filter(a => a === '--thinking-display').length;
    assert.equal(count, 1);
  });
});
