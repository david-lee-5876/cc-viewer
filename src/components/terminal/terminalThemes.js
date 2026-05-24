// 抽离自 TerminalPanel.jsx，供 TerminalPanel + ScratchTerminal 共用，破除循环 import。
export const darkTerminalTheme = {
  background: '#0a0a0a', foreground: '#d4d4d4', cursor: '#0a0a0a',
  selectionBackground: '#264f78',
  black: '#000000', red: '#ef4444', green: '#73c991', yellow: '#fbbf24',
  blue: '#3b82f6', magenta: '#d946ef', cyan: '#06b6d4', white: '#e5e5e5',
  brightBlack: '#666666', brightRed: '#ff7b7b', brightGreen: '#9ddc6f', brightYellow: '#ffce5b',
  brightBlue: '#66b3ff', brightMagenta: '#e88ce8', brightCyan: '#7eddd9', brightWhite: '#ffffff',
};

export const lightTerminalTheme = {
  background: '#ffffff', foreground: '#333333', cursor: '#333333',
  selectionBackground: '#cce5ff',
  black: '#000000', red: '#CD3131', green: '#107C10', yellow: '#949800',
  blue: '#0451A5', magenta: '#BC05BC', cyan: '#0598BC', white: '#555555',
  brightBlack: '#666666', brightRed: '#CD3131', brightGreen: '#14CE14', brightYellow: '#B5BA00',
  brightBlue: '#0451A5', brightMagenta: '#BC05BC', brightCyan: '#0598BC', brightWhite: '#A5A5A5',
};
