# CC-Viewer

Ein Vibe-Coding-Toolkit, das aus eigener Entwicklungserfahrung destilliert und auf Claude Code aufgebaut wurde:

1. Fähigkeitsobergrenze erhöhen: Führen Sie /ultraPlan und /ultraReview lokal aus, damit Ihr Projektcode nie vollständig der Cloud von Claude ausgesetzt werden muss;
2. Multi-Plattform-Unterstützung: Ermöglicht mobiles Programmieren (innerhalb des LAN); die Webversion passt sich an verschiedene Szenarien an, lässt sich problemlos in Browser-Erweiterungen und Splitscreen-Ansichten des Betriebssystems einbetten und bietet einen nativen Installer;
3. Vollständige Protokollierung: Bietet umfassende Abfang- und Analysefunktionen für Claude Code-Payloads — ideal für Logging, Debugging, Lernen, Inspiration und Reverse-Engineering;
4. Lern- und Erfahrungsaustausch: Eine Vielzahl von Studienmaterialien und Entwicklungserfahrungen wurden gesammelt (siehe die „?"-Symbole überall im System);
5. Native Erfahrung bewahrt: Erweitert lediglich die Fähigkeiten von Claude Code, ohne wesentliche Änderungen am Kernel — die native Erfahrung bleibt erhalten;
6. Drittanbieter-Modelle unterstützt: Kompatibel mit deepseek-v4-\*, GLM 5.1, Kimi K2.6, mit eingebauter cc-switch-Fähigkeit für jederzeitiges Hot-Switching zwischen Drittanbieter-Tools;

[English](../README.md) | [简体中文](./README.zh.md) | [繁體中文](./README.zh-TW.md) | [한국어](./README.ko.md) | [日本語](./README.ja.md) | Deutsch | [Español](./README.es.md) | [Français](./README.fr.md) | [Italiano](./README.it.md) | [Dansk](./README.da.md) | [Polski](./README.pl.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [Norsk](./README.no.md) | [Português (Brasil)](./README.pt-BR.md) | [ไทย](./README.th.md) | [Türkçe](./README.tr.md) | [Українська](./README.uk.md)

## Verwendung

### Voraussetzungen

* Stellen Sie sicher, dass Node.js 20.0.0+ installiert ist; [Download und Installation](https://nodejs.org)
* Stellen Sie sicher, dass Claude Code installiert ist; [Installationsanleitung](https://github.com/anthropics/claude-code)

### ccv installieren

#### Installation über npm

```bash
npm install -g cc-viewer --registry=https://registry.npmjs.org
```

#### Installation über Homebrew (empfohlen für macOS / Linux)

```bash
brew tap weiesky/cc-viewer
brew install cc-viewer
brew upgrade cc-viewer   # für Updates — verwende NICHT npm install -g für mit brew installiertes ccv
```

### Start

ccv ist ein Drop-in-Ersatz für claude — alle Argumente werden an claude weitergereicht, während der Web-Viewer gestartet wird.

```bash
ccv                    # == claude（interaktiver Modus）
```

Der vom Autor am häufigsten verwendete Befehl ist:

```
ccv -c --d             # == claude --continue --dangerously-skip-permissions
                       # ccv reicht alle Startparameter von Claude Code durch — Sie können sie beliebig kombinieren
```

Nach dem Start im Programmiermodus wird automatisch eine Webseite geöffnet.

CC-Viewer wird auch als native Desktop-App ausgeliefert: [Download-Seite](https://github.com/weiesky/cc-viewer/releases)

### Logger-Modus

Wenn Sie weiterhin das native claude-Tool oder die VS Code-Erweiterung bevorzugen, verwenden Sie diesen Modus.

In diesem Modus startet `claude`

automatisch einen Protokollierungsprozess, der Anfrageprotokolle in \~/.claude/cc-viewer/*yourproject*/date.jsonl aufzeichnet.

Logger-Modus starten:

```bash
ccv -logger
```

Wenn die Konsole den spezifischen Port nicht ausgeben kann, ist der erste Standardport 127.0.0.1:7008. Bei mehreren Instanzen werden die Ports fortlaufend vergeben, z. B. 7009, 7010.

Logger-Modus deinstallieren:

```bash
ccv --uninstall
```

### Fehlerbehebung (Troubleshooting)

Falls beim Start Probleme auftreten, gibt es einen ultimativen Fehlerbehebungsansatz:
Schritt 1: Öffnen Sie Claude Code in einem beliebigen Verzeichnis;
Schritt 2: Geben Sie Claude Code die folgende Anweisung:

```
Ich habe das npm-Paket cc-viewer installiert, aber nach Ausführung von ccv funktioniert es immer noch nicht richtig. Überprüfen Sie cli.js und findcc.js von cc-viewer und passen Sie sie basierend auf der spezifischen Umgebung an die lokale Claude Code-Bereitstellung an. Halten Sie den Änderungsumfang so weit wie möglich auf findcc.js begrenzt.
```

Claude Code das Problem selbst diagnostizieren zu lassen, ist effektiver, als jemanden zu fragen oder eine Dokumentation zu lesen!

Nachdem die obige Anweisung abgeschlossen ist, wird findcc.js aktualisiert. Wenn Ihr Projekt häufig lokale Bereitstellung erfordert oder geforkter Code häufig Installationsprobleme lösen muss, behalten Sie diese Datei einfach. Beim nächsten Mal kopieren Sie sie direkt. In diesem Stadium werden viele Projekte und Unternehmen, die Claude Code einsetzen, nicht auf Mac bereitgestellt, sondern in serverseitig gehosteten Umgebungen, daher hat der Autor findcc.js separiert, um das Verfolgen von cc-viewer-Quellcode-Updates in Zukunft zu erleichtern.

Hinweis: Diese Anwendung steht in Konflikt mit claude-code-switch und claude-code-router, da es ein Proxy-Wettbewerbsproblem gibt. Stellen Sie daher sicher, dass Sie claude-code-switch und claude-code-router deaktivieren, wenn Sie cc-viewer verwenden — innerhalb von cc-viewer wird eine Proxy-Hot-Update-Funktion als gleichwertiger Ersatz bereitgestellt.

### Weitere Hilfsbefehle

Siehe:

```bash
ccv -h
```

### Silent-Modus (Silent Mode)

Standardmäßig läuft `ccv` im Silent-Modus, wenn es `claude` umhüllt, hält Ihre Terminal-Ausgabe sauber und konsistent mit der nativen Erfahrung. Alle Protokolle werden im Hintergrund erfasst und können unter `http://localhost:7008` angezeigt werden.

Nach der Konfiguration verwenden Sie den Befehl `claude` wie gewohnt. Besuchen Sie `http://localhost:7008`, um auf die Überwachungsoberfläche zuzugreifen.

## Funktionen

### Programmiermodus

Nach dem Start mit ccv sehen Sie:

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/ab353a2b-f101-409d-a28c-6a4e41571ea2" />

Sie können Code-Diffs direkt nach der Bearbeitung anzeigen:

<img height="728" width="1500" alt="image" src="https://github.com/user-attachments/assets/2a4acdaa-fc5f-4dc0-9e5f-f3273f0849b2" />

Sie können Dateien und Code zwar manuell öffnen, aber manuelles Programmieren wird nicht empfohlen — das ist Old-School-Coding!

### Mobiles Programmieren

Sie können sogar einen QR-Code scannen, um von Ihrem mobilen Gerät aus zu programmieren:

<img height="1460" width="3018" alt="image" src="https://github.com/user-attachments/assets/8debf48e-daec-420c-b37a-609f8b81cd20" />

<img height="790" width="1700" alt="image" src="https://github.com/user-attachments/assets/da3e519f-ff66-4cd2-81d1-f4e131215f6c" />

Erfüllen Sie Ihre Vorstellung vom mobilen Programmieren. Es gibt auch einen Plugin-Mechanismus — wenn Sie Anpassungen an Ihre Programmiergewohnheiten benötigen, bleiben Sie auf dem Laufenden für Plugin-Hook-Updates.

### Logger-Modus (Vollständige Claude Code-Sitzungen anzeigen)

<img height="768" width="1500" alt="image" src="https://github.com/user-attachments/assets/a8a9f3f7-d876-4f6b-a64d-f323a05c4d21" />

* Erfasst alle API-Anfragen von Claude Code in Echtzeit und stellt Rohtext sicher — keine redigierten Protokolle (das ist wichtig!!!)
* Identifiziert und kennzeichnet automatisch Main Agent- und Sub Agent-Anfragen (Untertypen: Plan, Search, Bash)
* MainAgent-Anfragen unterstützen Body Diff JSON und zeigen eingeklappte Unterschiede zur vorherigen MainAgent-Anfrage (nur geänderte/neue Felder)
* Jede Anfrage zeigt Inline-Token-Nutzungsstatistiken an (Input/Output-Tokens, Cache-Erstellung/-Lesung, Trefferquote)
* Kompatibel mit Claude Code Router (CCR) und anderen Proxy-Szenarien — fällt auf API-Pfadmusterabgleich zurück

### Konversationsmodus

Klicken Sie oben rechts auf die Schaltfläche „Konversationsmodus", um den vollständigen Gesprächsverlauf des Main Agent in eine Chat-Oberfläche zu parsen:

<img height="764" width="1500" alt="image" src="https://github.com/user-attachments/assets/725b57c8-6128-4225-b157-7dba2738b1c6" />

* Agent Team-Anzeige wird noch nicht unterstützt
* Benutzernachrichten sind rechtsbündig (blaue Sprechblasen), Main Agent-Antworten sind linksbündig (dunkle Sprechblasen)
* `thinking`-Blöcke sind standardmäßig eingeklappt und werden als Markdown gerendert — klicken Sie zum Erweitern und Anzeigen des Denkprozesses; Ein-Klick-Übersetzung wird unterstützt (Funktion ist noch instabil)
* Benutzerauswahlnachrichten (AskUserQuestion) werden im Q&A-Format angezeigt
* Bidirektionale Modussynchronisation: Der Wechsel in den Konversationsmodus scrollt automatisch zum Gespräch, das der ausgewählten Anfrage entspricht; der Wechsel zurück in den Rohmodus scrollt automatisch zur ausgewählten Anfrage
* Einstellungspanel: Schalten Sie den Standard-Einklappzustand für Werkzeugergebnisse und thinking-Blöcke um
* Mobiles Durchsuchen von Gesprächen: Tippen Sie im mobilen CLI-Modus auf die Schaltfläche „Konversation durchsuchen" in der oberen Leiste, um eine schreibgeschützte Konversationsansicht zum Durchsuchen des vollständigen Gesprächsverlaufs auf dem Mobilgerät auszuklappen

### Protokollverwaltung

Über das CC-Viewer-Dropdown-Menü oben links:

<img height="760" width="1500" alt="image" src="https://github.com/user-attachments/assets/33295e2b-f2e0-4968-a6f1-6f3d1404454e" />

**Protokollkomprimierung**
In Bezug auf Protokolle möchte der Autor klarstellen, dass die offiziellen Anthropic-Definitionen nicht geändert wurden, um die Protokollintegrität zu gewährleisten.
Da jedoch einzelne Protokolleinträge des 1M Opus-Modells in späteren Phasen extrem groß werden können, wird dank bestimmter Protokolloptimierungen für MainAgent ohne gzip eine Größenreduzierung von mindestens 66 % erreicht.
Die Parsing-Methode für diese komprimierten Protokolle kann aus dem aktuellen Repository extrahiert werden.

### Weitere nützliche Funktionen

<img height="767" width="1500" alt="image" src="https://github.com/user-attachments/assets/add558c5-9c4d-468a-ac6f-d8d64759fdbd" />

Sie können Ihre Prompts schnell über die Sidebar-Tools lokalisieren.

***

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/82b8eb67-82f5-41b1-89d6-341c95a047ed" />

Die interessante KV-Cache-Text-Funktion lässt Sie genau das sehen, was Claude sieht.

***

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/54cdfa4e-677c-4aed-a5bb-5fd946600c46" />

Sie können Bilder hochladen und Ihre Bedürfnisse beschreiben — Claudes Bildverständnis ist unglaublich leistungsstark. Und wie Sie wissen, können Sie Bilder direkt mit Strg+V einfügen, und Ihr vollständiger Inhalt wird im Gespräch angezeigt.

***

<img height="370" width="600" alt="image" src="https://github.com/user-attachments/assets/87d332ea-3e34-4957-b442-f9d070211fbf" />

Sie können Plugins anpassen, alle cc-viewer-Prozesse verwalten, und cc-viewer unterstützt das Hot-Switching zu Drittanbieter-APIs (ja, Sie können GLM, Kimi, MiniMax, Qwen, DeepSeek verwenden — obwohl der Autor sie derzeit alle für ziemlich schwach hält).

***

<img height="746" width="1500" alt="image" src="https://github.com/user-attachments/assets/b1f60c7c-1438-4ecc-8c64-193d21ee3445" />

Weitere Funktionen warten darauf, entdeckt zu werden... Zum Beispiel: Das System unterstützt Agent Team und verfügt über einen integrierten Code Reviewer. Die Codex Code Reviewer-Integration kommt bald (der Autor empfiehlt dringend die Verwendung von Codex zur Überprüfung des Claude Code-Codes).

## Lizenz

MIT
