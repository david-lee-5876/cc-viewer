import React, { useState, useEffect } from 'react';
import { Modal } from 'antd';
import { MessageOutlined } from '@ant-design/icons';
import { t } from '../../i18n';
import DingTalkSettings from './DingTalkSettings';
import DingTalkIcon from '../common/DingTalkIcon';
import styles from './MessagingModal.module.css';

const _tr = (key, params, fallback) => {
  try { const r = t(key, params); return (r && r !== key) ? r : fallback; } catch { return fallback; }
};

// Registry of IM tools. Add new ones here; the tab strip renders automatically.
// Only DingTalk is shipped for now.
const TOOLS = [
  { id: 'dingtalk', labelKey: 'ui.messaging.dingtalk', fallback: 'DingTalk', icon: <DingTalkIcon size={16} style={{ color: '#1677ff' }} />, render: () => <DingTalkSettings /> },
];

/**
 * "Messaging" entry from the header menu. Lists available IM tools as a Chrome-style tab
 * strip on top and renders the selected tool's settings in the panel below. Extensible:
 * drop another entry into TOOLS. Tab design mirrors the UltraPlan expert tabs.
 */
export default function MessagingModal({ open, onClose, initialTool }) {
  const [selected, setSelected] = useState(initialTool || TOOLS[0].id);
  // When opened from a specific entry point (e.g. the header status chip), jump to that IM.
  useEffect(() => { if (open && initialTool) setSelected(initialTool); }, [open, initialTool]);
  const active = TOOLS.find((x) => x.id === selected) || TOOLS[0];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={680}
      destroyOnClose
      // Modal body 取 --bg-elevated,内部 toolBody 取 --bg-container,二者对比让
      // active tab "拉出贴合下方面板" 的 Chrome 标签观感在明暗主题都成立(对照 UltraPlan)。
      // header 同步取 --bg-elevated,否则 light 下标题栏(antd 默认 #FFF)会与 body(#F9F9F9)错色。
      styles={{ content: { background: 'var(--bg-elevated)' }, header: { background: 'var(--bg-elevated)' } }}
      title={<span><MessageOutlined style={{ marginInlineEnd: 8 }} />{_tr('ui.messaging.title', null, 'Messaging Integrations')}</span>}
    >
      <div className={styles.tabRow}>
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={`${styles.tabBtn}${selected === tool.id ? ` ${styles.tabBtnActive}` : ''}`}
            onClick={() => setSelected(tool.id)}
          >
            {tool.icon}
            <span>{_tr(tool.labelKey, null, tool.fallback)}</span>
          </button>
        ))}
      </div>
      <div className={styles.toolBody}>
        {active.render()}
      </div>
    </Modal>
  );
}
