const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tabAPI', {
  switchTab: (tabId) => ipcRenderer.send('tab-switch', tabId),
  closeTab: (tabId) => ipcRenderer.send('tab-close', tabId),
  newTab: () => ipcRenderer.send('tab-new'),
  onTabsUpdated: (cb) => ipcRenderer.on('tabs-updated', (_, tabs) => cb(tabs)),
  onTabActivated: (cb) => ipcRenderer.on('tab-activated', (_, tabId) => cb(tabId)),
  onThemeChanged: (cb) => ipcRenderer.on('theme-changed', (_, theme) => cb(theme)),
  onFullscreenChanged: (cb) => ipcRenderer.on('fullscreen-changed', (_, isFullscreen) => cb(isFullscreen)),
  // iPad 模式：tab bar 上的窗口级开关。main 进程持有状态。
  toggleDeviceMode: () => ipcRenderer.send('toggle-device-mode'),
  requestDeviceMode: () => ipcRenderer.send('request-device-mode'),
  onDeviceModeChange: (cb) => ipcRenderer.on('device-mode-changed', (_, on) => cb(on)),
  // Header 控件迁移：接收 active tab 的 header 模型；把点击动作回传 main → active tab。
  onHeaderModel: (cb) => ipcRenderer.on('header-model', (_, model, tabId) => cb(model, tabId)),
  requestHeaderModel: () => ipcRenderer.send('request-header-model'),
  headerAction: (payload) => ipcRenderer.send('header-action', payload),
});
