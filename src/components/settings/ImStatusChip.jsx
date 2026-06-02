import React, { useCallback, useEffect, useState } from 'react';
import { Tooltip } from 'antd';
import { apiUrl } from '../../utils/apiUrl';
import { imTr as _tr } from '../../utils/imTr';
import styles from './ImStatusChip.module.css';

/**
 * Compact, generic IM status chip for the header (one per descriptor). Renders nothing unless the
 * platform's bridge is enabled; otherwise the connection state is conveyed by the brand icon's
 * COLOR — the platform's brand color when connected, grey otherwise (incl. error; the tooltip
 * still spells out the error). Clicking it opens the messaging panel on this platform's tab.
 * Self-contained: polls the platform's status endpoint every 5s.
 */
export default function ImStatusChip({ descriptor, onClick, onStatus }) {
  const [enabled, setEnabled] = useState(false);
  const [connection, setConnection] = useState(null);
  const Icon = descriptor.icon;

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(apiUrl(descriptor.endpoints.status));
      if (!r.ok) return;
      const d = await r.json();
      setEnabled(!!d.enabled);
      setConnection(d.connection || null);
    } catch { /* ignore */ }
  }, [descriptor]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  // 向上汇报状态（供 Electron tab bar 渲染迁移过去的 IM 图标；web 下不传 onStatus，无副作用）。
  useEffect(() => {
    if (!onStatus) return;
    onStatus(descriptor.id, { enabled, connected: !!(connection && connection.connected && !connection.lastError) });
  }, [enabled, connection, onStatus, descriptor.id]);

  if (!enabled) return null;

  let state = 'disconnected';
  if (connection?.lastError) state = 'error';
  else if (connection?.connected) state = 'connected';

  const statusLabel = state === 'connected'
    ? _tr('ui.im.statusConnected', null, 'Connected')
    : state === 'error'
      ? `${_tr('ui.im.statusError', null, 'Error')}: ${connection.lastError}`
      : _tr('ui.im.statusDisconnected', null, 'Disconnected');
  const label = _tr(descriptor.labelKey, null, descriptor.fallback);
  // Brand color when connected, grey otherwise — driven by the descriptor, not a per-brand class.
  const color = state === 'connected' ? descriptor.color : 'var(--text-tertiary, #999)';

  return (
    <Tooltip title={`${label} · ${statusLabel}`}>
      <span className={styles.chip} onClick={onClick} role="button" tabIndex={0}
        aria-label={`${label} · ${statusLabel}`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}>
        <Icon size={16} className={styles.logo} style={{ color }} />
      </span>
    </Tooltip>
  );
}
