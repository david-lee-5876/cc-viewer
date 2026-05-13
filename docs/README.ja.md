# CC-Viewer

Claude Code をベースに、自身の開発経験を蒸留・蓄積した Vibe Coding ツール：

1. 能力の上限を引き上げる：/ultraPlan、/ultraReview をローカルで実行でき、プロジェクトのコードを Claude のクラウドに完全にさらさずに済みます；
2. マルチデバイス同時対応：ローカルネットワーク内でモバイル端末からのプログラミングが可能、Web 版はあらゆるシーンに自動適応し、ブラウザ拡張や OS の画面分割への組み込みも容易、ネイティブインストーラーも提供します；
3. 完全なログトレース：Claude Code のペイロードを丸ごと傍受・解析できる機能を提供し、ロギング、問題分析、学習、リバースエンジニアリングに最適です；
4. 学習・経験の共有：多くの学習資料や開発経験を蓄積しています（システム各所の「?」アイコンをご覧ください）；
5. ネイティブ体験の維持：Claude Code の能力を強化するのみで、コアには一切実質的な変更を加えず、ネイティブ体験を保ちます；
6. サードパーティモデル対応：deepseek-v4-\*、GLM 5.1、Kimi K2.6 に対応、cc-switch 機能を内蔵しており、サードパーティツールにいつでもホットスイッチ可能です；

