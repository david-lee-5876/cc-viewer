# CC-Viewer

基於 Claude Code，提煉自身開發經驗、沉澱而成的 Vibe Coding 工具：

1. 提升能力上限，可在本機執行 /ultraPlan、/ultraReview，同時避免將專案程式碼完全暴露給 Claude 雲端；
2. 多端同時適配，可在區域網路內實現行動裝置程式設計，Web 版自適應各種場景，方便嵌入瀏覽器擴充功能、作業系統分割畫面，並提供原生安裝包；
3. 完整日誌留痕，提供 Claude Code 完整封包攔截分析能力，方便記錄日誌、分析問題、學習借鑑、逆向研發；
4. 學習經驗分享，沉澱了大量學習資料與開發經驗（詳見系統中各處的「?」中）；
5. 保持原生體驗，僅對 Claude Code 能力進行增強，對核心無任何實質性修改，保持原生體驗；
6. 適配三方模型，已適配 deepseek-v4-\*、GLM 5.1、Kimi K2.6，內建 cc-switch 能力，可隨時熱切第三方工具；

[English](../README.md) | [简体中文](./README.zh.md) | 繁體中文 | [한국어](./README.ko.md) | [日本語](./README.ja.md) | [Deutsch](./README.de.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Italiano](./README.it.md) | [Dansk](./README.da.md) | [Polski](./README.pl.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [Norsk](./README.no.md) | [Português (Brasil)](./README.pt-BR.md) | [ไทย](./README.th.md) | [Türkçe](./README.tr.md) | [Українська](./README.uk.md)

## 使用方式

### 前提

* 請確認已安裝 nodejs 20.0.0+；[下載安裝](https://nodejs.org)
* 請確認已安裝 claude code；[安裝教學](https://github.com/anthropics/claude-code)

### 安裝 ccv

#### 透過 npm 安裝

```bash
npm install -g cc-viewer --registry=https://registry.npmjs.org
```

#### 透過 Homebrew 安裝（macOS / Linux 推薦）

```bash
brew tap weiesky/cc-viewer
brew install cc-viewer
brew upgrade cc-viewer   # 升級請用這個，brew 安裝的 ccv 不要用 npm install -g 升級
```

### 啟動方式

ccv 是 claude 的直接替身，所有參數透傳給 claude，同時啟動 Web Viewer。

```bash
ccv                    # == claude（互動模式）
```

我最常用的指令是：

```
ccv -c --d             # == claude --continue --dangerously-skip-permissions
                       # ccv 透傳所有 claude code 的啟動參數，你可以自行任意組合使用
```

程式設計模式啟動之後，會主動開啟 web 頁面。

cc-viewer 也提供了客戶端版本：[下載連結](https://github.com/weiesky/cc-viewer/releases)

### 日誌模式

如果你仍習慣使用 claude 原生工具，或 VS Code 擴充功能，請使用此模式。

此模式下啟動 `claude`

會自動啟動一個日誌行程，將請求日誌自動記錄到 \~/.claude/cc-viewer/*yourproject*/date.jsonl

啟動日誌模式：

```bash
ccv -logger
```

在主控台無法印出具體連接埠時，預設第一個啟動連接埠是 127.0.0.1:7008。同時存在多個則往後順延，如 7009、7010

解除安裝日誌模式：

```bash
ccv --uninstall
```

### 常見問題排查 (Troubleshooting)

如果你遇到無法啟動的問題，有一個終極排查方案：
第一步：任意目錄打開 claude code；
第二步：給 claude code 下指令，內容如下：

```
我已經安裝了 cc-viewer 這個 npm 套件，但執行 ccv 之後仍然無法正常運作。請查看 cc-viewer 的 cli.js 與 findcc.js，根據具體環境，適配本地 claude code 的部署方式。適配時請盡量將修改範圍限制在 findcc.js 中。
```

讓 Claude Code 自行檢查錯誤，比諮詢任何人或閱讀任何文件都更有效！

以上指令完成後，會更新 findcc.js。如果你的專案經常需要本地部署，或者 fork 出去的程式碼經常需要解決安裝問題，保留這個檔案就好。下次直接 copy 檔案即可。現階段很多專案和公司使用 claude code 都不是 Mac 部署，而是伺服器端託管部署，所以我剝離了 findcc.js 這個檔案，方便後續追蹤 cc-viewer 的原始碼更新。

注意：本應用與 claude-code-switch、claude-code-router 是衝突的，存在 proxy 競爭的問題，使用時務必關閉 claude-code-switch、claude-code-router，cc-viewer 內部提供了代理熱更新的功能可以平替。

### 其他輔助指令

查閱：

```bash
ccv -h
```

### 靜默模式 (Silent Mode)

預設情況下，`ccv` 在包裹 `claude` 執行時處於靜默模式，確保你的終端輸出保持整潔，與原生體驗一致。所有日誌都在背景捕獲，並可透過 `http://localhost:7008` 檢視。

設定完成後，正常使用 `claude` 指令即可。造訪 `http://localhost:7008` 即可開啟監控介面。

## 功能

### 程式設計模式

使用 ccv 啟動後可以看見：

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/ab353a2b-f101-409d-a28c-6a4e41571ea2" />

你可以在編輯完成後直接查看程式碼 diff：

<img height="728" width="1500" alt="image" src="https://github.com/user-attachments/assets/2a4acdaa-fc5f-4dc0-9e5f-f3273f0849b2" />

雖然你可以打開檔案手動程式設計，但並不推薦使用手動程式設計，那是古法程式設計！

### 行動端程式設計

你甚至可以掃描 QR Code，在行動裝置上進行程式設計：

<img height="1460" width="3018" alt="image" src="https://github.com/user-attachments/assets/8debf48e-daec-420c-b37a-609f8b81cd20" />

<img height="790" width="1700" alt="image" src="https://github.com/user-attachments/assets/da3e519f-ff66-4cd2-81d1-f4e131215f6c" />

滿足你對行動端程式設計的想像，另外還有外掛機制，如果你需要針對自己的程式設計習慣客製化，後續可以關注外掛 hooks 的更新。

### 日誌模式（檢視 claude code 完整對話）

<img height="768" width="1500" alt="image" src="https://github.com/user-attachments/assets/a8a9f3f7-d876-4f6b-a64d-f323a05c4d21" />

* 即時擷取 Claude Code 發出的所有 API 請求，確保是原文，而不是被閹割之後的日誌（這非常重要！！！）
* 自動辨識並標記 Main Agent 與 Sub Agent 請求（子類型：Plan、Search、Bash）
* MainAgent 請求支援 Body Diff JSON，折疊顯示與上一次 MainAgent 請求的差異（僅顯示變更/新增欄位）
* 每個請求行內顯示 Token 用量統計（輸入/輸出 Token、快取建立/讀取、命中率）
* 相容 Claude Code Router（CCR）及其他代理場景 — 透過 API 路徑模式兜底匹配請求

### 對話模式

點擊右上角「對話模式」按鈕，將 Main Agent 的完整對話歷史解析為聊天介面：

<img height="764" width="1500" alt="image" src="https://github.com/user-attachments/assets/725b57c8-6128-4225-b157-7dba2738b1c6" />

* 暫不支援 Agent Team 的顯示
* 使用者訊息靠右對齊（藍色泡泡），Main Agent 回覆靠左對齊（深色泡泡）
* `thinking` 區塊預設折疊，以 Markdown 渲染，點擊展開可查看思考過程；支援一鍵翻譯（功能尚不穩定）
* 使用者選擇型訊息（AskUserQuestion）以問答形式呈現
* 雙向模式同步：切換到對話模式時自動定位到所選請求對應的對話；切回原文模式時自動定位到所選的請求
* 設定面板：可切換工具結果與思考區塊的預設折疊狀態
* 手機端對話瀏覽：在手機端 CLI 模式下，點擊頂部列的「對話瀏覽」按鈕，即可滑出唯讀對話檢視，在手機上瀏覽完整對話歷史

### 日誌管理

透過左上角 CC-Viewer 下拉選單：

<img height="760" width="1500" alt="image" src="https://github.com/user-attachments/assets/33295e2b-f2e0-4968-a6f1-6f3d1404454e" />

**日誌的壓縮**
關於日誌這部分，我需要聲明，我保證沒有修改 Anthropic 的官方定義，以確保日誌的完整性。
但是由於 1M Opus 後期產生的單條日誌過於龐大，得益於我採取了對 MainAgent 的一些日誌最佳化，在沒有 gzip 的情況下，可以降低至少 66% 的體積。
這個壓縮日誌的解析方法，可以從目前儲存庫中抽取出來。

### 更多便捷有用的功能

<img height="767" width="1500" alt="image" src="https://github.com/user-attachments/assets/add558c5-9c4d-468a-ac6f-d8d64759fdbd" />

你可以透過側邊欄工具快速定位你的 prompt

***

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/82b8eb67-82f5-41b1-89d6-341c95a047ed" />

有趣的 KV-Cache-Text，能幫你看見 Claude 看到的東西是什麼

***

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/54cdfa4e-677c-4aed-a5bb-5fd946600c46" />

你可以上傳圖片並描述你的需求，Claude 對圖片的理解能力非常強大，同時你知道，你可以截圖直接 ctrl + V 黏貼圖片，對話中可以顯示完整內容

***

<img height="370" width="600" alt="image" src="https://github.com/user-attachments/assets/87d332ea-3e34-4957-b442-f9d070211fbf" />

你可以直接客製化外掛、管理 cc-viewer 所有行程，且 cc-viewer 具備對第三方介面的熱切換能力（沒錯，你可以使用 GLM、Kimi、MiniMax、Qwen、DeepSeek，雖然我認為他們現在都很弱）

***

<img height="746" width="1500" alt="image" src="https://github.com/user-attachments/assets/b1f60c7c-1438-4ecc-8c64-193d21ee3445" />

更多功能等你發掘…比如：本系統支援 Agent Team，並內建了 Code Reviewer。馬上就要適配 Codex 的 Code Reviewer 引入（我非常推崇使用 Codex 為 Claude Code Review 程式碼）

## License

MIT
