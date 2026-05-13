# CC-Viewer

Et Vibe Coding-værktøjssæt destilleret fra egen udviklingserfaring og bygget på Claude Code:

1. Hæv evneloftet: Kør /ultraPlan og /ultraReview lokalt, så din projektkode aldrig er fuldt eksponeret for Claudes cloud;
2. Multi-platform-understøttelse: Muliggør mobil programmering (i det lokale netværk); webversionen tilpasser sig forskellige scenarier, kan let indlejres i browserudvidelser og operativsystemets opdelte skærm, og leverer en native installer;
3. Fuldstændig logning: Tilbyder omfattende opfangelse og analyse af Claude Code-payloads — ideelt til logning, fejlfinding, læring, inspiration og reverse-engineering;
4. Læring og erfaringsudveksling: En lang række studiematerialer og udviklingserfaringer er samlet (se „?"-symbolerne overalt i systemet);
5. Native oplevelse bevaret: Udvider kun Claude Codes evner uden væsentlige ændringer i kernen — den native oplevelse bevares;
6. Tredjepartsmodeller understøttet: Kompatibel med deepseek-v4-\*, GLM 5.1, Kimi K2.6, med indbygget cc-switch-evne til hot-switching mellem tredjepartsværktøjer når som helst;

[English](../README.md) | [简体中文](./README.zh.md) | [繁體中文](./README.zh-TW.md) | [한국어](./README.ko.md) | [日本語](./README.ja.md) | [Deutsch](./README.de.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Italiano](./README.it.md) | Dansk | [Polski](./README.pl.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [Norsk](./README.no.md) | [Português (Brasil)](./README.pt-BR.md) | [ไทย](./README.th.md) | [Türkçe](./README.tr.md) | [Українська](./README.uk.md)

## Brug

### Forudsætninger

* Sørg for at have Node.js 20.0.0+ installeret; [Download og installation](https://nodejs.org)
* Sørg for at have Claude Code installeret; [Installationsvejledning](https://github.com/anthropics/claude-code)

### Installer ccv

#### Installation via npm

```bash
npm install -g cc-viewer --registry=https://registry.npmjs.org
```

#### Installation via Homebrew (anbefales til macOS / Linux)

```bash
brew tap weiesky/cc-viewer
brew install cc-viewer
brew upgrade cc-viewer   # brug denne til opgradering — brug IKKE npm install -g til ccv installeret via brew
```

### Sådan starter du

ccv er en direkte erstatning for claude — alle argumenter videregives til claude, samtidig med at Web Viewer startes.

```bash
ccv                    # == claude (interaktiv tilstand)
```

Den kommando forfatteren bruger mest er:

```
ccv -c --d             # == claude --continue --dangerously-skip-permissions
                       # ccv videregiver alle Claude Codes opstartsparametre — du kan kombinere dem som du vil
```

Efter at programmeringstilstanden er startet, åbnes en webside automatisk.

cc-viewer findes også som native desktop-app: [Downloadside](https://github.com/weiesky/cc-viewer/releases)

### Logger-tilstand

Hvis du stadig foretrækker det native claude-værktøj eller VS Code-udvidelsen, skal du bruge denne tilstand.

I denne tilstand starter `claude`

automatisk en logningsproces, der registrerer anmodningslogs til \~/.claude/cc-viewer/*yourproject*/date.jsonl

Start logger-tilstand:

```bash
ccv -logger
```

Når konsollen ikke kan udskrive den specifikke port, er den første standardport 127.0.0.1:7008. Ved flere samtidige instanser bruges fortløbende porte som 7009, 7010.

Afinstaller logger-tilstand:

```bash
ccv --uninstall
```

### Fejlfinding (Troubleshooting)

Hvis du støder på opstartsproblemer, er her den ultimative fejlfindingstilgang:
Trin 1: Åbn Claude Code i en hvilken som helst mappe;
Trin 2: Giv Claude Code følgende instruks:

```
Jeg har installeret npm-pakken cc-viewer, men efter at have kørt ccv virker det stadig ikke korrekt. Tjek cli.js og findcc.js i cc-viewer og tilpas dem til den lokale Claude Code-udrulning baseret på det specifikke miljø. Hold ændringerne så begrænsede som muligt til findcc.js.
```

At lade Claude Code selv diagnosticere problemet er mere effektivt end at spørge nogen eller læse dokumentation!

Når instruktionen ovenfor er fuldført, opdateres findcc.js. Hvis dit projekt ofte kræver lokal udrulning eller forket kode ofte skal løse installationsproblemer, så behold blot denne fil. Næste gang kan du bare kopiere den. I øjeblikket bliver mange projekter og virksomheder, der bruger Claude Code, ikke udrullet på Mac, men i serverhostede miljøer, så forfatteren har separeret findcc.js for at gøre det lettere at følge cc-viewers kildekodeopdateringer fremover.

Bemærk: Denne applikation er i konflikt med claude-code-switch og claude-code-router, da der er et proxy-konkurrenceproblem, så sørg for at deaktivere claude-code-switch og claude-code-router, når du bruger cc-viewer — inden i cc-viewer leveres en proxy-hot-update-funktion som tilsvarende erstatning.

### Andre hjælpekommandoer

Se:

```bash
ccv -h
```

### Silent-tilstand (Silent Mode)

Som standard kører `ccv` i silent-tilstand, når den indpakker `claude`, hvilket holder dit terminaloutput rent og i overensstemmelse med den native oplevelse. Alle logs opsamles i baggrunden og kan vises på `http://localhost:7008`.

Efter konfiguration bruger du `claude`-kommandoen som normalt. Besøg `http://localhost:7008` for at få adgang til overvågningsgrænsefladen.

## Funktioner

### Programmeringstilstand

Efter start med ccv kan du se:

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/ab353a2b-f101-409d-a28c-6a4e41571ea2" />

Du kan se code diffs direkte efter redigering:

<img height="728" width="1500" alt="image" src="https://github.com/user-attachments/assets/2a4acdaa-fc5f-4dc0-9e5f-f3273f0849b2" />

Selvom du manuelt kan åbne filer og kode, anbefales manuel programmering ikke — det er gammeldags kodning!

### Mobil programmering

Du kan endda scanne en QR-kode for at programmere fra din mobile enhed:

<img height="1460" width="3018" alt="image" src="https://github.com/user-attachments/assets/8debf48e-daec-420c-b37a-609f8b81cd20" />

<img height="790" width="1700" alt="image" src="https://github.com/user-attachments/assets/da3e519f-ff66-4cd2-81d1-f4e131215f6c" />

Opfyld din forestilling om mobil programmering. Der er også en plugin-mekanisme — hvis du har brug for tilpasninger til dine programmeringsvaner, kan du holde dig opdateret om kommende plugin-hook-opdateringer.

### Logger-tilstand (Se komplette Claude Code-sessioner)

<img height="768" width="1500" alt="image" src="https://github.com/user-attachments/assets/a8a9f3f7-d876-4f6b-a64d-f323a05c4d21" />

* Opfanger alle API-anmodninger fra Claude Code i realtid og sikrer rå tekst — ikke redigerede logs (dette er vigtigt!!!)
* Identificerer og mærker automatisk Main Agent- og Sub Agent-anmodninger (undertyper: Plan, Search, Bash)
* MainAgent-anmodninger understøtter Body Diff JSON og viser sammenklappede forskelle fra den foregående MainAgent-anmodning (kun ændrede/nye felter)
* Hver anmodning viser inline Token-forbrugsstatistik (input/output-Tokens, cache-oprettelse/-læsning, hitrate)
* Kompatibel med Claude Code Router (CCR) og andre proxy-scenarier — falder tilbage til mønstermatchning af API-stier

### Samtaletilstand

Klik på knappen „Samtaletilstand" øverst til højre for at parse Main Agents fulde samtalehistorik til en chat-grænseflade:

<img height="764" width="1500" alt="image" src="https://github.com/user-attachments/assets/725b57c8-6128-4225-b157-7dba2738b1c6" />

* Agent Team-visning understøttes endnu ikke
* Brugerbeskeder er højrejusterede (blå bobler), Main Agent-svar er venstrejusterede (mørke bobler)
* `thinking`-blokke er sammenklappede som standard og renderes som Markdown — klik for at udvide og se tankeprocessen; ét-klik-oversættelse understøttes (funktionen er endnu ustabil)
* Brugervalgsbeskeder (AskUserQuestion) vises i Q&A-format
* Tovejs tilstandssynkronisering: Skift til samtaletilstand scroller automatisk til den samtale, der svarer til den valgte anmodning; skift tilbage til råtilstand scroller automatisk til den valgte anmodning
* Indstillingspanel: Skift standard-sammenklapningstilstand for værktøjsresultater og thinking-blokke
* Mobil samtalegennemgang: I mobil CLI-tilstand kan du trykke på „Samtalegennemgang"-knappen i toplinjen for at folde en skrivebeskyttet samtalevisning ud til gennemgang af den fulde samtalehistorik på mobil

### Loghåndtering

Via CC-Viewer-rullemenuen øverst til venstre:

<img height="760" width="1500" alt="image" src="https://github.com/user-attachments/assets/33295e2b-f2e0-4968-a6f1-6f3d1404454e" />

**Logkomprimering**
Hvad angår logs, vil forfatteren præcisere, at de officielle Anthropic-definitioner ikke er ændret, for at sikre logintegritet.
Da enkelte logposter fra 1M Opus-modellen dog kan blive ekstremt store i senere faser, opnås takket være visse logoptimeringer for MainAgent en størrelsesreduktion på mindst 66 % uden gzip.
Parsing-metoden for disse komprimerede logs kan udtrækkes fra det aktuelle repository.

### Flere praktiske og nyttige funktioner

<img height="767" width="1500" alt="image" src="https://github.com/user-attachments/assets/add558c5-9c4d-468a-ac6f-d8d64759fdbd" />

Du kan hurtigt finde dine prompts via sidebar-værktøjerne.

***

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/82b8eb67-82f5-41b1-89d6-341c95a047ed" />

Den interessante KV-Cache-Text-funktion lader dig se nøjagtigt, hvad Claude ser.

***

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/54cdfa4e-677c-4aed-a5bb-5fd946600c46" />

Du kan uploade billeder og beskrive dine behov — Claudes billedforståelse er utrolig kraftfuld. Og som du ved, kan du indsætte billeder direkte med Ctrl+V, og dit fulde indhold vises i samtalen.

***

<img height="370" width="600" alt="image" src="https://github.com/user-attachments/assets/87d332ea-3e34-4957-b442-f9d070211fbf" />

Du kan tilpasse plugins, administrere alle cc-viewer-processer, og cc-viewer understøtter hot-switching til tredjeparts-API'er (ja, du kan bruge GLM, Kimi, MiniMax, Qwen, DeepSeek — selvom forfatteren mener, at de alle er ret svage på nuværende tidspunkt).

***

<img height="746" width="1500" alt="image" src="https://github.com/user-attachments/assets/b1f60c7c-1438-4ecc-8c64-193d21ee3445" />

Flere funktioner venter på at blive opdaget... For eksempel: Systemet understøtter Agent Team og har en indbygget Code Reviewer. Codex Code Reviewer-integration kommer snart (forfatteren anbefaler stærkt at bruge Codex til at gennemgå Claude Code-kode).

## Licens

MIT
