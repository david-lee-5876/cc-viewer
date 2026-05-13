import React, { useState, useEffect, useRef, useContext } from 'react';
import { t } from '../i18n';
import { SettingsContext } from '../contexts/SettingsContext';
import { playEvent as playVoiceEvent } from '../utils/voicePackPlayer';
import styles from './ChatMessage.module.css';

// Voice-pack warning thresholds (ms remaining). Two-tier:
// 60 s alone is too late — user may already be away from the keyboard.
const VOICE_WARNING_THRESHOLDS = [
  { eventKey: 'timeoutWarning5min', remainingMs: 5 * 60 * 1000 },
  { eventKey: 'timeoutWarning60s',  remainingMs: 60 * 1000 },
];

// Derived from VOICE_WARNING_THRESHOLDS so adding a 3rd threshold (e.g. 30 min)
// doesn't require updating both lists().
const _emptyFiredLatch = () =>
  VOICE_WARNING_THRESHOLDS.reduce((acc, { eventKey }) => { acc[eventKey] = false; return acc; }, {});

/**
 * AskUserQuestion 倒计时显示 — 独立小组件，自己持有 setInterval，
 * 不让 AskQuestionForm 每秒整体 re-render。
 *
 * 校准模式（不是 setTimeout 递归累加）：
 *   每次 tick 都基于 wall-clock `Date.now() - startedAt` 实时计算剩余时间。
 *   setInterval drift / background tab throttle / 浏览器 sleep 醒来都不影响显示值 —
 *   tick 推迟会让下次显示直接跳到正确剩余时间，不累积偏差。
 *   visibility 'visible' 时也额外 force 重算一次给即时反馈。
 *
 * 内存回收三道闸：
 *   1. useEffect cleanup 在 unmount 时 clearInterval + removeEventListener
 *   2. remaining ≤ 0 时主动 clearInterval（防超时后空跑）
 *   3. startedAt/timeoutMs prop 变化时 effect 重新订阅（旧 interval 被 cleanup 回收）
 */
export default function AskTimeoutCountdown({ startedAt, timeoutMs }) {
  // 防御：startedAt / timeoutMs 缺失或非法时不渲染（老 server 不发这俩字段）
  const validStartedAt = typeof startedAt === 'number' && startedAt > 0 ? startedAt : null;
  const validTimeoutMs = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : null;

  const compute = () => {
    if (!validStartedAt || !validTimeoutMs) return null;
    return Math.max(0, validTimeoutMs - (Date.now() - validStartedAt));
  };

  const [remaining, setRemaining] = useState(compute);
  const timerRef = useRef(null);
  // Per-threshold latch — each warning fires at most once per (startedAt, timeoutMs).
  // Resets in the effect when those props change (new ask = new countdown).
  const firedRef = useRef(_emptyFiredLatch());
  const settingsCtx = useContext(SettingsContext);
  // Hold latest voicePack settings in a ref so the tick closure reads fresh values
  // (toggling enabled mid-countdown is a real user flow, and useEffect deps are
  // intentionally minimal — we don't want to tear down the interval on every prefs change).
  // Ref write happens in an effect (NOT during render) to satisfy React StrictMode
  //().
  const voicePackRef = useRef(null);
  useEffect(() => {
    voicePackRef.current = settingsCtx?.preferences?.approvalModal?.voicePack || null;
  });

  useEffect(() => {
    if (!validStartedAt || !validTimeoutMs) return undefined;
    // New (startedAt, timeoutMs) tuple = fresh countdown = re-arm warnings.
    firedRef.current = _emptyFiredLatch();
    // 初始计算一次（prop 变化时同步刷新）
    setRemaining(compute());

    // 已到 0 不起 interval
    const initial = Math.max(0, validTimeoutMs - (Date.now() - validStartedAt));
    if (initial <= 0) return undefined;

    const fireWarningsIfDue = (rMs) => {
      const vp = voicePackRef.current;
      if (!vp || vp.enabled !== true) return;
      for (const { eventKey, remainingMs } of VOICE_WARNING_THRESHOLDS) {
        // Skip if user disabled this specific event (events[key] === null).
        if (!vp.events || !vp.events[eventKey]) continue;
        if (firedRef.current[eventKey]) continue;
        // Threshold *crossing*: only when initial > remainingMs (i.e. we mounted
        // before the warning was due) AND current rMs is at or below the line.
        if (initial > remainingMs && rMs <= remainingMs) {
          firedRef.current[eventKey] = true;
          try { playVoiceEvent(eventKey, vp, { dedupeKey: `${eventKey}:${validStartedAt}` }); } catch {}
        }
      }
    };

    const tick = () => {
      // 每次都基于 wall-clock 重算，drift 不累积
      const r = Math.max(0, validTimeoutMs - (Date.now() - validStartedAt));
      setRemaining(r);
      fireWarningsIfDue(r);
      // 到 0 主动清，防空跑（cleanup 在 unmount 时再清一次，幂等）
      if (r <= 0 && timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    timerRef.current = setInterval(tick, 1000);
    // tab 切回时立刻 force 一次重算，不必等下次 interval tick
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') tick();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [validStartedAt, validTimeoutMs]);

  if (remaining == null) return null;
  if (remaining <= 0) return null; // 超时后由 ws ask-hook-timeout 路径接管，倒计时不再显示

  const totalSec = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  // <1h 段也补 0（MM:SS）防容器宽度从 H:MM:SS 7 字符突跳到 M:SS 4 字符的视觉抖动
  const timeStr = hours > 0
    ? `${hours}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

  // a11y：role="timer" 让屏阅识别；剩余 ≤60s 时 aria-live='polite' 主动播报"快超时"
  // 给盲用户，>60s 则 'off' 不每秒打扰。视觉上 ≤60s 也切 warning 类提示用户。
  const isWarning = remaining <= 60 * 1000;
  const className = isWarning
    ? `${styles.askCountdown} ${styles.askCountdownWarning}`
    : styles.askCountdown;

  return (
    <div
      className={className}
      role="timer"
      aria-live={isWarning ? 'polite' : 'off'}
    >
      {t('ui.askCountdown', { time: timeStr })}
    </div>
  );
}
