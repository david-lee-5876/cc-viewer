import React, { useState, useEffect, useMemo } from 'react';
import { t } from '../../i18n';
import { getModelShort } from '../../utils/helpers';
import { subscribeActive, getActiveWorkflows } from '../../utils/workflowStore';
import { TERMINAL_STATES, STATUS_KEYS, fmtTokens, fmtDuration, stateGlyph } from '../../utils/workflowFormat';
import styles from './WorkflowLiveHud.module.css';

const MAX_ROWS = 8;

function stateClass(state) {
  if (state === 'done' || state === 'completed') return styles.stateDone;
  if (state === 'failed' || state === 'error') return styles.stateFailed;
  if (state === 'queued') return styles.stateQueued;
  return styles.stateRunning;
}

function Row({ agent }) {
  const running = !TERMINAL_STATES.has(agent.state);
  const model = getModelShort(agent.model);
  const dur = fmtDuration(agent.durationMs);
  return (
    <div className={styles.row}>
      <span className={`${styles.dot} ${stateClass(agent.state)} ${running ? styles.statePulse : ''}`}>{stateGlyph(agent.state)}</span>
      <span className={styles.label} title={agent.label}>{agent.label || agent.agentType || agent.agentId}</span>
      {model && <span className={styles.model}>{model}</span>}
      <span className={styles.tok}>{fmtTokens(agent.tokens)} {t('ui.workflow.tok')}</span>
      <span className={styles.tool}>{agent.toolCalls} {t('ui.workflow.tools')}</span>
      {dur && <span className={styles.dur}>{dur}</span>}
    </div>
  );
}

/**
 * 运行中工作流的实时条，docked 在 ChatView 输入框上方（消息滚动区之外），常驻可见、
 * 不被对话挤走。数据来自 workflowStore 活跃集合（AppBase 的 SSE 持续喂养）。
 * 完成后该 run 退出活跃集合 → 条自动消失；内联聊天卡片继续作历史记录。
 */
export default function WorkflowLiveHud() {
  const [active, setActive] = useState(getActiveWorkflows);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState({});
  const [, setTick] = useState(0);

  useEffect(() => subscribeActive(setActive), []);

  const visible = useMemo(
    () => active.filter(d => d && d.runId && !dismissed[d.runId]),
    [active, dismissed]
  );
  const data = visible.length ? visible[visible.length - 1] : null;

  // 运行中每秒走一帧，让「已用时」即使无新事件也继续走动
  useEffect(() => {
    if (!data) return undefined;
    const id = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [data]);

  if (!data) return null;

  const agents = data.agents || [];
  const total = data.agentCount || agents.length;
  const done = agents.filter(a => TERMINAL_STATES.has(a.state)).length;
  const statusLabel = data.status
    ? (STATUS_KEYS[data.status] ? t(STATUS_KEYS[data.status]) : data.status)
    : '';
  const elapsed = data.startTime ? fmtDuration(Date.now() - data.startTime) : '';

  const running = agents.filter(a => !TERMINAL_STATES.has(a.state));
  const rows = (running.length ? running.concat(agents.filter(a => TERMINAL_STATES.has(a.state)).reverse()) : agents).slice(0, MAX_ROWS);
  const moreCount = agents.length - rows.length;

  return (
    <div className={styles.bar} role="status" aria-live="polite">
      <div className={styles.header} onClick={() => setCollapsed(c => !c)}>
        <span className={`${styles.liveDot} ${styles.statePulse}`} />
        <span className={styles.title} title={data.workflowName}>{data.workflowName || t('ui.workflow.title')}</span>
        <span className={styles.stat}>
          {t('ui.workflow.agentsProgress', { done, total })}
          {` · ${fmtTokens(data.totalTokens)} ${t('ui.workflow.tok')}`}
          {` · ${data.totalToolCalls || 0} ${t('ui.workflow.tools')}`}
          {elapsed ? ` · ${elapsed}` : ''}
          {statusLabel ? ` · ${statusLabel}` : ''}
          {visible.length > 1 ? ` · +${visible.length - 1}` : ''}
        </span>
        <span className={styles.actions}>
          <button type="button" className={styles.iconBtn} onClick={(e) => { e.stopPropagation(); setCollapsed(c => !c); }} title={collapsed ? t('ui.expand') : t('ui.collapse')}>
            {collapsed ? '▸' : '▾'}
          </button>
          <button type="button" className={styles.iconBtn} onClick={(e) => { e.stopPropagation(); setDismissed(d => ({ ...d, [data.runId]: true })); }} title={t('ui.workflow.hudClose')}>
            ✕
          </button>
        </span>
      </div>
      {!collapsed && (
        <div className={styles.rows}>
          {rows.map((a, i) => <Row key={a.agentId || i} agent={a} />)}
          {moreCount > 0 && <div className={styles.more}>+{moreCount}…</div>}
        </div>
      )}
    </div>
  );
}
