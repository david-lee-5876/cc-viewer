// StickyBottomController — vanilla JS controller for ChatView 流式吸底状态机
//
// 收敛 7 处独立 scrollTop 写入与 3 套并行吸底机制到单一权威路径。
// 关键不变量：_lockDepth >= 0；dispose 后 _lockDepth === 0 且不再变化。
// 详见 /Users/sky/.claude/plans/modular-floating-hopper.md (v2.1)。

const NOOP = () => {};
const DEFAULT_THRESHOLD_ENTER = 10;
const DEFAULT_THRESHOLD_LEAVE = 50;
const DEFAULT_TOUCH_SUPPRESS_MS = 300;
// Virtuoso 路径下 footer 子树（lastResponse / spinner / streamingLiveItem 三段）高度抖动会让
// Virtuoso 内部的 atBottom 误判翻转。匹配 Virtuoso atBottomThreshold:60，notifyAtBottom 用此值
// 兜底：仅当真实 DOM 距离 > 60px 才信任 atBottom=false 翻 sticky。
const DEFAULT_AT_BOTTOM_PX = 60;
// _setSticky 决策去重窗口（ms）：同 rAF tick 内 RO + Virtuoso atBottomStateChange 双发时合并。
// 选 16ms 对齐 60Hz 一帧；高刷屏（120Hz/144Hz）下相当于 2 帧，可能压制合法翻转——若实测有手感
// 问题可改 8ms 或动态读 screen.refreshRate（P2 backlog，待手动验证）。
const STICKY_DECISION_DEDUP_MS = 16;

const TOUCH_HOLD_MARKER = -1;

export class StickyBottomController {
  constructor(opts = {}) {
    this._getSticky = opts.getSticky || (() => false);
    this._setStickyExternal = opts.setSticky || NOOP;
    this._getMode = opts.getMode || (() => 'desktop');
    this._thresholdEnter = opts.thresholdEnter ?? DEFAULT_THRESHOLD_ENTER;
    this._thresholdLeave = opts.thresholdLeave ?? DEFAULT_THRESHOLD_LEAVE;
    this._touchSuppressMs = opts.touchSuppressMs ?? DEFAULT_TOUCH_SUPPRESS_MS;
    this._atBottomPx = opts.atBottomPx ?? DEFAULT_AT_BOTTOM_PX;
    this._now = opts.now || (() => Date.now());

    this._lockDepth = 0;
    this._smoothLockHeld = false;
    this._followTarget = 0;
    this._smoothFollowRafId = null;
    this._scrollHandlerRafId = null;
    // Set 而非 Array：流式高频 writeUnderLock 时 add/delete 都 O(1)；Array.filter 是 O(n)
    // 累积成 O(n²) 帧成本，是 perf-auditor 找出的 P0 内存泄漏路径。
    this._writeLockRafIds = new Set();
    this._resizeObserver = null;
    this._boundEl = null;
    this._touchListenersAttached = false;
    this._recentTouchTs = 0;
    // 决策去重快照：拆为两字段而非 { value, ts } 对象，避免 _setSticky 高频调用时重复 GC
    this._lastStickyValue = null; // boolean | null（null = 尚无决策）
    this._lastStickyTs = 0;
    this._disposed = false;

    this._onScroll = () => {
      if (this._disposed) return;
      if (this._lockDepth > 0) return;
      if (this._scrollHandlerRafId !== null) return;
      this._scrollHandlerRafId = this._raf(() => {
        this._scrollHandlerRafId = null;
        if (this._disposed) return;
        const el = this._boundEl;
        if (!el) return;
        const gap = this._followTarget - el.scrollTop;
        const sticky = this._getSticky();
        if (sticky && gap > this._thresholdLeave) {
          this._setSticky(false);
        } else if (!sticky && gap <= this._thresholdEnter) {
          this._setSticky(true);
        }
      });
    };

    this._onTouchStart = () => { this._recentTouchTs = TOUCH_HOLD_MARKER; };
    this._onTouchEnd = () => { this._recentTouchTs = this._now(); };
  }

  _raf(fn) {
    if (typeof globalThis.requestAnimationFrame === 'function') {
      return globalThis.requestAnimationFrame(fn);
    }
    // SSR / 缺失 rAF 环境：setTimeout 0 兜底（同步语义不可恢复，但至少不挂死）
    return setTimeout(fn, 0);
  }

  _cancelRaf(id) {
    if (id == null) return;
    if (typeof globalThis.cancelAnimationFrame === 'function') {
      try { globalThis.cancelAnimationFrame(id); } catch {}
    } else {
      try { clearTimeout(id); } catch {}
    }
  }

