import React from 'react';
import { Popconfirm, Modal } from 'antd';
import { isMobile } from '../../env';
import { t } from '../../i18n';

// 缩略图 × 移除按钮的统一二次确认包装：
//   desktop → antd Popconfirm（紧凑、贴近按钮）
//   mobile (含 pad) → antd Modal.confirm 命令式弹窗（居中、点击目标更大，绕开 Popconfirm 在小
//   触控目标上不稳的问题）
export default function ConfirmRemoveButton({
  title,
  onConfirm,
  className,
  ariaLabel,
  tag = 'button',
  children,
  onPopupOpenChange,
}) {
  const Tag = tag;
  const role = tag === 'button' ? undefined : 'button';

  if (isMobile) {
    const handleClick = (e) => {
      e.stopPropagation();
      onPopupOpenChange?.(true);
      Modal.confirm({
        title,
        okText: t('ui.common.confirmYes'),
        cancelText: t('ui.common.confirmCancel'),
        okButtonProps: { danger: true },
        centered: true,
        zIndex: 1200,
        onOk: () => { onConfirm(); onPopupOpenChange?.(false); },
        onCancel: () => onPopupOpenChange?.(false),
      });
    };
    return (
      <Tag
        className={className}
        onClick={handleClick}
        aria-label={ariaLabel}
        role={role}
      >
        {children}
      </Tag>
    );
  }

  return (
    <Popconfirm
      title={title}
      okText={t('ui.common.confirmYes')}
      cancelText={t('ui.common.confirmCancel')}
      okButtonProps={{ danger: true }}
      onOpenChange={onPopupOpenChange}
      onConfirm={(e) => { e?.stopPropagation(); onConfirm(); }}
      onCancel={(e) => e?.stopPropagation()}
    >
      <Tag
        className={className}
        onClick={(e) => e.stopPropagation()}
        aria-label={ariaLabel}
        role={role}
      >
        {children}
      </Tag>
    </Popconfirm>
  );
}
