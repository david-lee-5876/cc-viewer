# ultraAgents — 预设专家 (Preset ultraplan experts)

本目录随 cc-viewer 包发布。其中每个 `*.json` 文件定义一个「预设专家」，会出现在
**UltraPlan → 自定义专家编辑器 → 「载入模版」** 弹窗中，供用户选中后将名称与内容
一键载入编辑面板（再按需改写并另存为自己的自定义专家）。

> 加载入口：服务端 `GET /api/ultra-agents`（只读本目录、无参数），实现见
> `server/lib/ultra-agents-api.js`。本目录中的非 `*.json` 文件（如本 README）会被忽略。

## JSON 格式

```jsonc
{
  "id": "code-expert",          // 必填。唯一标识,仅 [A-Za-z0-9._-]、长度 ≤200、不以 . 开头。
                                //       仅作去重键(同 id 取文件名排序靠前者),不参与拼路径。
  "version": 1,                 // 可选。前向兼容标记,当前加载器忽略(不读不校验)。
  "title":       { "zh": "代码专家", "en": "Code Expert" },  // 必填。专家名称,内联本地化,见下。
  "description": { "zh": "资深工程师…", "en": "Senior engineer…" }, // 可选。一句话描述,内联本地化。
  "content":     "<system-reminder>\n…\n</system-reminder>"  // 必填。单语言正文,见下「content」。
}
```

### title / description：在 JSON 协议层内联本地化

`title` 与 `description` 两个字段都支持两种写法，**本地化在 JSON 协议层内联完成**（不依赖外部 i18n）：

- **纯字符串**：所有语言都用同一份文本。
- **本地化对象** `{ "zh": "…", "en": "…", "zh-TW": "…" }`：前端按当前界面语言解析，
  回退顺序为 **精确语言 → 去区域的主语言（`zh-TW`→`zh`、`pt-BR`→`pt`）→ `en` → `zh`
  → 首个非空值**（解析逻辑见 `src/utils/resolveLocalized.js`）。

因此一个文件即可覆盖任意多种语言；未列出的界面语言走上述回退。

### content：单语言

`content` 是**单语言字符串**（不做本地化）。载入并保存后，发送给 Claude Code 时被当作 ultraplan
的作用域指令；若 `content`（trim 后）以 `<system-reminder>` 开头，则原样使用、**不会被二次包裹**
（见 `buildCustomTemplate`，`src/utils/ultraplanTemplates.js`）。因此预设 `content` 建议以
`<system-reminder>`、`[SCOPED INSTRUCTION]` 风格书写。

> 内置 `code-expert` / `research-expert` 的 `content` **直接取自**
> `src/utils/ultraplanTemplates.js` 的 `ULTRAPLAN_VARIANTS.codeExpert` / `researchExpert`，
> 并由 `test/ultra-agents-api.test.js` 钉死逐字节一致——改正文请改那个源文件后重新生成本目录 JSON，
> 不要在此手写另一份。

## 校验与限制

加载时对每个文件做防御性校验，不合法者仅 `console.warn` 跳过、不影响其它文件：

- 必须是合法 JSON 的**普通对象**（非数组/标量）。
- `id` 通过上述规则；`title`、`content` 为「非空字符串」或「至少含一个非空字符串值的对象」。
- 单文件 **≤ 256KB**，超出跳过；有效专家 **≤ 100** 个，超出忽略。
- `description` 缺失或非法时按空串处理。

## 现有 demo

| 文件 | 专家 | `title` / `description` | `content` 来源 |
| --- | --- | --- | --- |
| `code-expert.json` | 代码专家 / Code Expert | 内联本地化(全 18 语言) | `ULTRAPLAN_VARIANTS.codeExpert` |
| `research-expert.json` | 调研专家 / Research Expert | 内联本地化(全 18 语言) | `ULTRAPLAN_VARIANTS.researchExpert` |

新增预设：在本目录放一个新的 `*.json`（建议文件名与 `id` 一致），重启/刷新即可在弹窗中看到。
