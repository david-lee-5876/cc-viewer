import React, { useCallback, useEffect, useState } from 'react';
import { Tooltip } from 'antd';
import { t } from '../../i18n';
import { apiUrl } from '../../utils/apiUrl';
import DingTalkIcon from '../common/DingTalkIcon';
import styles from './DingTalkStatusChip.module.css';

const _tr = (key, params, fallback) => {
  try { const r = t(key, params); return (r && r !== key) ? r : fallback; } catch { return fallback; }
};

/**
 * Compact DingTalk status chip for the header. Renders nothing unless the bridge is enabled;
 * otherwise the connection state is conveyed by the DingTalk icon's COLOR — blue when
 * connected, grey otherwise (incl. error; the tooltip still spells out the error). Clicking it
 * opens the messaging panel (onClick), where DingTalk is the selected tool. Self-contained:
 * polls /api/dingtalk/status every 5s.
 */
export default function DingTalkStatusChip({ onClick }) {
  const [enabled, setEnabled] = useState(false);
  const [connection, setConnection] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(apiUrl('/api/dingtalk/status'));
      if (!r.ok) return;
      const d = await r.json();
      setEnabled(!!d.enabled);
      setConnection(d.connection || null);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  if (!enabled) return null;

  let state = 'disconnected';
  if (connection?.lastError) state = 'error';
  else if (connection?.connected) state = 'connected';

  const statusLabel = state === 'connected'
    ? _tr('ui.dingtalk.statusConnected', null, 'Connected')
    : state === 'error'
      ? `${_tr('ui.dingtalk.statusError', null, 'Error')}: ${connection.lastError}`
      : _tr('ui.dingtalk.statusDisconnected', null, 'Disconnected');
  const label = _tr('ui.messaging.dingtalk', null, 'DingTalk');

  return (
    <Tooltip title={`${label} · ${statusLabel}`}>
      <span className={styles.chip} onClick={onClick} role="button" tabIndex={0}
        aria-label={`${label} · ${statusLabel}`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}>
        <DingTalkIcon size={16} className={`${styles.logo} ${state === 'connected' ? styles.connected : styles.disconnected}`} />
      </span>
    </Tooltip>
  );
}
