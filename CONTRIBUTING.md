# Contributing to CC-Viewer

The author welcomes and encourages PRs from the community. The author also doesn't mind if you distill features from this project into your own applications.

## Requirements

- When submitting a PR, please tell me what your **Prompt** was and which **model** you used to modify the code (PRs made with inferior models will not be accepted);
- If there are UI changes, tell me what functionality was modified on the interface — a **screenshot with circles** drawn around the changes is recommended;
- Changes to `cli.js`, `findcc.js`, and `server/interceptor.js` will be reviewed very carefully, as I don't want issues in core files to affect everyone's usage;
- Please make sure to **verify the functionality locally** before submitting — much appreciated!
- ⚠️ `server/_paths.js` is **physically position-sensitive**: every constant is anchored on the file's own URL (`HERE = dirname(import.meta.url)`). Moving this file with `git mv` produces no static error but shifts `PACKAGE_ROOT` / `NODE_MODULES` / `DIST_DIR` etc. Any change to its location must be followed by manual verification of every import site's resolved path.

---

# 贡献指南

作者乐于接收 PR，也鼓励大家提交 PR。作者也不介意你们蒸馏当前项目的功能到你自己的应用。

## 要求

- 提交 PR 的时候，要告诉我，你的 **Prompt** 是什么，以及修改代码是用什么**模型**修改的（不接受大家用差的模型修改代码）；
- 如果有界面变更，告诉我在界面上修改的功能是什么，这个推荐直接用电脑**截图**（在截图上画圈圈，圈出来即可）；
- 涉及到 `cli.js`、`findcc.js`、`server/interceptor.js` 的变更我会非常谨慎，不希望核心文件出现问题影响大家使用；
- 请务必在本地**验证功能**之后再提交，万分感激！
- ⚠️ `server/_paths.js` **物理位置敏感**：所有常量以本文件自身 URL 为锚点（`HERE = dirname(import.meta.url)`）。`git mv` 移动它**不会触发任何静态错误**，但会让 `PACKAGE_ROOT` / `NODE_MODULES` / `DIST_DIR` 等全部偏移；如需移动，**必须人工核对**所有 import 方的解析结果。