  _setSticky(value) {
    if (this._disposed) return;
    const ts = this._now();
    if (this._lastStickyValue === value && (ts - this._lastStickyTs) < STICKY_DECISION_DEDUP_MS) {
      return;
    }
    this._lastStickyValue = value;
    this._lastStickyTs = ts;
    try { this._setStickyExternal(value); } catch {}
  }

  _attachTouchListenersOnce() {
    if (this._touchListenersAttached) return;
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    this._touchListenersAttached = true;
    try {
      document.addEventListener('touchstart', this._onTouchStart, { passive: true });
      document.addEventListener('touchend', this._onTouchEnd, { passive: true });
      document.addEventListener('touchcancel', this._onTouchEnd, { passive: true });
    } catch {}
  }

  _detachTouchListeners() {
    if (!this._touchListenersAttached) return;
    if (typeof document === 'undefined' || typeof document.removeEventListener !== 'function') return;
    try {
      document.removeEventListener('touchstart', this._onTouchStart);
      document.removeEventListener('touchend', this._onTouchEnd);
      document.removeEventListener('touchcancel', this._onTouchEnd);
    } catch {}
    this._touchListenersAttached = false;
  }

  bind(el) {
    if (this._disposed) return;
    if (el === this._boundEl) return; // idempotent
    if (this._boundEl) this._detachFromBoundEl();
    this._boundEl = el || null;
    if (!el) return;
    const mode = this._getMode();
    if (mode !== 'virtuoso') {
      try { el.addEventListener('scroll', this._onScroll, { passive: true }); } catch {}
    }
    if (typeof ResizeObserver !== 'undefined') {
      try {
        this._resizeObserver = new ResizeObserver(() => this.handleScrollerResize(el));
        this._resizeObserver.observe(el);
      } catch {}
    }
    this.refreshFollowTarget(el);
    this._attachTouchListenersOnce();
  }

  _detachFromBoundEl() {
    const el = this._boundEl;
    if (!el) return;
    try { el.removeEventListener('scroll', this._onScroll); } catch {}
    if (this._resizeObserver) {
      try { this._resizeObserver.disconnect(); } catch {}
      this._resizeObserver = null;
    }
    this._boundEl = null;
  }

  unbind() {
    this._detachFromBoundEl();
    if (this._scrollHandlerRafId !== null) {
      this._cancelRaf(this._scrollHandlerRafId);
      this._scrollHandlerRafId = null;
    }
    if (this._smoothFollowRafId !== null) {
      this._cancelRaf(this._smoothFollowRafId);
      this._smoothFollowRafId = null;
    }
    for (const id of this._writeLockRafIds) this._cancelRaf(id);
    this._writeLockRafIds.clear();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.unbind();
    this._detachTouchListeners();
    this._lockDepth = 0;
    this._smoothLockHeld = false;
  }

  isLocked() { return this._lockDepth > 0; }

  refreshFollowTarget(el) {
    if (this._disposed) return;
    const target = el || this._boundEl;
    if (!target) return;
    const sh = target.scrollHeight ?? 0;
    const ch = target.clientHeight ?? 0;
    this._followTarget = Math.max(0, sh - ch);
  }

  // Single authoritative scrollTop write entry.
  // 双 rAF 后 _lockDepth--。期间 _onScroll / RO writeUnderLock 都会被锁短路。
  // 所有入参守卫（disposed / el / 类型 / 数值有限性）必须在 _lockDepth++ 之前完成，
  // 防极端值（NaN/Infinity）/非法元素让 lock 白占一个 rAF 周期（防 DoS + 防御）。
  writeUnderLock(el, target) {
    if (this._disposed) return;
    if (!el) return;
    if (typeof el.scrollTop !== 'number') return;
    if (!Number.isFinite(target)) return;
    this._lockDepth++;
    try { el.scrollTop = target; } catch {}
    let inner = null;
    const outer = this._raf(() => {
      this._writeLockRafIds.delete(outer);
      if (this._disposed) return;
      inner = this._raf(() => {
        this._writeLockRafIds.delete(inner);
        if (this._disposed) return;
        this._lockDepth = Math.max(0, this._lockDepth - 1);
      });
      if (inner != null) this._writeLockRafIds.add(inner);
    });
    if (outer != null) this._writeLockRafIds.add(outer);
  }

  // 单次锁短路一帧（handleLoadMore 桌面分支用：裸写 scrollTop 后让 RO fire 被吃掉）
  suppressOnce() {
    if (this._disposed) return;
    this._lockDepth++;
    const id = this._raf(() => {
      this._writeLockRafIds.delete(id);
      if (this._disposed) return;
      this._lockDepth = Math.max(0, this._lockDepth - 1);
    });
    if (id != null) this._writeLockRafIds.add(id);
  }

