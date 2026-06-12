// server/lib/ansi-safe-slice.js 单测：findSafeSliceStart 锚点扫描语义。
// 覆盖：裁剪点落在序列各位置（ESC 上 / ESC 后的 [ 上 / 参数中间 / 终止符前）、
// OSC payload 中间（BEL 与 ST 两种终止符）、LF fallback、无锚点长尾/短尾 fallback、
// UTF-16 低代理保护、`[?2026l` 残片场景。语义要点：返回 ESC 本身（保留完整序列），
// 而非旧实现的"跳过序列"（return j+1）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findSafeSliceStart } from '../server/lib/ansi-safe-slice.js';

describe('ansi-safe-slice: 锚点命中', () => {
  it('rawStart 恰落在完整 ESC 序列起点 → 返回 rawStart，序列完整保留', () => {
    const buf = 'aaaa\x1b[31mZZZZ';
    const start = findSafeSliceStart(buf, 4);
    assert.equal(start, 4);
    assert.ok(buf.slice(start).startsWith('\x1b[31m'));
  });

  it('缺陷 A：rawStart 落在 ESC 后的 [ 上（ESC 已被裁掉）→ 锚到下一个 ESC，不残留 [9m', () => {
    const buf = 'X[9mhello\x1b[0mtail';
    const start = findSafeSliceStart(buf, 1);
    assert.equal(start, buf.indexOf('\x1b'));
    assert.ok(buf.slice(start).startsWith('\x1b[0m'));
  });

  it('缺陷 B：rawStart 落在真彩 SGR 参数中、终止符在旧 64 字节窗口外 → 锚到下一个 ESC', () => {
    // 终止符前塞 >64 字节参数，旧实现会返回 scanLimit 落在序列中间
    const longParams = '38;2;136;136;136;' + '1;'.repeat(40);
    const buf = `\x1b[${longParams}mTEXT\x1b[0mrest`;
    const rawStart = buf.indexOf('6;136;136');
    const start = findSafeSliceStart(buf, rawStart);
    const sliced = buf.slice(start);
    assert.ok(sliced.startsWith('\x1b[0m'), '应锚到下一个 ESC');
    assert.ok(!/^[0-9;]+m/.test(sliced), '不应以孤儿参数残片开头');
  });

  it('缺陷 D：rawStart 落在参数上 → 绝不返回终止符 m 的下标（不渲染孤立字母）', () => {
    const buf = '\x1b[38;2;136;136;136mAFTER\x1b[0m';
    const rawStart = buf.indexOf(';136m') + 1; // 指向 '136m' 的 '1'
    const start = findSafeSliceStart(buf, rawStart);
    assert.notEqual(buf[start], 'm');
    assert.ok(buf.slice(start).startsWith('\x1b[0m'));
  });

  it('缺陷 C：rawStart 落在 OSC 8 超链接 URI 中间（BEL 终止）→ 锚到后续 ESC', () => {
    const buf = '\x1b]8;;https://example.com/very/long/path\x07link\x1b[31mred';
    const rawStart = buf.indexOf('example');
    const start = findSafeSliceStart(buf, rawStart);
    assert.ok(buf.slice(start).startsWith('\x1b[31m'));
  });

  it('OSC ST 终止符变体：锚到 ST 自身的 ESC（ground state 下 ESC\\ 是无害 no-op）', () => {
    const buf = '\x1b]8;;https://example.com\x1b\\link';
    const rawStart = buf.indexOf('example');
    const start = findSafeSliceStart(buf, rawStart);
    assert.equal(buf[start], '\x1b');
    assert.ok(buf.slice(start).startsWith('\x1b\\'));
  });

  it('?2026l 残片场景：rawStart 落在 [?2026l 上 → 锚过它到下一个 ESC', () => {
    const buf = 'x[?2026lplain\x1b[?2026htext';
    const start = findSafeSliceStart(buf, 1);
    assert.ok(buf.slice(start).startsWith('\x1b[?2026h'));
  });
});

