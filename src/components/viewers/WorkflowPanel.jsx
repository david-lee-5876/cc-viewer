import React, { useState, useEffect, useMemo } from 'react';
import { t } from '../../i18n';
import { apiUrl } from '../../utils/apiUrl';
import { getModelShort, getModelMaxTokens } from '../../utils/helpers';
import { subscribe, getLatest } from '../../utils/workflowStore';
import { TERMINAL_STATES, STATUS_KEYS, fmtDuration, fmtTokens, stateGlyph } from '../../utils/workflowFormat';
import styles from './WorkflowPanel.module.css';

function stateClass(state) {
  if (state === 'done' || state === 'completed') return styles.stateDone;
  if (state === 'failed' || state === 'error') return styles.stateFailed;
  if (state === 'queued') return styles.stateQueued;
  return styles.stateRunning;
}

function AgentRow({ agent }) {
  const model = getModelShort(agent.model);
  const is1M = agent.model && getModelMaxTokens(agent.model) >= 1000000;
  const running = !TERMINAL_STATES.has(agent.state);
  const dur = fmtDuration(agent.durationMs);
  return (
    <div className={styles.agentRow}>
      <span className={`${styles.stateDot} ${stateClass(agent.state)} ${running ? styles.statePulse : ''}`} title={agent.state}>
        {stateGlyph(agent.state)}
      </span>
      <span className={styles.agentLabel} title={agent.label}>{agent.label || agent.agentType || agent.agentId}</span>
      {model && (
        <span className={styles.agentModel}>{model}{is1M ? ' · 1M' : ''}</span>
      )}
      <span className={styles.agentMeta}>
        <span className={styles.metaTok}>{fmtTokens(agent.tokens)} {t('ui.workflow.tok')}</span>
        <span className={styles.metaTool}>{agent.toolCalls} {t('ui.workflow.tools')}</span>
        {dur && <span className={styles.metaDur}>{dur}</span>}
      </span>
    </div>
  );
}

function WorkflowBody({ data }) {
  const activePhaseIndex = useMemo(() => {
    const running = (data.agents || []).filter(a => !TERMINAL_STATES.has(a.state) && typeof a.phaseIndex === 'number');
    if (running.length) return Math.max(...running.map(a => a.phaseIndex));
    return null;
  }, [data]);

  const phases = data.phases || [];
  const agents = data.agents || [];

  // 按 phaseIndex 分组；无 phase 的 agent 归到 0 组（少见）。
  const byPhase = useMemo(() => {
    const m = new Map();
    for (const a of agents) {
      const k = typeof a.phaseIndex === 'number' ? a.phaseIndex : 0;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(a);
    }
    return m;
  }, [agents]);

  return (
    <div className={styles.body}>
      {phases.length > 0 && (
        <div className={styles.phasesCol}>
          <div className={styles.colTitle}>{t('ui.workflow.phases')}</div>
          {phases.map(p => (
            <div
              key={p.index}
              className={`${styles.phaseItem} ${p.index === activePhaseIndex ? styles.phaseActive : ''}`}
              title={p.detail}
            >
              <span className={styles.phaseIdx}>{p.index}</span>
              <span className={styles.phaseTitle}>{p.title}</span>
            </div>
          ))}
        </div>
      )}
      <div className={styles.agentsCol}>
        <div className={styles.colTitle}>{t('ui.workflow.agents', { count: agents.length })}</div>
        {phases.length > 0
          ? phases.map(p => {
              const list = byPhase.get(p.index) || [];
              if (!list.length) return null;
              return (
                <div key={p.index} className={styles.phaseGroup}>
                  <div className={styles.phaseGroupTitle}>{p.title}</div>
                  {list.map((a, i) => <AgentRow key={a.agentId || i} agent={a} />)}
                </div>
              );
            })
          : agents.map((a, i) => <AgentRow key={a.agentId || i} agent={a} />)}
      </div>
    </div>
  );
}

export default function WorkflowPanel({ workflow, resultText, defaultCollapsed }) {
  const runId = workflow?.runId || null;
  const taskId = workflow?.taskId || null;
  const session = workflow?.sessionId || null;
  const project = workflow?.project || null;
  const key = runId || taskId;

  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
  const [data, setData] = useState(() => getLatest(key));
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  // REST 首拉
  useEffect(() => {
    if (!session || (!runId && !taskId)) return;
    let alive = true;
    setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    params.set('session', session);
    if (runId) params.set('runId', runId);
    else if (taskId) params.set('taskId', taskId);
    if (project) params.set('project', project);
    fetch(apiUrl(`/api/workflow-journal?${params.toString()}`))
      .then(r => r.json())
      .then(j => {
        if (!alive) return;
        if (j && j.ok && j.data) {
          // 若 SSE 已先送达权威完成快照（live!==true），别用可能滞后的 REST（含运行中）覆盖回退
          setData(prev => (prev && prev.live === false && j.data.live) ? prev : j.data);
        } else setError(true);
      })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [session, runId, taskId, project]);

  // SSE 实时跟随
  useEffect(() => {
    if (!key) return undefined;
    return subscribe(key, (next) => setData(next));
  }, [key]);

  // 没拿到结构化 id（旧条目）→ 回退纯文本，保持原行为
  if (!session || (!runId && !taskId)) {
    return <pre className={styles.fallback}>{resultText}</pre>;
  }

  const title = data?.workflowName || t('ui.workflow.title');
  const statusLabel = data?.status ? (STATUS_KEYS[data.status] ? t(STATUS_KEYS[data.status]) : data.status) : '';

  return (
    <div className={styles.panel}>
      <div className={styles.header} onClick={() => setCollapsed(c => !c)}>
        <div className={styles.headerMain}>
          <span className={styles.wfName}>{title}</span>
          {data?.summary && <span className={styles.wfSummary}>{data.summary}</span>}
        </div>
        <div className={styles.headerMeta}>
          {data?.live && <span className={`${styles.liveDot} ${styles.statePulse}`} title={statusLabel} />}
          {data && (
            <span className={styles.headerStat}>
              {t('ui.workflow.agentsShort', { count: data.agentCount || 0 })}
              {data.totalTokens ? ` · ${fmtTokens(data.totalTokens)} ${t('ui.workflow.tok')}` : ''}
              {statusLabel ? ` · ${statusLabel}` : ''}
            </span>
          )}
          <span className={styles.toggle}>{collapsed ? t('ui.expand') : t('ui.collapse')}</span>
        </div>
      </div>
      {!collapsed && (
        <>
          {error && !data && <div className={styles.notice}>{t('ui.workflow.loadFailed')}</div>}
          {loading && !data && <div className={styles.notice}>{t('ui.workflow.loading')}</div>}
          {data && <WorkflowBody data={data} />}
        </>
      )}
    </div>
  );
}
