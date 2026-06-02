import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Switch, Input, Button, Select, Tag, message } from 'antd';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import { apiUrl } from '../../utils/apiUrl';
import { imTr as _tr } from '../../utils/imTr';
import styles from './ImPlatformSettings.module.css';

function defaultValue(field) {
  if (field.type === 'tags') return [];
  if (field.type === 'switch') return false;
  if (field.type === 'select') return field.default ?? (field.options?.[0]?.value ?? '');
  return '';
}

/**
 * Generic, descriptor-driven IM bridge settings form (see imPlatforms.js). Self-contained:
 * fetches the platform's status on mount and polls every 5s while open so the live connection
 * badge stays fresh. Secret (password) fields are never returned by the server (only hasSecret) —
 * an empty secret field on save means "keep the stored one".
 */
export default function ImPlatformSettings({ descriptor }) {
  const initialValues = useMemo(() => {
    const v = {};
    for (const f of descriptor.fields) v[f.key] = defaultValue(f);
    return v;
  }, [descriptor]);

  const [enabled, setEnabled] = useState(false);
  const [values, setValues] = useState(initialValues);
  const [hasSecret, setHasSecret] = useState(false);
  const [connection, setConnection] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const setField = (key, val) => setValues((prev) => ({ ...prev, [key]: val }));

  // fetchStatus(full=true) populates the editable form (mount); full=false only refreshes the live
  // connection badge so the 5s poll never clobbers the user's in-progress edits.
  const fetchStatus = useCallback(async (full) => {
    try {
      const r = await fetch(apiUrl(descriptor.endpoints.status));
      if (!r.ok) return;
      const d = await r.json();
      setConnection(d.connection || null);
      if (full) {
        setEnabled(!!d.enabled);
        setHasSecret(!!d.hasSecret);
        setValues(() => {
          const v = {};
          for (const f of descriptor.fields) {
            const incoming = d[f.key];
            if (f.type === 'tags') v[f.key] = Array.isArray(incoming) ? incoming : [];
            else if (f.type === 'switch') v[f.key] = !!incoming;
            else v[f.key] = incoming ?? defaultValue(f);
          }
          return v;
        });
      }
    } catch { /* ignore */ }
  }, [descriptor]);

  useEffect(() => {
    fetchStatus(true);
    const id = setInterval(() => fetchStatus(false), 5000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const buildBody = (includeEnabled) => {
    const body = includeEnabled ? { enabled } : {};
    for (const f of descriptor.fields) {
      if (f.type === 'password') {
        if (values[f.key]) body[f.key] = values[f.key]; // empty → server preserves the stored secret
      } else {
        body[f.key] = values[f.key];
      }
    }
    return body;
  };

  // 白名单是非必填字段：每个平台恰有一个 type:'tags' 字段（imPlatforms.js），即发送者白名单。
  // 启用且白名单为空时保存仍成功，但弹安全警告（服务端已不再硬拦截）。
  const allowlistField = descriptor.fields.find((f) => f.type === 'tags');
  const isAllowlistEmpty = () => {
    if (!allowlistField) return false;
    const v = values[allowlistField.key];
    return !Array.isArray(v) || v.length === 0;
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(apiUrl(descriptor.endpoints.config), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildBody(true)),
      });
      if (!r.ok) {
        // 透出服务端原因（{error,detail}），别再吞成通用「保存失败」。body 可能为空/非 JSON
        // （如超 MAX_POST_BODY 直接 destroy socket）→ 退回 HTTP 状态码。
        let detail = '';
        try { const e = await r.json(); detail = e.detail || e.error || ''; } catch { detail = `HTTP ${r.status}`; }
        message.error(_tr('ui.im.saveFailed', null, 'Save failed') + (detail ? `: ${detail}` : ''));
        return;
      }
      await fetchStatus(true);
      if (enabled && isAllowlistEmpty()) {
        message.warning(_tr('ui.im.savedNoAllowlistWarn', null, 'Saved. No sender allowlist set: the first conversation that messages the bot is bound and anyone in it can drive the local session with no approval. Add an allowlist under More settings.'), 8);
      } else {
        message.success(_tr('ui.im.saved', null, 'Saved'));
      }
    } catch {
      message.error(_tr('ui.im.saveFailed', null, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const testConn = async () => {
    setTesting(true);
    try {
      const r = await fetch(apiUrl(descriptor.endpoints.test), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildBody(false)),
      });
      const d = await r.json();
      if (d.ok) message.success(_tr('ui.im.testOk', null, 'Connection OK'));
      else message.error(_tr('ui.im.testFail', null, 'Connection failed') + (d.detail ? `: ${d.detail}` : ''));
    } catch {
      message.error(_tr('ui.im.testFail', null, 'Connection failed'));
    } finally {
      setTesting(false);
    }
  };

  const renderBadge = () => {
    if (!connection) return null;
    if (connection.lastError) return <Tag color="error">{_tr('ui.im.statusError', null, 'Error')}: {connection.lastError}</Tag>;
    if (connection.connected) return <Tag color="success">{_tr('ui.im.statusConnected', null, 'Connected')}</Tag>;
    return <Tag>{_tr('ui.im.statusDisconnected', null, 'Disconnected')}</Tag>;
  };

  const renderField = (f) => {
    if (f.type === 'switch') {
      return (
        <React.Fragment key={f.key}>
          <div className={styles.row}>
            <span className={styles.label}>{_tr(f.labelKey, null, f.fallback)}</span>
            <span className={styles.control}><Switch checked={!!values[f.key]} onChange={(v) => setField(f.key, v)} /></span>
          </div>
          {f.helpKey && <div className={styles.help}>{_tr(f.helpKey, null, f.helpFallback)}</div>}
        </React.Fragment>
      );
    }
    return (
      <div className={styles.field} key={f.key}>
        <label className={styles.fieldLabel}>
          {_tr(f.labelKey, null, f.fallback)}
          {f.required && <span className={styles.required}>*</span>}
          {f.optional && <span className={styles.optional}>{_tr('ui.im.optional', null, 'Optional')}</span>}
        </label>
        {f.type === 'text' && (
          <Input value={values[f.key]} onChange={(e) => setField(f.key, e.target.value)} placeholder={_tr(f.labelKey, null, f.fallback)} autoComplete="off" />
        )}
        {f.type === 'password' && (
          <Input.Password
            value={values[f.key]}
            onChange={(e) => setField(f.key, e.target.value)}
            placeholder={hasSecret ? `••••••  ${_tr('ui.im.secretSaved', null, 'Saved (leave blank to keep)')}` : _tr(f.labelKey, null, f.fallback)}
            autoComplete="new-password"
          />
        )}
        {f.type === 'select' && (
          <Select
            value={values[f.key]}
            onChange={(v) => setField(f.key, v)}
            style={{ width: '100%' }}
            options={f.options.map((o) => ({ value: o.value, label: _tr(o.labelKey, null, o.fallback) }))}
          />
        )}
        {f.type === 'tags' && (
          <Select
            mode="tags"
            value={values[f.key]}
            onChange={(v) => setField(f.key, v)}
            tokenSeparators={[',', ' ']}
            placeholder={_tr(f.placeholderKey, null, f.placeholderFallback)}
            style={{ width: '100%' }}
            open={false}
          />
        )}
      </div>
    );
  };

  const mainFields = descriptor.fields.filter((f) => f.section !== 'more');
  const moreFields = descriptor.fields.filter((f) => f.section === 'more');

  return (
    <div className={styles.panel}>
      <div className={styles.row}>
        <span className={styles.label}>{_tr(descriptor.enable.key, null, descriptor.enable.fallback)}</span>
        <span className={styles.control}>
          <Switch checked={enabled} onChange={setEnabled} />
          {renderBadge()}
        </span>
      </div>

      {mainFields.map(renderField)}

      {(moreFields.length > 0 || descriptor.notes?.length > 0) && (
        <button type="button" className={styles.detailsToggle} onClick={() => setShowDetails((v) => !v)}>
          {showDetails ? <DownOutlined /> : <RightOutlined />}
          <span>{_tr('ui.im.moreSettings', null, 'More settings')}</span>
        </button>
      )}
      {showDetails && (
        <div className={styles.details}>
          {moreFields.map(renderField)}
          {(descriptor.notes || []).map((n, i) => (
            <div key={i} className={n.kind === 'warn' ? styles.warn : styles.hint}>{_tr(n.key, null, n.fallback)}</div>
          ))}
        </div>
      )}

      <div className={styles.actions}>
        <Button onClick={testConn} loading={testing}>{_tr('ui.im.test', null, 'Test connection')}</Button>
        <Button type="primary" onClick={save} loading={saving}>{_tr('ui.im.save', null, 'Save')}</Button>
      </div>
    </div>
  );
}