describe('ansi-safe-slice: fallback 语义', () => {
  it('窗口内无 ESC 有 LF → 返回首个 LF 之后', () => {
    const buf = 'line one\nline two\nrest';
    const start = findSafeSliceStart(buf, 2);
    assert.equal(start, buf.indexOf('\n') + 1);
    assert.ok(buf.slice(start).startsWith('line two'));
  });

  it('ESC 优先于 LF：两者都有时锚 ESC', () => {
    const buf = 'ab\ncd\x1b[31mef';
    const start = findSafeSliceStart(buf, 0);
    assert.equal(start, 0, 'rawStart<=0 直接返回 0');
    const start2 = findSafeSliceStart(buf, 1);
    assert.equal(buf[start2], '\x1b');
  });

  it('无锚点长尾 → 返回 rawStart+窗口（默认 4096）', () => {
    const buf = 'y'.repeat(10000);
    const start = findSafeSliceStart(buf, 100);
    assert.equal(start, 100 + 4096);
  });

  it('无锚点且窗口覆盖全尾部 → 返回 rawStart，绝不清空', () => {
    const buf = 'y'.repeat(500);
    const start = findSafeSliceStart(buf, 100);
    assert.equal(start, 100);
  });

  it('无前向锚点但 rawStart 落在 CSI 内部（回看判定）→ 前跳到终止符之后', () => {
    const buf = 'A'.repeat(50) + '\x1b[38;5;196m' + 'B'.repeat(50);
    const rawStart = buf.indexOf(';196m'); // 序列内部，其后再无 ESC/LF
    const start = findSafeSliceStart(buf, rawStart);
    assert.equal(buf[start], 'B');
  });

  it('回看发现序列已终结（rawStart 在纯文本）→ 返回 rawStart', () => {
    const buf = '\x1b[31m' + 'plain'.repeat(20);
    const start = findSafeSliceStart(buf, 10);
    assert.equal(start, 10);
  });

  it('无前向锚点且 rawStart 落在 OSC(BEL 终止) 内 → 前跳到 BEL 之后', () => {
    const buf = '\x1b]0;title text here\x07after';
    const rawStart = buf.indexOf('title');
    const start = findSafeSliceStart(buf, rawStart);
    assert.equal(buf.slice(start), 'after');
  });

  it('rawStart 落在尾部未终结的 CSI 内（PTY 续写中）→ 返回 ESC 保留半截序列', () => {
    const buf = 'text' + '\x1b[38;2;13'; // 序列被 PTY 分片切断
    const start = findSafeSliceStart(buf, buf.indexOf('38'));
    assert.equal(buf.charCodeAt(start), 0x1b, '保留序列头等续写补全');
  });

  it('rawStart 落在尾部未终结的 OSC 内 → 返回 ESC 保留半截序列', () => {
    const buf = 'text' + '\x1b]0;half title'; // OSC 无 BEL 终止，仍在续写
    const start = findSafeSliceStart(buf, buf.indexOf('half'));
    assert.equal(buf.charCodeAt(start), 0x1b, '保留序列头等续写补全');
  });

  it('低代理保护：fallback 起点落在低代理上 → +1 跳过，不孤儿化代理对', () => {
    // 构造 scanLimit 恰落在代理对的低代理上：rawStart+4096 处放 emoji 的低代理
    const emoji = '😀'; // 😀
    const buf = 'y'.repeat(100 + 4096 - 1) + emoji + 'y'.repeat(5000);
    const start = findSafeSliceStart(buf, 100);
    // scanLimit = 100+4096 指向低代理 \ude00 → +1
    assert.equal(start, 100 + 4096 + 1);
    const isLowSurrogate = buf.charCodeAt(start) >= 0xdc00 && buf.charCodeAt(start) <= 0xdfff;
    assert.equal(isLowSurrogate, false, '起点不应落在低代理上');
  });

  it('高代理起点无需处理：配对完整随切片保留', () => {
    const emoji = '😀';
    const buf = 'y'.repeat(100 + 4096) + emoji + 'y'.repeat(5000);
    const start = findSafeSliceStart(buf, 100);
    assert.equal(start, 100 + 4096, '高代理起点直接返回');
    assert.equal(buf.slice(start, start + 2), emoji, '代理对完整');
  });

  it('边界：rawStart<=0 返回 0；rawStart>=length 返回 length', () => {
    assert.equal(findSafeSliceStart('abc', 0), 0);
    assert.equal(findSafeSliceStart('abc', -5), 0);
    assert.equal(findSafeSliceStart('abc', 3), 3);
    assert.equal(findSafeSliceStart('abc', 10), 3);
  });

  it('ESC 是缓冲区最后一个字节 → 返回该 ESC（后续 chunk 会补全序列）', () => {
    const buf = 'plain text\x1b';
    const start = findSafeSliceStart(buf, 2);
    assert.equal(start, buf.length - 1);
  });

  it('自定义扫描窗口参数生效', () => {
    const buf = 'y'.repeat(1000);
    assert.equal(findSafeSliceStart(buf, 10, 100), 110);
  });
});
