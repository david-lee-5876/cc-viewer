# CC-Viewer

Claude Code をベースに、自身の開発経験を蒸留・蓄積した Vibe Coding ツール：

1. 能力の上限を引き上げる：/ultraPlan、/ultraReview をローカルで実行でき、プロジェクトのコードを Claude のクラウドに完全にさらさずに済みます；
2. マルチデバイス同時対応：ローカルネットワーク内でモバイル端末からのプログラミングが可能、Web 版はあらゆるシーンに自動適応し、ブラウザ拡張や OS の画面分割への組み込みも容易、ネイティブインストーラーも提供します；
3. 完全なログトレース：Claude Code のペイロードを丸ごと傍受・解析できる機能を提供し、ロギング、問題分析、学習、リバースエンジニアリングに最適です；
4. 学習・経験の共有：多くの学習資料や開発経験を蓄積しています（システム各所の「?」アイコンをご覧ください）；
5. ネイティブ体験の維持：Claude Code の能力を強化するのみで、コアには一切実質的な変更を加えず、ネイティブ体験を保ちます；
6. サードパーティモデル対応：deepseek-v4-\*、GLM 5.1、Kimi K2.6 に対応、cc-switch 機能を内蔵しており、サードパーティツールにいつでもホットスイッチ可能です；

<img width="860" alt="cc-viewer — deploy once, share with every device" src="https://raw.githubusercontent.com/weiesky/cc-viewer/main/docs/cc-viewer-share.svg" />

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

<a href="https://www.star-history.com/?repos=weiesky%2Fcc-viewer&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&theme=dark&legend=top-left" />

    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&legend=top-left" />

    ![Star History Chart](https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&legend=top-left)
  </picture>
</a>

## License

MIT
