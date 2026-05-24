import React, { useState, useEffect } from 'react';
import { Modal, Button, Popconfirm } from 'antd';
import { t } from '../../i18n';
import ConceptHelp from '../common/ConceptHelp';
import styles from './CustomUltraplanEditModal.module.css';

export default function CustomUltraplanEditModal({ open, initial, onSave, onDelete, onClose }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (open) {
      setTitle(initial?.title || '');
      setContent(initial?.content || '');
    }
  }, [open, initial]);

  const canSave = title.trim().length > 0 && content.trim().length > 0;
  const isEdit = !!initial?.id;

  const handleSave = () => {
    if (!canSave) return;
    const id = isEdit ? initial.id : `cue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    onSave({ id, title: title.trim(), content: content.trim() });
  };

  const handleDelete = () => {
    if (!isEdit) return;
    onDelete(initial.id);
  };

  const footer = (
    <div className={styles.footer}>
      <div className={styles.footerLeft}>
        {isEdit && (
          <Popconfirm
            title={t('ui.ultraplan.customDeleteConfirm')}
            okText={t('ui.ultraplan.customDelete')}
            cancelText={t('ui.ultraplan.customCancel')}
            onConfirm={handleDelete}
          >
            <Button danger>{t('ui.ultraplan.customDelete')}</Button>
          </Popconfirm>
        )}
      </div>
      <div className={styles.footerRight}>
        <Button onClick={onClose}>{t('ui.ultraplan.customCancel')}</Button>
        <Button type="primary" disabled={!canSave} onClick={handleSave}>{t('ui.ultraplan.customSave')}</Button>
      </div>
    </div>
  );

  return (
    <Modal
      title={
        <span className={styles.titleRow}>
          {isEdit ? t('ui.ultraplan.customEditTitle') : t('ui.ultraplan.customCreateTitle')}
          <ConceptHelp doc="CustomUltraplanExpert" zIndex={1300} />
        </span>
      }
      open={open}
      onCancel={onClose}
      footer={footer}
      width={600}
      zIndex={1200}
      destroyOnClose
      styles={{ content: { background: 'var(--bg-elevated)', border: '1px solid var(--border-light)' }, header: { background: 'var(--bg-elevated)', borderBottom: 'none' } }}
    >
      <div className={styles.field}>
        <input
          className={styles.titleInput}
          placeholder={t('ui.ultraplan.customTitlePlaceholder')}
          value={title}
          maxLength={30}
          onChange={e => setTitle(e.target.value)}
          autoFocus
        />
      </div>
      <div className={styles.field}>
        <textarea
          className={styles.contentTextarea}
          placeholder={t('ui.ultraplan.customContentPlaceholder')}
          value={content}
          rows={10}
          onChange={e => setContent(e.target.value)}
        />
      </div>
    </Modal>
  );
}
