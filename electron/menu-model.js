/**
 * 应用菜单的单一数据源(纯数据,无 Electron 依赖,可被 node:test 直接单测)。
 *
 * 两个消费方:
 * - electron/main.js buildMenu():映射为原生菜单模板(macOS 菜单栏 / 全平台 accelerator 注册);
 * - tab-bar.html(win32):HTML 菜单栏按钮 + React 端(AppHeader)跟随皮肤的下拉,
 *   经 serializeMenuModel() 拿到已翻译的可序列化模型。
 *
 * 字段约定:
 * - id:命令 id,dispatchMenuCommand(main.js) 按它派发;
 * - labelKey:server/i18n.js 的翻译 key;
 * - accel:Electron accelerator 串(CmdOrCtrl+T 等),原生注册 + HTML 端展示;
 * - role:edit 类条目走 webContents 编辑命令(undo/cut/...),id 与方法名一致;
 * - darwinRole:macOS 原生菜单上改用该 role(如 zoom ≠ maximize,不能改变 mac 既有行为);
 * - type:'separator' 分隔线。
 */

export function buildMenuModel(platform = process.platform) {
  const isMac = platform === 'darwin';
  return [
    {
      id: 'file',
      labelKey: 'electron.menu.file',
      items: [
        { id: 'new-tab', labelKey: 'electron.menu.newTab', accel: 'CmdOrCtrl+T' },
        { id: 'close-tab', labelKey: 'electron.menu.closeTab', accel: 'CmdOrCtrl+W' },
      ],
    },
    {
      id: 'edit',
      labelKey: 'electron.menu.edit',
      items: [
        { id: 'undo', role: 'undo', labelKey: 'electron.menu.undo', accel: 'CmdOrCtrl+Z' },
        { id: 'redo', role: 'redo', labelKey: 'electron.menu.redo', accel: 'Shift+CmdOrCtrl+Z' },
        { type: 'separator' },
        { id: 'cut', role: 'cut', labelKey: 'electron.menu.cut', accel: 'CmdOrCtrl+X' },
        { id: 'copy', role: 'copy', labelKey: 'electron.menu.copy', accel: 'CmdOrCtrl+C' },
        { id: 'paste', role: 'paste', labelKey: 'electron.menu.paste', accel: 'CmdOrCtrl+V' },
        { id: 'selectAll', role: 'selectAll', labelKey: 'electron.menu.selectAll', accel: 'CmdOrCtrl+A' },
      ],
    },
    {
      id: 'view',
      labelKey: 'electron.menu.view',
      items: [
        { id: 'reload', labelKey: 'electron.menu.reload', accel: 'CmdOrCtrl+R' },
        { id: 'force-reload', labelKey: 'electron.menu.forceReload', accel: 'Shift+CmdOrCtrl+R' },
        { id: 'toggle-devtools', labelKey: 'electron.menu.toggleDevTools', accel: isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I' },
        { type: 'separator' },
        // 缩放(Cmd/Ctrl +/-/0)由 renderer 的「显示大小」接管,这里不提供 zoom 条目(与 buildMenu 旧注释一致)。
        { id: 'toggle-fullscreen', labelKey: 'electron.menu.fullscreen', accel: isMac ? 'Ctrl+Command+F' : 'F11' },
      ],
    },
    {
      id: 'window',
      labelKey: 'electron.menu.window',
      items: [
        { id: 'minimize', darwinRole: 'minimize', labelKey: 'electron.menu.minimize', accel: 'CmdOrCtrl+M' },
        { id: 'maximize', darwinRole: 'zoom', labelKey: 'electron.menu.maximize' },
        { id: 'close-window', darwinRole: 'close', labelKey: 'electron.menu.close', accel: 'Shift+CmdOrCtrl+W' },
        { type: 'separator' },
        { id: 'prev-tab', labelKey: 'electron.menu.prevTab', accel: 'CmdOrCtrl+Shift+[' },
        { id: 'next-tab', labelKey: 'electron.menu.nextTab', accel: 'CmdOrCtrl+Shift+]' },
      ],
    },
  ];
}

/** 全部命令 id(不含纯 separator),供 main.js dispatch 覆盖断言与单测。 */
export const ALL_COMMAND_IDS = buildMenuModel()
  .flatMap((m) => m.items)
  .filter((it) => it.id)
  .map((it) => it.id);

// accelerator 串 → 各平台展示文案。win/linux: CmdOrCtrl→Ctrl;mac 用符号(⌘⇧⌥⌃)。
function displayAccel(accel, platform) {
  if (!accel) return '';
  if (platform === 'darwin') {
    return accel
      .replace(/CmdOrCtrl\+/gi, '⌘')
      .replace(/Command\+/gi, '⌘')
      .replace(/Shift\+/gi, '⇧')
      .replace(/Alt\+/gi, '⌥')
      .replace(/Ctrl\+/gi, '⌃');
  }
  return accel.replace(/CmdOrCtrl/gi, 'Ctrl').replace(/Command/gi, 'Ctrl');
}

/**
 * 翻译 + 扁平化为可走 IPC 的纯 JSON 模型(发给 tab-bar / React 下拉)。
 * @param {(key:string)=>string} t server/i18n.js 的 t()
 * @param {string} platform process.platform
 */
export function serializeMenuModel(t, platform) {
  return buildMenuModel(platform).map((menu) => ({
    id: menu.id,
    label: t(menu.labelKey),
    items: menu.items.map((it) => (it.type === 'separator'
      ? { type: 'separator' }
      : { id: it.id, label: t(it.labelKey), accel: displayAccel(it.accel, platform) })),
  }));
}