[English](../README.md) | [简体中文](./README.zh.md) | [繁體中文](./README.zh-TW.md) | [한국어](./README.ko.md) | 日本語 | [Deutsch](./README.de.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Italiano](./README.it.md) | [Dansk](./README.da.md) | [Polski](./README.pl.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [Norsk](./README.no.md) | [Português (Brasil)](./README.pt-BR.md) | [ไทย](./README.th.md) | [Türkçe](./README.tr.md) | [Українська](./README.uk.md)

## 使い方

### 前提条件

* Node.js 20.0.0+ がインストール済みであることを確認してください；[ダウンロードしてインストール](https://nodejs.org)
* Claude Code がインストール済みであることを確認してください；[インストールガイド](https://github.com/anthropics/claude-code)

### ccv のインストール

#### npm でインストール

```bash
npm install -g cc-viewer --registry=https://registry.npmjs.org
```

#### Homebrew でインストール（macOS / Linux 推奨）

```bash
brew tap weiesky/cc-viewer
brew install cc-viewer
brew upgrade cc-viewer   # アップデート用 — brew インストールの ccv を npm install -g でアップグレードしないでください
```

### 起動方法

ccv は claude のドロップイン代替です。すべての引数を claude にパススルーしつつ、Web Viewer を同時に起動します。

```bash
ccv                    # == claude（インタラクティブモード）
```

私が最もよく使うコマンドは：

```
ccv -c --d             # == claude --continue --dangerously-skip-permissions
                       # ccv は Claude Code のすべての起動引数をパススルーします — お好みで自由に組み合わせてください
```

プログラミングモードで起動すると、Web ページが自動的に開きます。

cc-viewer はネイティブデスクトップアプリも提供しています：[ダウンロードページ](https://github.com/weiesky/cc-viewer/releases)

### ロガーモード

ネイティブの claude ツールや VS Code 拡張機能を引き続き好む場合は、このモードを使用してください。

このモードでは、`claude` を起動すると自動的にロギングプロセスが開始され、リクエストログが \~/.claude/cc-viewer/*yourproject*/date.jsonl に記録されます。

ロガーモードを有効にする：

```bash
ccv -logger
```

コンソールが具体的なポートを出力できない場合、デフォルトの最初のポートは 127.0.0.1:7008 です。複数のインスタンスが存在する場合は 7009、7010 のように順次ポートを使用します。

ロガーモードのアンインストール：

```bash
ccv --uninstall
```

### トラブルシューティング

起動できない問題に遭遇した場合、究極のトラブルシューティング方法があります：
ステップ 1：任意のディレクトリで Claude Code を開きます；
ステップ 2：Claude Code に次の指示を与えます：

```
cc-viewer という npm パッケージをインストールしましたが、ccv を実行しても正常に動作しません。cc-viewer の cli.js と findcc.js を確認し、具体的な環境に応じてローカルの Claude Code のデプロイ方式に合わせて適合させてください。変更範囲はできる限り findcc.js に限定してください。
```

Claude Code に自身で問題を診断させることは、誰かに尋ねたりどんなドキュメントを読んだりするよりも効果的です！

上記の指示が完了すると、findcc.js が更新されます。プロジェクトが頻繁にローカルデプロイを必要とする場合、またはフォークしたコードがしばしばインストールの問題に直面する場合、このファイルを保持しておくとよいでしょう。次回は単にコピーするだけで済みます。現段階では、Claude Code を使用している多くのプロジェクトや会社が Mac ではなくサーバー側のホスト環境にデプロイしているため、私は今後の cc-viewer ソースコード更新の追跡を容易にするために findcc.js を分離しました。

注意：本アプリは claude-code-switch、claude-code-router と競合します。プロキシの競合問題があるため、使用時には必ず claude-code-switch、claude-code-router を無効化してください。cc-viewer 内部にプロキシのホット更新機能が提供されており、それらの代替として利用できます。

### その他の補助コマンド

参照：

```bash
ccv -h
```

### サイレントモード (Silent Mode)

デフォルトでは、`ccv` は `claude` をラップする際にサイレントモードで実行され、ターミナル出力をクリーンに保ち、ネイティブ体験と一貫性を持たせます。すべてのログはバックグラウンドでキャプチャされ、`http://localhost:7008` で閲覧できます。

設定が完了したら、通常通り `claude` コマンドを使用してください。`http://localhost:7008` にアクセスして監視インターフェイスを開けます。

## 機能

### プログラミングモード

ccv で起動すると、次のものが確認できます：

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/ab353a2b-f101-409d-a28c-6a4e41571ea2" />

編集完了後にすぐコード diff を表示できます：

<img height="728" width="1500" alt="image" src="https://github.com/user-attachments/assets/2a4acdaa-fc5f-4dc0-9e5f-f3273f0849b2" />

ファイルを開いて手動でコーディングすることもできますが、手動コーディングは推奨しません — それは旧式のコーディングです！

### モバイルプログラミング

QR コードをスキャンしてモバイル端末からコーディングすることもできます：

<img height="1460" width="3018" alt="image" src="https://github.com/user-attachments/assets/8debf48e-daec-420c-b37a-609f8b81cd20" />

<img height="790" width="1700" alt="image" src="https://github.com/user-attachments/assets/da3e519f-ff66-4cd2-81d1-f4e131215f6c" />

モバイルプログラミングの想像を満たします。さらにプラグイン機構もあります — 自分のコーディング習慣に合わせてカスタマイズが必要な場合は、今後のプラグイン hook の更新にご期待ください。

### ロガーモード（Claude Code の完全な会話を閲覧）

<img height="768" width="1500" alt="image" src="https://github.com/user-attachments/assets/a8a9f3f7-d876-4f6b-a64d-f323a05c4d21" />

* Claude Code が送信するすべての API リクエストをリアルタイムにキャプチャし、編集・改竄されていない原文を保証します（これは非常に重要です！！！）
* Main Agent と Sub Agent のリクエストを自動的に識別・ラベリング（サブタイプ：Plan、Search、Bash）
* MainAgent リクエストは Body Diff JSON をサポートし、前回の MainAgent リクエストとの差分（変更/追加フィールドのみ）を折りたたみ表示します
* 各リクエストには Token 使用統計がインラインで表示されます（入出力 Token、キャッシュ生成/読み取り、ヒット率）
* Claude Code Router (CCR) やその他のプロキシシナリオとの互換性 — API パスパターンによるマッチングでフォールバックします

### 会話モード

右上の「会話モード」ボタンをクリックすると、Main Agent の完全な会話履歴をチャットインターフェイスに解析します：

<img height="764" width="1500" alt="image" src="https://github.com/user-attachments/assets/725b57c8-6128-4225-b157-7dba2738b1c6" />

* Agent Team の表示は現時点ではサポートされていません
* ユーザーメッセージは右寄せ（青い吹き出し）、Main Agent の返信は左寄せ（暗い吹き出し）
* `thinking` ブロックはデフォルトで折りたたまれ、Markdown としてレンダリングされます。クリックして展開すると思考プロセスを表示できます；ワンクリック翻訳がサポートされています（機能はまだ不安定です）
* ユーザー選択型メッセージ（AskUserQuestion）は Q&A 形式で表示されます
* 双方向モード同期：会話モードに切り替えると、選択中のリクエストに対応する会話へ自動スクロールします；原文モードに戻すと、選択中のリクエストへ自動スクロールします
* 設定パネル：ツール結果および thinking ブロックのデフォルトの折りたたみ状態を切り替えられます
* モバイル会話ブラウジング：モバイル CLI モードで、上部バーの「会話ブラウズ」ボタンをタップすると、読み取り専用の会話ビューがスライドアウトし、モバイルで完全な会話履歴を閲覧できます

### ログ管理

左上の CC-Viewer ドロップダウンメニューから：

<img height="760" width="1500" alt="image" src="https://github.com/user-attachments/assets/33295e2b-f2e0-4968-a6f1-6f3d1404454e" />

**ログの圧縮**
ログに関して、私は Anthropic の公式定義を変更していないことを明確に宣言しておきます。これによりログの完全性が保証されます。
しかし、1M Opus モデルの後半段階で生成される個々のログエントリは極めて大きくなるため、MainAgent に対する一部のログ最適化のおかげで、gzip なしでも少なくとも 66% のサイズ削減を達成できます。
これら圧縮ログの解析方法は、現在のリポジトリから抽出できます。

### さらに便利な機能

<img height="767" width="1500" alt="image" src="https://github.com/user-attachments/assets/add558c5-9c4d-468a-ac6f-d8d64759fdbd" />

サイドバーツールを使用してプロンプトを素早く特定できます。

***

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/82b8eb67-82f5-41b1-89d6-341c95a047ed" />

興味深い KV-Cache-Text により、Claude が見ているものが何かを確認できます。

***

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/54cdfa4e-677c-4aed-a5bb-5fd946600c46" />

画像をアップロードして要望を伝えることができます。Claude の画像理解能力は非常に強力で、ご存じのとおりスクリーンショットを Ctrl + V で直接貼り付けることもでき、会話の中で完全な内容を表示できます。

***

<img height="370" width="600" alt="image" src="https://github.com/user-attachments/assets/87d332ea-3e34-4957-b442-f9d070211fbf" />

プラグインを直接カスタマイズし、cc-viewer のすべてのプロセスを管理でき、さらに cc-viewer はサードパーティ API へのホットスイッチング能力を備えています（はい、GLM、Kimi、MiniMax、Qwen、DeepSeek を使用できます。ただし私は現時点ではそれらがいずれもかなり非力だと考えています）。

***

<img height="746" width="1500" alt="image" src="https://github.com/user-attachments/assets/b1f60c7c-1438-4ecc-8c64-193d21ee3445" />

発見を待つさらに多くの機能があります……例えば：本システムは Agent Team をサポートし、Code Reviewer を内蔵しています。間もなく Codex の Code Reviewer 統合にも対応します（私は Codex を使って Claude Code のコードをレビューすることを強く推奨します）。

## License

MIT
