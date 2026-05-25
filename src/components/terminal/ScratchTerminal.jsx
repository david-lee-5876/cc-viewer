// ============================================================================
// scratch (小) terminal 组件 —— 工具栏下方的多 tab 临时 shell 面板
// 区别于"主 terminal"（Claude Code TUI 渲染区，见 TerminalPanel.jsx）
// CSS：scratch 用 .scratchInner + .scratchHost；主 terminal 用 .terminalContainer + .terminalHost
// ============================================================================
import React from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';
import { darkTerminalTheme, lightTerminalTheme } from './terminalThemes';
import styles from './TerminalPanel.module.css';
import { TerminalWriteQueue } from '../../utils/terminalWriteQueue';
import { appendToken } from '../../utils/apiUrl';

class ScratchTerminal extends React.Component {
  constructor(props) {
    super(props);
    this.containerRef = React.createRef();
    this.terminal = null;
    this.fitAddon = null;
    this.ws = null;
    this.resizeObserver = null;
    // 写入节流复用 TerminalPanel 同款 utility（utils/terminalWriteQueue.js）。
    // ScratchTerminal 历史用 [string].push + join 的实现，单字符串 push 不存在
    // O(n²) 切片问题，但 unmount 时同样会丢最后 16ms buffer；改用 utility 统一行为。
    this._writeQ = new TerminalWriteQueue(() => this.terminal);
    this._closing = false;
  }

  componentDidMount() {
    this.initTerminal();
    this.connectWebSocket();
    this.setupResizeObserver();
    this._themeObserver = new MutationObserver(() => {
      if (this.terminal) {
        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        this.terminal.options.theme = isDark ? darkTerminalTheme : lightTerminalTheme;
      }
    });
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  componentWillUnmount() {
    this._closing = true;
    if (this._wsReconnectTimer) clearTimeout(this._wsReconnectTimer);
    if (this._themeObserver) { this._themeObserver.disconnect(); this._themeObserver = null; }
    // unmount 前同步排空 buffer 给 xterm，再 dispose 队列；与 terminal.dispose 顺序无关。
    if (this._writeQ) {
      try { this._writeQ.drain(); } catch {}
      this._writeQ.dispose();
    }
    if (this._resizeDebounceTimer) clearTimeout(this._resizeDebounceTimer);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    // 解绑 textarea focus/blur 监听并把 parent 的 focus state 清掉，
    // 防止 toggle 关闭 scratch 时 .scratchPanesFocused 边框残留亮起
    if (this.terminal?.textarea) {
      try {
        this.terminal.textarea.removeEventListener('focus', this._handleScratchFocus);
        this.terminal.textarea.removeEventListener('blur', this._handleScratchBlur);
      } catch {}
    }
    try { this.props.onFocusChange?.(false); } catch {}
    if (this.ws) {
      this.ws.onclose = null;
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    if (this.terminal) {
      try { this.terminal.dispose(); } catch {}
      this.terminal = null;
    }
  }

  initTerminal() {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    this.terminal = new Terminal({
      cursorBlink: false,
      cursorStyle: 'bar',
      cursorWidth: 1,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: isDark ? darkTerminalTheme : lightTerminalTheme,
      allowProposedApi: true,
      scrollback: 1000,
      smoothScrollDuration: 0,
      scrollOnUserInput: true,
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(new WebLinksAddon());

    const unicode11 = new Unicode11Addon();
    this.terminal.loadAddon(unicode11);
    this.terminal.unicode.activeVersion = '11';

    this.terminal.open(this.containerRef.current);

    this.terminal.onData((data) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // 上报 focus / blur 给父组件，驱动 .scratchPanesFocused 边框
    this._handleScratchFocus = () => { try { this.props.onFocusChange?.(true); } catch {} };
    this._handleScratchBlur = () => { try { this.props.onFocusChange?.(false); } catch {} };
    const ta = this.terminal.textarea;
    if (ta) {
      ta.addEventListener('focus', this._handleScratchFocus);
      ta.addEventListener('blur', this._handleScratchBlur);
    }
  }

  _throttledWrite = (data) => {
    this._writeQ.push(data);
  };

  connectWebSocket() {
    if (this._closing) return;
    const id = this.props.id;
    if (!id) return; // 没 id 不能连
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // 带上 LAN token(已有 ?id= → appendToken 用 & 续接);密码登录用户走 cookie。见 TerminalWsContext。
    const wsUrl = appendToken(`${protocol}//${window.location.host}/ws/terminal-scratch?id=${encodeURIComponent(id)}`);
    this.ws = new WebSocket(wsUrl);

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'data') {
          this._throttledWrite(msg.data);
        } else if (msg.type === 'state') {
          // 后端首条 state 消息携带 shellBasename，给父组件渲染 tab 标签
          if (msg.shellBasename) {
            try { this.props.onShellInfo?.(msg.shellBasename); } catch {}
          }
        } else if (msg.type === 'exit') {
          // xterm 在 dispose 与同步 ws 消息之间存在窗口，写入 disposed terminal 会抛——保险起见 try/catch
          try { if (this.terminal) this.terminal.write(`\r\n\x1b[90m[scratch shell exited: ${msg.exitCode ?? '?'}]\x1b[0m\r\n`); } catch {}
        } else if (msg.type === 'toast') {
          try { if (this.terminal) this.terminal.write(`\r\n\x1b[33m⚠ ${msg.message}\x1b[0m\r\n`); } catch {}
        }
      } catch {}
    };

    this.ws.onclose = () => {
      if (this._closing) return;
      this._wsReconnectTimer = setTimeout(() => {
        if (!this._closing && this.containerRef.current) {
          this.connectWebSocket();
        }
      }, 2000);
    };

    this.ws.onopen = () => {
      this.sendResize();
    };
  }

  sendResize() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.terminal) {
      this.ws.send(JSON.stringify({
        type: 'resize',
        cols: this.terminal.cols,
        rows: this.terminal.rows,
      }));
    }
  }

