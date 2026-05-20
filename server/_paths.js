// 集中所有「相对于仓库根 / server 根 / node_modules」的物理路径常量，
// 避免 __dirname 跨深度 join('..','..',...) 写错。新代码直接 import 这里；
// 老代码渐进迁移。命名 `_paths.js`：下划线前缀 = server 启动期常量集，
// 与业务模块 (lib/*.js) 目录排序上自然区隔。
//
// ⚠️ 物理位置敏感：本文件路径 = 所有常量的锚点（HERE = dirname(本文件)）。
// `git mv server/_paths.js <其它路径>` 会让 PACKAGE_ROOT / NODE_MODULES / DIST_DIR /
// 等全部偏移，但不会有静态错误 —— 改动文件位置后必须人工核对所有 import 方的解析结果。
//
// NODE_MODULES 假设：cc-viewer 物理位于 `<node_modules>/cc-viewer/`（生产 npm install）。
// `npm link` / git clone dev 场景下计算到错的位置；上层 (findcc.js) 用
// `getGlobalNodeModulesDir()` 兜底，但本常量本身不感知这些边界。
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

/** server/ 目录绝对路径 */
export const SERVER_DIR    = HERE;
/** cc-viewer 包根（npm install 时 = `<node_modules>/cc-viewer`） */
export const PACKAGE_ROOT  = resolve(HERE, '..');
/** cc-viewer 同级 node_modules/（npm install 假设；npm link 失效） */
export const NODE_MODULES  = resolve(HERE, '..', '..');
/** server/lib/ 子目录 */
export const SERVER_LIB    = join(HERE, 'lib');
/** Vite build 产物（dist/index.html + assets/*） */
export const DIST_DIR      = join(PACKAGE_ROOT, 'dist');
/** dev 资源（public/voice-packs/* 等，会被 vite 拷到 dist/） */
export const PUBLIC_DIR    = join(PACKAGE_ROOT, 'public');
/** 多语言概念文档（GlobalSettings.md / Tool-*.md 等） */
export const CONCEPTS_DIR  = join(PACKAGE_ROOT, 'concepts');
/** Bundled plugin 目录（plugin-loader 启动时扫这里） */
export const PLUGINS_DIR   = join(PACKAGE_ROOT, 'plugins');
/** cc-viewer 自己的 package.json（updater/server.js 读 version） */
export const PACKAGE_JSON  = join(PACKAGE_ROOT, 'package.json');
