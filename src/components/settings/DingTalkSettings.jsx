import React, { useCallback, useEffect, useState } from 'react';
import { Switch, Input, Button, Select, Tag, message } from 'antd';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import { t } from '../../i18n';
import { apiUrl } from '../../utils/apiUrl';
import styles from './DingTalkSettings.module.css';

const _tr = (key, params, fallback) => {
  try { const r = t(key, params); return (r && r !== key) ? r : fallback; } catch { return fallback; }
};

/**
 * DingTalk bridge settings. Self-contained: fetches /api/dingtalk/status on mount and
 * polls every 5s while open so the live connection badge stays fresh. The app_secret is
 * never returned by the server (only hasSecret) — an empty secret field on save means
 * "keep the stored one".
 */
export default function DingTalkSettings() {
  const [enabled, setEnabled] = useState(false);
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [hasSecret, setHasSecret] = useState(false);
  const [allowStaffIds, setAllowStaffIds] = useState([]);
  const [blockOnSkipPermissions, setBlockOnSkipPermissions] = useState(false);
  const [connection, setConnection] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  // 白名单 / 免审批 / 安全说明默认折叠在「更多设置」里，点开再展开 —— 降低首屏信息负担。
  const [showDetails, setShowDetails] = useState(false);

  // fetchStatus(full=true) populates the editable form (mount); full=false only refreshes
  // the live connection badge so the 5s poll never clobbers the user's in-progress edits.
  const fetchStatus = useCallback(async (full) => {
    try {
      const r = await fetch(apiUrl('/api/dingtalk/status'));
      if (!r.ok) return;
      const d = await r.json();
      setConnection(d.connection || null);
      if (full) {
        setEnabled(!!d.enabled);
        setAppKey(d.appKey || '');
        setHasSecret(!!d.hasSecret);
        // 本机(admin)会拿到明文 appSecret → 回填到字段供查阅/复制（👁 可显）；远程不下发 → 留空，
        // 配合「留空则不修改」占位语义（见 placeholder）。
        setAppSecret(d.appSecret || '');
        setAllowStaffIds(Array.isArray(d.allowStaffIds) ? d.allowStaffIds : []);
        setBlockOnSkipPermissions(!!d.blockOnSkipPermissions);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStatus(true);
    const id = setInterval(() => fetchStatus(false), 5000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const save = async () => {
    setSaving(true);
    try {
      const body = { enabled, appKey, allowStaffIds, blockOnSkipPermissions };
      if (appSecret) body.appSecret = appSecret; // empty → server preserves the stored secret
      const r = await fetch(apiUrl('/api/dingtalk/config'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // 重新拉取完整状态：本机回填明文 appSecret（远程则留空，与原行为一致），并刷新 hasSecret / 连接态。
      await fetchStatus(true);
      message.success(_tr('ui.dingtalk.saved', null, 'Saved'));
    } catch {
      message.error(_tr('ui.dingtalk.saveFailed', null, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const testConn = async () => {
    setTesting(true);
    try {
      const body = {};
      if (appKey) body.appKey = appKey;
      if (appSecret) body.appSecret = appSecret;
      const r = await fetch(apiUrl('/api/dingtalk/test'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.ok) message.success(_tr('ui.dingtalk.testOk', null, 'Connection OK'));
      else message.error(_tr('ui.dingtalk.testFail', null, 'Connection failed') + (d.detail ? `: ${d.detail}` : ''));
    } catch {
      message.error(_tr('ui.dingtalk.testFail', null, 'Connection failed'));
    } finally {
      setTesting(false);
    }
  };

  const renderBadge = () => {
    if (!connection) return null;
    if (connection.lastError) return <Tag color="error">{_tr('ui.dingtalk.statusError', null, 'Error')}: {connection.lastError}</Tag>;
    // 仅显示「已连接」：不再拼接 boundConversationId 末 6 位 —— 那段会话 ID 尾巴对用户是无意义乱码，
    // 也属于多余的会话标识暴露。
    if (connection.connected) {
      return <Tag color="success">{_tr('ui.dingtalk.statusConnected', null, 'Connected')}</Tag>;
    }
    return <Tag>{_tr('ui.dingtalk.statusDisconnected', null, 'Disconnected')}</Tag>;
  };

  return (
    <div className={styles.panel}>
      <div className={styles.row}>
        <span className={styles.label}>{_tr('ui.dingtalk.enable', null, 'Enable DingTalk bridge')}</span>
        <span className={styles.control}>
          <Switch checked={enabled} onChange={setEnabled} />
          {renderBadge()}
        </span>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>{_tr('ui.dingtalk.appKey', null, 'AppKey')}<span className={styles.required}>*</span></label>
        <Input value={appKey} onChange={(e) => setAppKey(e.target.value)} placeholder="AppKey" autoComplete="off" />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>{_tr('ui.dingtalk.appSecret', null, 'AppSecret')}<span className={styles.required}>*</span></label>
        <Input.Password
          value={appSecret}
          onChange={(e) => setAppSecret(e.target.value)}
          placeholder={hasSecret ? `••••••  ${_tr('ui.dingtalk.appSecretSaved', null, 'Saved (leave blank to keep)')}` : 'AppSecret'}
          autoComplete="new-password"
        />
      </div>

      <button type="button" className={styles.detailsToggle} onClick={() => setShowDetails((v) => !v)}>
        {showDetails ? <DownOutlined /> : <RightOutlined />}
        <span>{_tr('ui.dingtalk.moreSettings', null, 'More settings')}</span>
      </button>
      {showDetails && (
        <div className={styles.details}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>{_tr('ui.dingtalk.allowStaff', null, 'Sender allowlist (staffId)')}<span className={styles.optional}>{_tr('ui.dingtalk.optional', null, 'Optional')}</span></label>
            <Select
              mode="tags"
              value={allowStaffIds}
              onChange={setAllowStaffIds}
              tokenSeparators={[',', ' ']}
              placeholder={_tr('ui.dingtalk.allowStaffPlaceholder', null, 'staffId, press Enter to add')}
              style={{ width: '100%' }}
              open={false}
            />
          </div>
          <div className={styles.row}>
            <span className={styles.label}>{_tr('ui.dingtalk.blockSkipPerm', null, 'Block injection in skip-permissions sessions')}</span>
            <span className={styles.control}>
              <Switch checked={blockOnSkipPermissions} onChange={setBlockOnSkipPermissions} />
            </span>
          </div>
          <div className={styles.help}>{_tr('ui.dingtalk.blockSkipPermHelp', null, 'When the Claude session runs with --dangerously-skip-permissions, refuse remote injection (which would execute with no approval).')}</div>
          <div className={styles.warn}>{_tr('ui.dingtalk.securityWarn', null, '⚠️ DingTalk messages directly drive the local session.')}</div>
          <div className={styles.hint}>{_tr('ui.dingtalk.singleKeyHint', null, 'Do not connect the same AppKey from multiple programs — use a dedicated DingTalk app for cc-viewer.')}</div>
          <div className={styles.hint}>{_tr('ui.dingtalk.replyDelayHint', null, 'Replies arrive ~10s after the turn completes.')}</div>
        </div>
      )}

      <div className={styles.actions}>
        <Button onClick={testConn} loading={testing}>{_tr('ui.dingtalk.test', null, 'Test connection')}</Button>
        <Button type="primary" onClick={save} loading={saving}>{_tr('ui.dingtalk.save', null, 'Save')}</Button>
      </div>
    </div>
  );
}
