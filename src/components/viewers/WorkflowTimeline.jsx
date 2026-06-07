import React from 'react';
import { t } from '../../i18n';
import { TERMINAL_STATES, fmtDuration, phaseColor } from '../../utils/workflowFormat';
import styles from './WorkflowTimeline.module.css';

// 失败/运行中/排队走语义色类；完成条按阶段着色（内联 background）。
function barClass(state) {
  if (state === 'failed' || state === 'error') return styles.barFailed;
  if (state === 'queued') return styles.barQueued;
  if (state === 'done' || state === 'completed') return '';  // 完成 → 阶段色（内联）
  return styles.barRunning;                                   // 运行中
}

/**
 * 时间轴/甘特：每个 agent 一条 startedAt→duration 横条，直观看出并行与长尾瓶颈。
 * 运行中的横条延伸到 now（调用方每秒喂一帧）。完成条按 phaseIndex 着色。
 * compact: HUD 紧凑版（更窄标签、更矮横条）。
 */
export default function WorkflowTimeline({ data, now, compact }) {
  const agents = (data.agents || []).filter(a => typeof a.startedAt === 'number');
  if (!agents.length) return <div className={styles.notice}>{t('ui.workflow.noTimeline')}</div>;

  const endOf = (a) => a.startedAt + (typeof a.durationMs === 'number' ? a.durationMs : Math.max(0, now - a.startedAt));
  const start = Math.min(...agents.map(a => a.startedAt));
  const end = Math.max(...agents.map(endOf));
  const span = Math.max(1, end - start);
  const sorted = [...agents].sort((x, y) => x.startedAt - y.startedAt);

  return (
    <div className={`${styles.timeline} ${compact ? styles.compact : ''}`}>
      {sorted.map((a, i) => {
        const running = !TERMINAL_STATES.has(a.state);
        const done = a.state === 'done' || a.state === 'completed';
        const aEnd = endOf(a);
        const left = ((a.startedAt - start) / span) * 100;
        const width = Math.max(1.5, ((aEnd - a.startedAt) / span) * 100);
        const d = fmtDuration(a.durationMs ?? Math.max(0, now - a.startedAt));
        const barStyle = { left: `${left}%`, width: `${width}%` };
        if (done) barStyle.background = phaseColor(a.phaseIndex);
        return (
          <div key={a.agentId || i} className={styles.ganttRow}>
            <span className={styles.ganttLabel} title={a.label}>{a.label || a.agentType || a.agentId}</span>
            <div className={styles.ganttTrack}>
              <div
                className={`${styles.ganttBar} ${barClass(a.state)} ${running ? styles.statePulse : ''}`}
                style={barStyle}
                title={`${a.label || ''}${a.phaseTitle ? ` · ${a.phaseTitle}` : ''} · ${d}`}
              >
                <span className={styles.ganttDur}>{d}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
