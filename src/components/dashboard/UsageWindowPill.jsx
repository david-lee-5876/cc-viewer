import React, { memo, useMemo } from 'react';
import { Popover } from 'antd';
import { t } from '../../i18n';
import { pickHeadlineWindow } from '../../utils/rateLimitParser';
import styles from './UsageWindowPill.module.css';

// 与 LiveTagPopover 同款：静态 overlayInnerStyle 提到模块顶层,避免每次 render 新建字面量。
const POPOVER_OVERLAY_STYLE = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-hover)',
  borderRadius: 8,
  padding: '8px 8px',
};

// 0~1 占比 → 百分比文本
function fmtPct(u) {
  return u == null ? '—' : `${Math.round(u * 100)}%`;
}

// 阈值配色:与上下文血条一致(>=80 红 / >=60 黄 / 其余绿)
function colorFor(pct) {
  if (pct >= 80) return 'var(--color-error-light)';
  if (pct >= 60) return 'var(--color-warning-light)';
  return 'var(--color-success)';
}

function statusLabel(s) {
  if (s === 'allowed') return t('ui.usage.statusAllowed');
  if (s === 'rejected') return t('ui.usage.statusRejected');
  if (s === 'queued') return t('ui.usage.statusQueued');
  return s || '';
}

function statusClass(s) {
  if (s === 'rejected') return styles.statusRejected;
  if (s === 'queued') return styles.statusQueued;
  return styles.statusAllowed;
}

// resetAt(毫秒) → "Resets in 2h 13m" / "Resets in 45m" / "Resetting…"。无 resetAt 返回空串。
function resetText(resetAt) {
  if (resetAt == null) return '';
  const diff = resetAt - Date.now();
  if (diff <= 0) return t('ui.usage.resetting');
  const totalMin = Math.floor(diff / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? t('ui.usage.resetsInHM', { h, m }) : t('ui.usage.resetsInM', { m });
}

function windowName(id) {
  return id === '7d' ? t('ui.usage.weekly') : t('ui.usage.fiveHour');
}

function windowShort(id) {
  return id === '7d' ? t('ui.usage.weeklyShort') : '5h';
}

function UsageWindowPill({ planUsage, authType }) {
  const headline = useMemo(() => pickHeadlineWindow(planUsage), [planUsage]);

  const triggerStyle = useMemo(() => {
    const pct = headline && headline.utilization != null ? Math.round(headline.utilization * 100) : 0;
    return {
      '--usage-color': colorFor(pct),
      '--usage-percent': `${Math.min(100, Math.max(0, pct))}%`,
    };
  }, [headline]);

  // 没有套餐限流数据时:OAuth(订阅)显示静默占位 pill,等待数据;其余(API Key / 未知)不渲染。
  if (!planUsage) {
    if (authType === 'OAuth') {
      return (
        <Popover
          content={<div className={styles.pop}>{t('ui.usage.waiting')}</div>}
          trigger="hover"
          placement="top"
          overlayInnerStyle={POPOVER_OVERLAY_STYLE}
        >
          <span className={`${styles.usagePill} ${styles.muted}`} role="button" tabIndex={0} aria-label={t('ui.usage.ariaLabel')}>
            <span className={styles.usageContent}>
              <span className={styles.usageText}>—</span>
            </span>
          </span>
        </Popover>
      );
    }
    return null;
  }

  // pill 文案:同时展示已有的两个窗口(5h / 周),例如 "5h 19% · 周 52%"。
  const pillLabel = planUsage.windows
    .filter((w) => w.utilization != null)
    .map((w) => `${windowShort(w.id)} ${fmtPct(w.utilization)}`)
    .join(' · ');

  const overageRejected = planUsage.overage && planUsage.overage.status === 'rejected';

  const popContent = (
    <div className={styles.pop}>
      <div className={styles.popTitle}>{t('ui.usage.title')}</div>
      {planUsage.windows.map((w) => {
        const rt = resetText(w.resetAt);
        return (
          <div className={styles.row} key={w.id}>
            <span className={styles.rowLabel}>{windowName(w.id)}</span>
            <span className={styles.rowVal}>{fmtPct(w.utilization)}</span>
            {w.status ? <span className={`${styles.status} ${statusClass(w.status)}`}>{statusLabel(w.status)}</span> : null}
            {rt ? <span className={styles.rowReset}>{rt}</span> : null}
          </div>
        );
      })}
      {overageRejected ? (
        <div className={styles.footer}>
          {t('ui.usage.overageRejected')}
          {planUsage.overage.disabledReason === 'out_of_credits'
            ? ` · ${t('ui.usage.reasonOutOfCredits')}`
            : planUsage.overage.disabledReason
              ? ` · ${planUsage.overage.disabledReason}`
              : ''}
        </div>
      ) : null}
    </div>
  );

  return (
    <Popover
      content={popContent}
      trigger="hover"
      placement="topRight"
      overlayInnerStyle={POPOVER_OVERLAY_STYLE}
    >
      <span className={styles.usagePill} style={triggerStyle} role="button" tabIndex={0} aria-label={t('ui.usage.ariaLabel')}>
        <span className={styles.usageFill} />
        <span className={styles.usageContent}>
          <span className={styles.usageText}>{pillLabel}</span>
        </span>
      </span>
    </Popover>
  );
}

export default memo(UsageWindowPill);
