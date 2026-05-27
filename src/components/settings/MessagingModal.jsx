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

// Registry of IM tools. Add new ones here; the left list renders automatically.
// Only DingTalk is shipped for now.
const TOOLS = [
  { id: 'dingtalk', labelKey: 'ui.messaging.dingtalk', fallback: 'DingTalk', icon: <DingTalkIcon size={16} style={{ color: '#1677ff' }} />, render: () => <DingTalkSettings /> },
];

/**
 * "Messaging" entry from the header menu. Lists available IM tools on the left and renders
 * the selected tool's settings on the right. Extensible: drop another entry into TOOLS.
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

      title={<span><MessageOutlined style={{ marginInlineEnd: 8 }} />{_tr('ui.messaging.title', null, 'Messaging Integrations')}</span>}
    >
      <div className={styles.subtitle}>{_tr('ui.messaging.subtitle', null, 'Choose an IM tool to connect')}</div>
      <div className={styles.layout}>
        <div className={styles.toolList}>
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className={`${styles.toolItem}${selected === tool.id ? ` ${styles.toolItemActive}` : ''}`}
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
      </div>
    </Modal>
  );
}
