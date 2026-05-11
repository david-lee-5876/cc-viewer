import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { uploadFileAndGetPath } from './TerminalPanel';
import { apiUrl } from '../utils/apiUrl';
import { isMobile, isPad } from '../env';
import { t, getLang } from '../i18n';
import ImageLightbox from './ImageLightbox';
import ConfirmRemoveButton from './ConfirmRemoveButton';
import styles from './ChatInputBar.module.css';

const SpeechRec = typeof window !== 'undefined' && window.isSecureContext
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

const SPEECH_LANG_MAP = {
  zh: 'zh-CN', 'zh-TW': 'zh-TW', en: 'en-US', ko: 'ko-KR',
  ja: 'ja-JP', de: 'de-DE', es: 'es-ES', fr: 'fr-FR',
  it: 'it-IT', da: 'da-DK', pl: 'pl-PL', ru: 'ru-RU',
  ar: 'ar-SA', no: 'nb-NO', 'pt-BR': 'pt-BR', th: 'th-TH',
  tr: 'tr-TR', uk: 'uk-UA',
};

function ChatInputBar({ inputRef, inputEmpty, inputSuggestion, terminalVisible, onKeyDown, onChange, onSend, onStop, onSuggestionClick, onUploadPath, presetItems, onPresetSend, onOpenPresetModal, onOpenUltraPlan, onClearContext, isStreaming, streamingFading, pendingImages, onRemovePendingImage, setContextBarSlot }) {
  const [plusOpen, setPlusOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [lightbox, setLightbox] = useState(null);
  const recRef = useRef(null);
  const anchorRef = useRef({ prefix: '', suffix: '' });
  const rootRef = useRef(null);

  useEffect(() => () => {
    const rec = recRef.current;
    if (rec) {
      rec.onend = null;
      rec.onresult = null;
      rec.onerror = null;
      try { rec.abort(); } catch {}
      recRef.current = null;
    }
  }, []);

  // 把 ChatInputBar 顶部到视口底部的距离写到 document CSS 变量 --chat-input-bar-height。
  // 用于移动端 .panelGlobal（Mobile.jsx 全局渲染，不在 .inputStack 内）动态上浮。
  //
  // 必须使用 getBoundingClientRect() 而非 offsetHeight，因为 mobileChatInner 在手机端
  // 有 zoom:0.6 / scale(0.6) 缩放，而 .panelGlobal 在缩放容器外用 viewport px 定位。
  // getBoundingClientRect 已包含所有 transform/zoom 效果，属视口坐标。
  //
  // 视口高度必须用 visualViewport.height（iOS Safari 键盘开启时 window.innerHeight
  // 不会变，interactive-widget=resizes-content 在 WebKit 不生效，只有 visualViewport
  // 才反映真实可视区）。fallback 到 innerHeight 是为了不支持 visualViewport 的环境。
  //
  // useLayoutEffect 同步首次写入避免首帧竞态；只监听 visualViewport.resize（iOS 键盘升降），
  // 不监听 scroll —— scroll 在 iOS 动量滚动期间每帧触发，会让面板随惯性抖动。
  //
  // 依赖 [terminalVisible]：terminalVisible=true 时本组件早期 return null/chip，
  // <div ref={rootRef}> 不再渲染，rootRef.current 变成 null。若依赖留空 []，
  // 旧 effect 的 cleanup 不会触发，闭包里的 el 仍指向已脱离 DOM 的旧元素；后续
  // visualViewport.resize（开 Terminal 时 transform transition / iOS 键盘 / 浏览器
  // 工具栏抖动均会触发）调用 setVar，对脱离 DOM 的元素 getBoundingClientRect() 返回
  // {top:0,...}，让 distFromBottom = vh（≈ 800px），写入 --chat-input-bar-height: 800px，
  // 把 .panelGlobal 的 bottom 顶到 812px 飞出屏幕。改为 [terminalVisible] 后，切换时
  // 旧 listener 正确 disconnect，新 effect 拿到当前 rootRef；null 时清除 CSS 变量让
  // .panelGlobal 回退 fallback 200px（max() 兜底 56px），即 Terminal 模式下 modal
  // 自然贴底 212px。
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) {
      document.documentElement.style.removeProperty('--chat-input-bar-height');
      return;
    }
    // 折算祖先 zoom：Android WebView 在 zoom 容器内 getBoundingClientRect() 给的是 zoom 前 layout
    // 坐标，乘 parentZoom 才是视觉坐标；Chrome/Safari/iPad（zoom=1 或 pad-mode 覆盖回 1）天然
    // parentZoom=1，乘 1 等价于不动。每次 setVar 重读，支持运行时 mobile↔pad 切换。
    const findParentZoom = () => {
      let p = el.parentElement;
      while (p) {
        const z = parseFloat(getComputedStyle(p).zoom);
        if (z && z > 0 && z !== 1) return z;
        p = p.parentElement;
      }
      return 1;
    };
    const setVar = () => {
      // 防御 stale el：极端情况下 RO / vv callback 可能在 el 卸载后的下一轮派发仍触发。
      // isConnected 兜底 detached 节点；w=h=0 兜底 display:none 祖先（attached 但无 layout box）。
      if (!el.isConnected) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const visualTop = rect.top * findParentZoom();
      const distFromBottom = vh - visualTop;
      // 拒绝异常量测（rect.top ≥ vh 让 distFromBottom ≤ 0）；正常小输入栏 ≥ 50px 远高于阈值。
      if (distFromBottom < 5) return;
      document.documentElement.style.setProperty('--chat-input-bar-height', distFromBottom + 'px');
    };
    setVar();
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(setVar);
      ro.observe(el);
    }
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', setVar);
    }
    window.addEventListener('resize', setVar);
    return () => {
      if (ro) ro.disconnect();
      if (vv) {
        vv.removeEventListener('resize', setVar);
      }
      window.removeEventListener('resize', setVar);
    };
  }, [terminalVisible]);

  useEffect(() => {
    if (terminalVisible && recRef.current) {
      try { recRef.current.abort(); } catch {}
    }
  }, [terminalVisible]);

  const startRecording = () => {
    if (!SpeechRec || recRef.current) return;
    const ta = inputRef?.current;
    if (!ta) return;
    const pos = typeof ta.selectionStart === 'number' ? ta.selectionStart : ta.value.length;
    anchorRef.current = { prefix: ta.value.slice(0, pos), suffix: ta.value.slice(pos) };

    let rec;
    try { rec = new SpeechRec(); } catch (err) {
      console.error('[CC Viewer] SpeechRecognition init failed:', err);
      return;
    }
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = SPEECH_LANG_MAP[getLang()] || 'en-US';

    rec.onresult = (event) => {
      const t2 = inputRef?.current;
      if (!t2) return;
      const { prefix, suffix } = anchorRef.current;
      // 外部(Tab补全/发送/ClearContext)改过 textarea.value 就放弃合并，避免把已发送的内容写回
      if (!t2.value.startsWith(prefix) || !t2.value.endsWith(suffix)) {
        try { rec.abort(); } catch {}
        return;
      }
      let interim = '';
      let finalAcc = '';
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        const transcript = r[0]?.transcript ?? '';
        if (r.isFinal) finalAcc += transcript;
        else interim += transcript;
      }
      t2.value = prefix + finalAcc + suffix;
      t2.style.height = 'auto';
      t2.style.height = Math.min(t2.scrollHeight, 120) + 'px';
      setInterimText(interim);
      onChange?.({ target: t2 });
    };
    rec.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        try { alert(t('ui.chatInput.voicePermissionDenied')); } catch {}
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.error('[CC Viewer] SpeechRecognition error:', event.error);
      }
    };
    rec.onend = () => {
      setRecording(false);
      setInterimText('');
      recRef.current = null;
    };

    try {
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch (err) {
      console.error('[CC Viewer] SpeechRecognition start failed:', err);
    }
  };

  const stopRecording = () => {
    try { recRef.current?.stop(); } catch {}
  };

  const toggleRecording = () => {
    if (recRef.current) stopRecording(); else startRecording();
  };

  const handleTextareaInput = (e) => {
    if (recRef.current && e.nativeEvent?.inputType && !e.nativeEvent?.isComposing) {
      try { recRef.current.abort(); } catch {}
    }
    onChange?.(e);
  };

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        try {
          const file = item.getAsFile();
          if (!file) return;
          const path = await uploadFileAndGetPath(file);
          onUploadPath?.(path);
        } catch (err) {
          console.error('[CC Viewer] Paste image upload failed:', err);
        }
        return;
      }
    }
  };

  if (terminalVisible) {
    if (!inputSuggestion) return null;
    return (
      <div className={styles.suggestionChip} onClick={onSuggestionClick}>
        <span className={styles.suggestionChipText}>{inputSuggestion}</span>
        <span className={styles.suggestionChipAction}>↵</span>
      </div>
    );
  }

  return (
    <div className={styles.chatInputBar} ref={rootRef}>
      <div className={styles.chatInputWrapper}>
        <div className={styles.chatTextareaWrap}>
          {pendingImages && pendingImages.length > 0 && (
            <div className={styles.imagePreviewStrip}>
              {pendingImages.map((img, i) => {
                const fileName = img.path.split('/').pop() || img.path;
                const isImage = /\.(png|jpe?g|gif|svg|bmp|webp|avif|ico|icns)$/i.test(fileName);
                const src = apiUrl(`/api/file-raw?path=${encodeURIComponent(img.path)}`);
                return isImage ? (
                  <div key={img.path} className={styles.imagePreviewItem}>
                    <img
                      src={src}
                      className={styles.imagePreviewThumb}
                      alt={fileName}
                      role="button"
                      tabIndex={0}
                      onClick={() => setLightbox({ src, alt: fileName })}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLightbox({ src, alt: fileName }); } }}
                    />
                    <ConfirmRemoveButton
                      title={t('ui.chatInput.confirmRemoveImage')}
                      onConfirm={() => onRemovePendingImage?.(i)}
                      className={styles.imagePreviewRemove}
                      ariaLabel={t('ui.chatInput.removeImage')}
                    >&times;</ConfirmRemoveButton>
                  </div>
                ) : (
                  <div key={img.path} className={styles.filePreviewChip}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className={styles.filePreviewName}>{fileName}</span>
                    <ConfirmRemoveButton
                      title={t('ui.chatInput.confirmRemoveFile')}
                      onConfirm={() => onRemovePendingImage?.(i)}
                      className={styles.filePreviewClose}
                      ariaLabel={t('ui.chatInput.removeImage')}
                    >&times;</ConfirmRemoveButton>
                  </div>
                );
              })}
            </div>
          )}
          <div className={styles.textareaWithGhost}>
            <textarea
              ref={inputRef}
              className={styles.chatTextarea}
              placeholder={inputSuggestion ? '' : t('ui.chatInput.placeholder')}
              rows={1}
              onKeyDown={onKeyDown}
              onInput={handleTextareaInput}
              onPaste={handlePaste}
            />
            {inputSuggestion && inputEmpty && (
              <div className={styles.ghostText}>{inputSuggestion}</div>
            )}
            {recording && interimText && (
              <div className={styles.interimPreview}>{interimText}</div>
            )}
          </div>
        </div>
        <div className={styles.chatInputBottom}>
          <div className={styles.chatInputBottomLeft}>
          <div className={styles.plusArea}>
            <button className={`${styles.plusBtn}${plusOpen ? ` ${styles.plusBtnOpen}` : ''}`} onClick={() => setPlusOpen(p => !p)} title={t('ui.chatInput.more')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            {plusOpen && (
              <>
              <div className={styles.plusOverlay} onClick={() => setPlusOpen(false)} />
              <div className={styles.plusMenu}>
                {presetItems && presetItems.length > 0 && onOpenPresetModal && (
                  <button className={`${styles.plusMenuItem} ${styles.plusMenuItemMuted}`} onClick={() => { setPlusOpen(false); onOpenPresetModal(); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    <span className={styles.presetLabel}>{t('ui.terminal.customShortcuts')}</span>
                  </button>
                )}
                {presetItems && presetItems.length > 0 && presetItems.map(item => {
                  const isBuiltinRaw = item.builtinId && !item.modified;
                  const name = isBuiltinRaw ? t(item.teamName) : item.teamName;
                  const desc = isBuiltinRaw ? t(item.description) : item.description;
                  return (
                    <button key={item.id} className={styles.plusMenuItem} onClick={() => {
                      setPlusOpen(false);
                      onPresetSend?.(desc);
                    }} title={desc}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      <span className={styles.presetLabel}>{name || desc}</span>
                    </button>
                  );
                })}
                {onOpenUltraPlan && (
                  <button className={styles.plusMenuItem} onClick={() => { setPlusOpen(false); onOpenUltraPlan(); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="2.5"/><ellipse cx="12" cy="12" rx="10" ry="4"/>
                      <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/>
                      <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>
                    </svg>
                    <span>UltraPlan</span>
                  </button>
                )}
                {onClearContext && (
                  <button className={styles.plusMenuItem} onClick={() => { setPlusOpen(false); onClearContext(); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M5 6v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                    </svg>
                    <span>{t('ui.chatInput.clearContext')}</span>
                  </button>
                )}
                <button className={styles.plusMenuItem} onClick={() => {
                  setPlusOpen(false);
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.onchange = async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const path = await uploadFileAndGetPath(file);
                      onUploadPath(path);
                    } catch (err) {
                      console.error('[CC Viewer] Upload failed:', err);
                    }
                  };
                  input.click();
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span>{t('ui.terminal.upload')}</span>
                </button>
              </div>
              </>
            )}
          </div>
          {SpeechRec && (
            <button
              type="button"
              className={`${styles.micBtn}${recording ? ` ${styles.micBtnRecording}` : ''}`}
              onClick={toggleRecording}
              title={t(recording ? 'ui.chatInput.voiceStop' : 'ui.chatInput.voiceStart')}
              aria-label={t(recording ? 'ui.chatInput.voiceStop' : 'ui.chatInput.voiceStart')}
              aria-pressed={recording}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>
          )}
          </div>
          {/* 中段：血条 portal slot；终端关闭 + 非纯移动端时挂在左/右控件之间，
              flex-basis 200 + flex-shrink 1 自适应填充至 200px 上限；AppHeader 通过 createPortal 把 LiveTagPopover 渲染进来 */}
          {!(isMobile && !isPad) && !terminalVisible && setContextBarSlot && (
            <div className={styles.ctxBarSlot} ref={setContextBarSlot} />
          )}
          <div className={styles.chatInputBottomRight}>
          <div className={styles.chatInputHint}>
            {(isMobile && !isPad)
              ? null
              : (inputSuggestion && inputEmpty ? t('ui.chatInput.hintTab') : t('ui.chatInput.hintEnter'))}
          </div>
          <div className={styles.sendBtnWrap}>
            {(isStreaming || streamingFading) && (
              <div className={`${styles.streamingSpinner}${streamingFading ? ` ${styles.streamingSpinnerFading}` : ''}`} aria-hidden="true">
                <svg className={styles.streamingSvg} viewBox="0 0 32 32">
                  <circle cx="16" cy="16" r="15" pathLength="100" fill="none" strokeWidth="1.5"
                    stroke="var(--color-primary-lighter)" strokeOpacity="0.25"
                    strokeLinecap="round" strokeDasharray="14 86" strokeDashoffset="0" />
                  <circle cx="16" cy="16" r="15" pathLength="100" fill="none" strokeWidth="1.5"
                    stroke="var(--color-primary-lighter)" strokeOpacity="0.55"
                    strokeLinecap="round" strokeDasharray="7 93" strokeDashoffset="-6" />
                  <circle cx="16" cy="16" r="15" pathLength="100" fill="none" strokeWidth="1.5"
                    stroke="var(--color-primary-lighter)" strokeOpacity="1"
                    strokeLinecap="round" strokeDasharray="3 97" strokeDashoffset="-10" />
                </svg>
              </div>
            )}
            {isStreaming && onStop ? (
              <button
                type="button"
                className={styles.sendBtn}
                onClick={onStop}
                title={t('ui.chatInput.stop')}
                aria-label={t('ui.chatInput.stop')}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                  <rect x="1" y="1" width="10" height="10" rx="1.5" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                className={`${styles.sendBtn} ${inputEmpty && !(pendingImages?.length) ? styles.sendBtnDisabled : ''}`}
                onClick={onSend}
                disabled={inputEmpty && !(pendingImages?.length)}
                title={t('ui.chatInput.send')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            )}
          </div>
          </div>
        </div>
      </div>
      {lightbox && (
        <ImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}

export default ChatInputBar;
