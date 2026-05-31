<img height="200" width="1500" alt="CC-Viewer" src="https://github.com/user-attachments/assets/abec0513-1d56-4244-b7ed-9382b6c09049" />

# CC-Viewer

Based on Claude Code, a Vibe Coding tool that distills and accumulates real development experience:

1. Raise your capability ceiling: run /ultraPlan and /ultraReview locally, while avoiding fully exposing your project code to Claude's cloud;
2. Multi-device compatibility: code on mobile devices (within your LAN), the web version adapts to all kinds of scenarios, easy to embed into browser extensions or OS split-screen, and native installers are provided;
3. Complete log tracing: full Claude Code payload interception and analysis — ideal for logging, troubleshooting, learning, and reverse engineering;
4. Shared learning and experience: lots of learning material and development know-how are baked in (see the "?" icons throughout the system);
5. Native experience preserved: only enhances Claude Code's capabilities without making any substantive changes to the core, keeping the native experience intact;
6. Third-party model support: compatible with deepseek-v4-\*, GLM 5.1, Kimi K2.6, with cc-switch built in so you can hot-swap third-party tools at any time;

English | [简体中文](./docs/README.zh.md) | [繁體中文](./docs/README.zh-TW.md) | [한국어](./docs/README.ko.md) | [日本語](./docs/README.ja.md) | [Deutsch](./docs/README.de.md) | [Español](./docs/README.es.md) | [Français](./docs/README.fr.md) | [Italiano](./docs/README.it.md) | [Dansk](./docs/README.da.md) | [Polski](./docs/README.pl.md) | [Русский](./docs/README.ru.md) | [العربية](./docs/README.ar.md) | [Norsk](./docs/README.no.md) | [Português (Brasil)](./docs/README.pt-BR.md) | [ไทย](./docs/README.th.md) | [Türkçe](./docs/README.tr.md) | [Українська](./docs/README.uk.md)

## Usage

### Prerequisites