  setupResizeObserver() {
    this.resizeObserver = new ResizeObserver(() => {
      if (this._resizeDebounceTimer) clearTimeout(this._resizeDebounceTimer);
      this._resizeDebounceTimer = setTimeout(() => {
        if (!this.fitAddon || !this.terminal) return;
        const el = this.containerRef.current;
        if (!el || el.offsetWidth <= 0 || el.offsetHeight <= 0) return;
        try {
          this.fitAddon.fit();
          this.sendResize();
        } catch {}
      }, 80);
    });
    if (this.containerRef.current) {
      this.resizeObserver.observe(this.containerRef.current);
    }
  }

  // 公开方法：父组件在 tab 切换 / 首次显示时调用
  // display:none -> block 不会触发 ResizeObserver，必须显式 fit
  refit = () => {
    if (!this.fitAddon || !this.terminal) return;
    const el = this.containerRef.current;
    if (!el || el.offsetWidth <= 0 || el.offsetHeight <= 0) return;
    try {
      this.fitAddon.fit();
      this.sendResize();
    } catch {}
  };

  focus = () => {
    try { this.terminal?.focus(); } catch {}
  };

  // 关闭 tab 时通知后端 kill 该 id 的 pty
  requestKill = () => {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify({ type: 'kill' })); } catch {}
    }
    this._closing = true;
    if (this.ws) {
      this.ws.onclose = null;
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  };

  render() {
    // === scratch (小) terminal 渲染区 ===
    // 外层 .scratchInner：focus 出血带；内层 .scratchHost：xterm 实际父容器，
    // margin-bottom 4px 让 fitAddon 拿到的高度始终 -4px，xterm-screen 接触不到下方分隔线
    return (
      <div className={styles.scratchInner}>
        <div ref={this.containerRef} className={styles.scratchHost} />
      </div>
    );
  }
}

export default ScratchTerminal;