  // 缓动追底：双 rAF 等 layout 完，然后 step easeOut（35% gap，min 1px max 120px）
  // _smoothLockHeld 是 owner 标记，整个 step 链占 1 个 lock 引用；嵌套 startSmoothFollow
  // 不重复 increment（已持有 owner 的 lock）
  startSmoothFollow(el) {
    if (this._disposed) return;
    const scroller = el || this._boundEl;
    if (!scroller) return;
    if (!this._smoothLockHeld) {
      this._lockDepth++;
      this._smoothLockHeld = true;
    }
    if (this._smoothFollowRafId !== null) {
      this._cancelRaf(this._smoothFollowRafId);
      this._smoothFollowRafId = null;
    }
    const release = () => {
      if (!this._smoothLockHeld) return;
      this._smoothLockHeld = false;
      this._lockDepth = Math.max(0, this._lockDepth - 1);
    };
    const step = () => {
      this._smoothFollowRafId = null;
      if (this._disposed) { release(); return; }
      if (!this._getSticky()) { release(); return; }
      const target = this._followTarget;
      const current = scroller.scrollTop ?? 0;
      const gap = target - current;
      // 非有限数（scroller 异常 / target 缓存被污染）防御：直接 release 避免死循环 step
      if (!Number.isFinite(gap)) { release(); return; }
      if (gap <= 0.5) {
        try { scroller.scrollTop = target; } catch {}
        release();
        return;
      }
      const delta = Math.max(1, Math.min(gap * 0.35, 120));
      try { scroller.scrollTop = current + delta; } catch {}
      this._smoothFollowRafId = this._raf(step);
    };
    // 双 rAF：先让新内容 layout 完成再测量 target
    this._smoothFollowRafId = this._raf(() => {
      if (this._disposed) { release(); return; }
      this._smoothFollowRafId = this._raf(() => {
        if (this._disposed) { release(); return; }
        this.refreshFollowTarget(scroller);
        step();
      });
    });
  }

  cancelSmoothFollow() {
    if (this._disposed) return;
    if (this._smoothFollowRafId !== null) {
      this._cancelRaf(this._smoothFollowRafId);
      this._smoothFollowRafId = null;
    }
    if (this._smoothLockHeld) {
      this._smoothLockHeld = false;
      this._lockDepth = Math.max(0, this._lockDepth - 1);
    }
  }

  // RO 回调统一入口：尺寸变 → 刷缓存 → sticky 时跟到底（受 lock + touchSuppress 守卫）
  handleScrollerResize(el) {
    if (this._disposed) return;
    const target = el || this._boundEl;
    if (!target) return;
    this.refreshFollowTarget(target);
    if (!this._getSticky()) return;
    if (this._lockDepth > 0) return;
    if (this._isWithinTouchSuppress()) return;
    this.writeUnderLock(target, this._followTarget);
  }

  _isWithinTouchSuppress() {
    if (this._recentTouchTs === TOUCH_HOLD_MARKER) return true;
    if (this._recentTouchTs <= 0) return false;
    return (this._now() - this._recentTouchTs) < this._touchSuppressMs;
  }

  // Virtuoso atBottomStateChange 接管入口。
  //
  // 这个方法整合两层职责（按下到上）：
  //   ── (A) Virtuoso 真值修正层 ──
  //         Virtuoso footer 子树（lastResponse / spinner / streamingLiveItem 三段）高度抖动
  //         会让内部 atBottom 误判翻转。用真实 DOM 距离 ≤/> _atBottomPx 兜底，过滤掉抖动。
  //   ── (B) 状态翻转决策层 ──
  //         走 _setSticky 享受 16ms 决策去重（合并同 tick 内 RO + Virtuoso 双发）。
  //
  // 锁期间统一短路（保留 Virtuoso 真实 atBottom 不可靠）。未来若有 iPad 等新 scroller 出
  // 类似 atBottom 不可靠场景，可考虑把 (A) 抽成可插拔的 correctionFn。
  notifyAtBottom(isAtBottom) {
    if (this._disposed) return;
    if (this._lockDepth > 0) return;
    // (A) 真值修正：DOM 实测距离 vs _atBottomPx 兜底
    const el = this._boundEl;
    if (el && typeof el.scrollHeight === 'number') {
      const realGap = (el.scrollHeight ?? 0) - (el.scrollTop ?? 0) - (el.clientHeight ?? 0);
      if (!isAtBottom && this._getSticky() && realGap <= this._atBottomPx) return;
      if (isAtBottom && !this._getSticky() && realGap > this._atBottomPx) return;
    }
    // (B) 翻转决策：走 _setSticky 决策去重
    this._setSticky(!!isAtBottom);
  }
}

export default StickyBottomController;