* Make sure nodejs 20.0.0+ is installed; [Download and install](https://nodejs.org)
* Make sure claude code is installed; [Installation guide](https://github.com/anthropics/claude-code)

### Install ccv

#### Install via npm

```bash
npm install -g cc-viewer --registry=https://registry.npmjs.org
```

#### Install via Homebrew (recommended for macOS / Linux)

```bash
brew tap weiesky/cc-viewer
brew install cc-viewer
brew upgrade cc-viewer   # use this to upgrade; do NOT use npm install -g to upgrade a brew-installed ccv
```

### How to start

ccv is a drop-in replacement for claude — all arguments are passed through to claude while the Web Viewer is launched alongside it.

```bash
ccv                    # == claude (interactive mode)
```

The command I use most often is:

```
ccv -c --d             # == claude --continue --dangerously-skip-permissions
                       # ccv passes through every Claude Code launch argument — feel free to combine them however you like
```

Once started in programming mode, the web page opens automatically.

cc-viewer also ships as a native desktop app: [download page](https://github.com/weiesky/cc-viewer/releases)

### Logger mode

If you still prefer the native claude tool or the VS Code extension, use this mode.

In this mode, launching `claude` will automatically start a logging process that records request logs to \~/.claude/cc-viewer/*yourproject*/date.jsonl

Enable logger mode:

```bash
ccv -logger
```

When the console cannot print a specific port, the default first port is 127.0.0.1:7008. If multiple instances exist, ports increment sequentially — 7009, 7010, and so on.

Uninstall logger mode:

```bash
ccv --uninstall
```

### Troubleshooting

If you run into start-up issues, here's the ultimate troubleshooting recipe:
Step 1: Open Claude Code in any directory;
Step 2: Give Claude Code the following instruction:

```
I have installed the cc-viewer npm package, but running ccv still doesn't work properly. Check cc-viewer's cli.js and findcc.js and adapt them to the local Claude Code deployment based on the specific environment. Keep the scope of changes confined to findcc.js as much as possible.
```

Letting Claude Code diagnose the problem on its own is more effective than asking anyone or reading any documentation!

Once the instruction is done, `findcc.js` will have been updated. If your project frequently needs local deployment, or your forked code often runs into installation issues, just keep this file — next time you can simply copy it over. At this stage many projects and companies use Claude Code on server-side hosted deployments rather than on Mac, so I split out `findcc.js` to make it easier to keep tracking upstream cc-viewer source updates.

Note: this app conflicts with claude-code-switch and claude-code-router — there is a proxy contention problem, so make sure you turn off claude-code-switch and claude-code-router when using it. cc-viewer provides built-in proxy hot-reload that can replace them.

### Other helper commands

See:

```bash
ccv -h
```

### Silent Mode

By default, `ccv` runs in silent mode when wrapping `claude`, keeping your terminal output clean and consistent with the native experience. All logs are captured in the background and can be viewed at `http://localhost:7008`.

Once configured, just use the `claude` command as usual. Visit `http://localhost:7008` to open the monitoring UI.

## Features

### Programming mode

After launching with ccv you'll see:

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/ab353a2b-f101-409d-a28c-6a4e41571ea2" />

You can view the code diff directly right after an edit:

<img height="728" width="1500" alt="image" src="https://github.com/user-attachments/assets/2a4acdaa-fc5f-4dc0-9e5f-f3273f0849b2" />

While you can open files and code by hand, that's not recommended — that's the old-school way!

### Mobile programming

You can even scan a QR code and code from a mobile device:

<img height="1460" width="3018" alt="image" src="https://github.com/user-attachments/assets/8debf48e-daec-420c-b37a-609f8b81cd20" />

<img height="790" width="1700" alt="image" src="https://github.com/user-attachments/assets/da3e519f-ff66-4cd2-81d1-f4e131215f6c" />

Everything you imagined about mobile coding — plus a plugin mechanism: if you need to customize for your own coding habits, stay tuned for plugin hook updates.

### Password protection

By default, remote (LAN) access requires the `?token=` query that ccv prints at startup. As an alternative that's friendlier to share, scan, or bookmark, you can turn on **password login**:

* Start with `ccv --usePassword` to enable it immediately. A bare flag auto-generates a 6-character password (uppercase letters + digits) and prints it to the console; `ccv --usePassword=<your-password>` sets a specific one. The password is shown in uppercase but matched case-insensitively at login, so it's easy to type on a phone.
* The machine that opens ccv on `127.0.0.1` is the **admin**: it never needs a password and is the only one allowed to view or change it. Open the QR-code popover — directly below the QR you can enable protection, edit/copy the password, or turn it back off.
* Remote devices opening the LAN URL (without a token) are shown a minimal password page; entering the correct password sets an `HttpOnly` cookie and the page refreshes into the app. The existing `?token=` URL keeps working in parallel.
* An **empty password means no protection at all** — it is allowed, but the admin UI shows a clear security warning.
* **Global default + per-project override:** by default one password covers every project. From the QR popover the admin can switch between **This project** and **Global** — set a project-specific password that overrides the global default for that project only, or remove the override to inherit the global setting again. (A disabled project override means "no protection for this project", which is different from removing it.)
* The on/off state and password(s) are persisted alongside your other settings in cc-viewer's `preferences.json` — a global `auth` key plus an optional `authByProject` map (the password is base64-obfuscated, not stored as raw plaintext; file mode `0600`). The login cookie is tied to the per-launch token, so restarting ccv requires remote devices to log in again.

### Logger mode (view the complete Claude Code session)

<img height="768" width="1500" alt="image" src="https://github.com/user-attachments/assets/a8a9f3f7-d876-4f6b-a64d-f323a05c4d21" />

* Captures every API request from Claude Code in real time, guaranteeing the raw payload rather than a censored log (this matters a lot!!!)
* Automatically identifies and labels Main Agent and Sub Agent requests (subtypes: Plan, Search, Bash)
* MainAgent requests support Body Diff JSON, showing only the diff against the previous MainAgent request (only changed/added fields) in a collapsed view
* Each request inlines Token usage stats (input/output tokens, cache creation/read, hit rate)
* Compatible with Claude Code Router (CCR) and other proxy scenarios — falls back to matching requests by API path pattern

### Conversation mode

Click the "Conversation Mode" button at the top right to parse the Main Agent's full conversation history into a chat interface:

<img height="764" width="1500" alt="image" src="https://github.com/user-attachments/assets/725b57c8-6128-4225-b157-7dba2738b1c6" />

* Agent Team display is not yet supported
* User messages are right-aligned (blue bubbles), Main Agent replies are left-aligned (dark bubbles)
* `thinking` blocks are collapsed by default and rendered as Markdown — click to expand and view the reasoning; one-click translation is supported (still unstable)
* User-selection messages (AskUserQuestion) are displayed in Q\&A form
* Two-way mode sync: switching to Conversation mode auto-scrolls to the conversation that matches the selected request; switching back to the raw mode auto-scrolls to the selected request
* Settings panel: toggle the default collapsed state of tool results and thinking blocks
* Mobile conversation browsing: in mobile CLI mode, tap the "Conversation Browse" button in the top bar to slide out a read-only conversation view and browse the full history on your phone

### Log management

From the CC-Viewer dropdown menu in the top-left:

<img height="760" width="1500" alt="image" src="https://github.com/user-attachments/assets/33295e2b-f2e0-4968-a6f1-6f3d1404454e" />

**Log compression**
Regarding logs, I want to state clearly that I haven't modified Anthropic's official definition — log integrity is guaranteed.
However, individual log entries for the 1M Opus model can get extremely large in later stages. Thanks to some log optimizations applied to MainAgent, the size can be reduced by at least 66% even without gzip.
The parser for these compressed logs can be extracted from the current repository.

### More handy useful features

<img height="767" width="1500" alt="image" src="https://github.com/user-attachments/assets/add558c5-9c4d-468a-ac6f-d8d64759fdbd" />

You can quickly locate your prompts via the sidebar tools.

***

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/82b8eb67-82f5-41b1-89d6-341c95a047ed" />

The interesting KV-Cache-Text feature shows you exactly what Claude sees.

***

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/54cdfa4e-677c-4aed-a5bb-5fd946600c46" />

You can upload images and describe your needs — Claude's image understanding is remarkably strong, and as you know, you can paste images directly with Ctrl + V; the full content shows up in the conversation.

***

<img height="370" width="600" alt="image" src="https://github.com/user-attachments/assets/87d332ea-3e34-4957-b442-f9d070211fbf" />

You can customize plugins directly, manage all cc-viewer processes, and cc-viewer supports hot-switching to third-party APIs (yes, you can use GLM, Kimi, MiniMax, Qwen, DeepSeek — though I think they're all rather weak at the moment).

***

<img height="746" width="1500" alt="image" src="https://github.com/user-attachments/assets/b1f60c7c-1438-4ecc-8c64-193d21ee3445" />

More features waiting for you to discover... for example: the system supports Agent Team and ships with a built-in Code Reviewer. Codex Code Reviewer integration is coming very soon (I strongly recommend using Codex to review Claude Code's code).

<a href="https://www.star-history.com/?repos=weiesky%2Fcc-viewer&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&legend=top-left" />
 </picture>
</a>

## License

MIT