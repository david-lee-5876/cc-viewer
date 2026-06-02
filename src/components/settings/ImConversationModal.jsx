import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, Spin, Empty, Tooltip, message } from 'antd';
import { ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import ChatMessage from '../chat/ChatMessage';
import { cachedBuildToolResultMap } from '../../utils/toolResultBuilder';
import { classifyUserContent, isSystemText, isMainAgent } from '../../utils/contentFilter';
import { mergeMainAgentSessions } from '../../utils/sessionMerge';
import { reconstructEntries } from '../../../server/lib/delta-reconstructor.js';
import { apiUrl } from '../../utils/apiUrl';
import { IM_PLATFORMS } from './imPlatforms';
import { t } from '../../i18n';
import styles from './ImConversationModal.module.css';

// 把一份独立 IM worker 的 .jsonl 重建出的 entries 折叠成 mainAgentSessions。
// 复用纯函数 isMainAgent + mergeMainAgentSessions（后者自带 _timestamp 赋值），不碰 AppBase._processEntries
// 那条 mainAgent-doubling 热路径。
function buildSessionsFromEntries(entries) {
  let sessions = [];
  for (const entry of entries) {
    if (isMainAgent(entry) && entry.body && Array.isArray(entry.body.messages) && !entry._slimmed) {
      sessions = mergeMainAgentSessions(sessions, entry);
    }
  }
  return sessions;
}

// 只读渲染：复用 ChatMessage（isHistoryLog，省略所有交互 on*/active*/lastPending* props → 自动降级）。
function renderSessions(sessions) {
  const out = [];
  sessions.forEach((session, si) => {
    const messages = Array.isArray(session.messages) ? session.messages : [];
    if (messages.length === 0) return;
    const maps = cachedBuildToolResultMap(messages);
    const kp = `s${si}`;
    messages.forEach((msg, mi) => {
      if (!msg) return;
      const ts = msg._timestamp || null;
      const content = msg.content;

      if (msg.role === 'user') {
        if (Array.isArray(content)) {
          const { commands, textBlocks, skillBlocks } = classifyUserContent(content);
          commands.forEach((cmd, ci) => out.push(
            <ChatMessage key={`${kp}-cmd-${mi}-${ci}`} role="user" text={cmd} timestamp={ts} isHistoryLog />
          ));
          skillBlocks.forEach((sb, ski) => {
            const m = (sb.text || '').match(/^#\s+(.+)$/m);
            out.push(<ChatMessage key={`${kp}-skill-${mi}-${ski}`} role="skill-loaded" text={sb.text} skillName={m ? m[1] : 'Skill'} timestamp={ts} isHistoryLog />);
          });
          textBlocks.forEach((tb, ti) => {
            const isPlan = /Implement the following plan:/i.test(tb.text || '');
            out.push(<ChatMessage key={`${kp}-user-${mi}-${ti}`} role={isPlan ? 'plan-prompt' : 'user'} text={tb.text} timestamp={ts} isHistoryLog />);
          });
          // 纯 tool_result 的 user 消息不单独渲染（其结果挂在对应 assistant 的 tool_use 上）。
        } else if (typeof content === 'string' && !isSystemText(content)) {
          const isPlan = /Implement the following plan:/i.test(content);
          out.push(<ChatMessage key={`${kp}-user-${mi}`} role={isPlan ? 'plan-prompt' : 'user'} text={content} timestamp={ts} isHistoryLog />);
        }
      } else if (msg.role === 'assistant') {
        let blocks = null;
        if (Array.isArray(content)) blocks = content.filter((b) => b.type !== 'text' || !isSystemText(b.text));
        else if (typeof content === 'string' && !isSystemText(content)) blocks = [{ type: 'text', text: content }];
        if (blocks && blocks.length > 0) {
          out.push(
            <ChatMessage
              key={`${kp}-asst-${mi}`}
              role="assistant"
              content={blocks}
              toolResultMap={maps.toolResultMap}
              readContentMap={maps.readContentMap}
              editSnapshotMap={maps.editSnapshotMap}
              askAnswerMap={maps.askAnswerMap}
              planApprovalMap={maps.planApprovalMap}
              latestPlanContent={maps.latestPlanContent}
              timestamp={ts}
              displayTs={msg._generatedTs}
              collapseToolResults
              isHistoryLog
            />
          );
        }
      }
    });
  });
  return out;
}

/**
 * IM 对话记录弹窗：点击 header 的 IM logo 打开，展示该 IM 独立 worker 的 Claude Code 会话。
 * 数据：GET /api/im/:platform/logs → 最新 .jsonl → /api/local-log SSE → reconstructEntries → 渲染。
 * 非实时；右上角刷新按钮重新拉取。
 */
export default function ImConversationModal({ open, onClose, platform, onOpenConfig }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  // 上一次 effect 的 {open, platform}：用于区分「纯刷新」（仅 reloadKey 变）与「切平台/重新打开」。
  // 本组件在 AppHeader 里常驻挂载（destroyOnClose 只销毁 Modal 内层，不卸载本组件），故 ref 跨开关存活；
  // HMR remount 时 useRef 会重建为初始值，行为退化为「清空」，安全。
  const prevRef = useRef({ open: false, platform: null });
  // 镜像当前 sessions，供 effect 内异步错误回调判断「是否已有内容」（决定报错走 toast 还是 Empty）。
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const descriptor = IM_PLATFORMS.find((p) => p.id === platform) || null;
  const label = descriptor ? (() => { try { return t(descriptor.labelKey); } catch { return descriptor.fallback; } })() : '';
  const Icon = descriptor?.icon;

  useEffect(() => {
    if (!open || !platform) { prevRef.current = { open, platform }; return undefined; }
    // 纯刷新（仅 reloadKey 变：open 已是 true 且 platform 未变）保留旧内容，避免高度从内容→Spin→内容闪烁；
    // 切平台 / 重新打开则清空，先显示首屏 Spin。
    const isPureRefresh = prevRef.current.open === true && prevRef.current.platform === platform;
    prevRef.current = { open, platform };
    let es = null;
    let cancelled = false;
    setLoading(true); setError(null);
    if (!isPureRefresh) setSessions([]);
    // 刷新失败但已有内容时只弹 toast（不替换正文，避免抖动）；首屏无内容时走 Empty 报错态。
    const reportError = (e) => {
      setError(String(e?.message || e) || 'load_failed');
      if (sessionsRef.current.length > 0) message.error(t('ui.imRecord.loadFailed'));
    };

    (async () => {
      try {
        const r = await fetch(apiUrl(`/api/im/${encodeURIComponent(platform)}/logs`));
        if (!r.ok) throw new Error(`logs ${r.status}`);
        const { latest } = await r.json();
        if (cancelled) return;
        if (!latest) { setSessions([]); setLoading(false); return; }

        const entries = [];
        es = new EventSource(apiUrl(`/api/local-log?file=${encodeURIComponent(latest)}`));
        es.addEventListener('load_chunk', (ev) => {
          try { const chunk = JSON.parse(ev.data); if (Array.isArray(chunk)) for (const e of chunk) entries.push(e); } catch { /* skip bad chunk */ }
        });
        es.addEventListener('load_end', () => {
          es.close();
          if (cancelled) return;
          try {
            const reconstructed = reconstructEntries(entries);
            setSessions(buildSessionsFromEntries(reconstructed));
          } catch (e) { reportError(e); }
          setLoading(false);
        });
        es.onerror = () => { try { es.close(); } catch { /* noop */ } if (!cancelled) { reportError('load_failed'); setLoading(false); } };
      } catch (e) {
        if (!cancelled) { reportError(e); setLoading(false); }
      }
    })();

    return () => { cancelled = true; if (es) try { es.close(); } catch { /* noop */ } };
  }, [open, platform, reloadKey]);

  // 始终基于当前 sessions 渲染（不再 loading?[]:...），刷新时旧内容仍在，高度稳定。
  // renderSessions 是纯函数（内部 cachedBuildToolResultMap 按 messages 引用记忆），重渲廉价。
  const items = renderSessions(sessions);

  const title = (
    <div className={styles.headerBar}>
      {Icon ? <span className={styles.titleIcon} style={{ color: descriptor.color }}><Icon /></span> : null}
      <span>{label ? `${label} · ` : ''}{t('ui.imRecord.title')}</span>
      {onOpenConfig ? (
        <Tooltip title={t('ui.imRecord.config')}>
          <Button
            type="text"
            size="small"
            icon={<SettingOutlined />}
            className={styles.refreshBtn}
            onClick={() => onOpenConfig(platform)}
          />
        </Tooltip>
      ) : null}
      <Tooltip title={t('ui.imRecord.refresh')}>
        <Button
          type="text"
          size="small"
          icon={<ReloadOutlined spin={loading} />}
          className={styles.refreshBtn}
          disabled={loading}
          onClick={() => setReloadKey((k) => k + 1)}
        />
      </Tooltip>
    </div>
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={760}
      destroyOnClose
      title={title}
      styles={{ content: { background: 'var(--bg-elevated)' }, header: { background: 'var(--bg-elevated)' } }}
    >
      <div className={styles.scrollBody}>
        {items.length > 0 ? (
          // 有内容优先渲染（刷新期间也是），保证高度稳定、不塌缩成 Spin
          items
        ) : loading ? (
          // 仅首屏加载（尚无内容）显示整页 Spin；刷新进度改由标题刷新图标的 spin 呈现
          <div className={styles.center}><Spin /><span className={styles.hint}>{t('ui.imRecord.loading')}</span></div>
        ) : error ? (
          <div className={styles.center}>
            <Empty description={t('ui.imRecord.loadFailed')} />
            <Button size="small" onClick={() => setReloadKey((k) => k + 1)}>{t('ui.imRecord.refresh')}</Button>
          </div>
        ) : (
          <Empty description={t('ui.imRecord.empty')} />
        )}
      </div>
    </Modal>
  );
}
