# CC-Viewer

Et Vibe Coding-verktøysett destillert fra egen utviklingserfaring og bygget på Claude Code:

1. Hev evnetaket: Kjør /ultraPlan og /ultraReview lokalt, slik at prosjektkoden din aldri er fullt eksponert for Claudes sky;
2. Flerplattform-støtte: Muliggjør mobil programmering (i det lokale nettverket); webversjonen tilpasser seg ulike scenarier, kan enkelt bygges inn i nettleserutvidelser og operativsystemets delte skjerm, og leveres med en native installasjonspakke;
3. Fullstendig logging: Tilbyr omfattende opphenting og analyse av Claude Code-payloads — ideelt for logging, feilsøking, læring, inspirasjon og reverse-engineering;
4. Læring og erfaringsdeling: En rekke studiemateriell og utviklingserfaringer er samlet (se „?"-symbolene rundt om i systemet);
5. Native opplevelse bevart: Utvider kun Claude Codes evner uten vesentlige endringer i kjernen — den native opplevelsen er bevart;
6. Tredjepartsmodeller støttet: Kompatibel med deepseek-v4-\*, GLM 5.1, Kimi K2.6, med innebygd cc-switch-evne for hot-switching mellom tredjepartsverktøy når som helst;

<img width="860" alt="cc-viewer — deploy once, share with every device" src="https://raw.githubusercontent.com/weiesky/cc-viewer/main/docs/cc-viewer-share.svg" />

[English](../README.md) | [简体中文](./README.zh.md) | [繁體中文](./README.zh-TW.md) | [한국어](./README.ko.md) | [日本語](./README.ja.md) | [Deutsch](./README.de.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Italiano](./README.it.md) | [Dansk](./README.da.md) | [Polski](./README.pl.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | Norsk | [Português (Brasil)](./README.pt-BR.md) | [ไทย](./README.th.md) | [Türkçe](./README.tr.md) | [Українська](./README.uk.md)

## Bruk

### Forutsetninger

* Sørg for at Node.js 20.0.0+ er installert; [Last ned og installer](https://nodejs.org)
* Sørg for at Claude Code er installert; [Installasjonsveiledning](https://github.com/anthropics/claude-code)

### Installer ccv

#### Installasjon via npm

```bash
npm install -g cc-viewer --registry=https://registry.npmjs.org
```

#### Installasjon via Homebrew (anbefalt for macOS / Linux)

```bash
brew tap weiesky/cc-viewer
brew install cc-viewer
brew upgrade cc-viewer   # bruk denne for oppgradering — bruk IKKE npm install -g for ccv installert via brew
```

### Slik starter du

ccv er en direkte erstatning for claude — alle argumenter sendes videre til claude, samtidig som Web Viewer startes.

```bash
ccv                    # == claude (interaktiv modus)
```

Kommandoen forfatteren bruker mest er:

```
ccv -c --d             # == claude --continue --dangerously-skip-permissions
                       # ccv sender videre alle Claude Codes oppstartsparametere — du kan kombinere dem som du vil
```

Etter at programmeringsmodusen er startet, åpnes en nettside automatisk.

cc-viewer kommer også som native desktop-app: [Nedlastingsside](https://github.com/weiesky/cc-viewer/releases)

### Logger-modus

Hvis du fortsatt foretrekker det native claude-verktøyet eller VS Code-utvidelsen, bruker du denne modusen.

I denne modusen starter `claude`

automatisk en loggprosess som registrerer forespørselslogger til \~/.claude/cc-viewer/*yourproject*/date.jsonl

Start logger-modus:

```bash
ccv -logger
```

Når konsollet ikke kan skrive ut den spesifikke porten, er den første standardporten 127.0.0.1:7008. Ved flere samtidige instanser brukes fortløpende porter som 7009, 7010.

Avinstaller logger-modus:

```bash
ccv --uninstall
```

### Feilsøking (Troubleshooting)

Hvis du støter på oppstartsproblemer, er her den ultimate feilsøkingstilnærmingen:
Trinn 1: Åpne Claude Code i en hvilken som helst mappe;
Trinn 2: Gi Claude Code følgende instruks:

```
Jeg har installert npm-pakken cc-viewer, men etter å ha kjørt ccv fungerer det fortsatt ikke som det skal. Sjekk cli.js og findcc.js i cc-viewer og tilpass dem til den lokale Claude Code-utrullingen basert på det spesifikke miljøet. Hold endringene så begrenset som mulig til findcc.js.
```

Å la Claude Code diagnostisere problemet selv er mer effektivt enn å spørre noen eller lese dokumentasjon!

Når instruksjonen ovenfor er fullført, oppdateres findcc.js. Hvis prosjektet ditt ofte krever lokal utrulling eller forket kode ofte må løse installasjonsproblemer, bare behold denne filen. Neste gang kan du bare kopiere den. I dag er det mange prosjekter og selskaper som bruker Claude Code som ikke ruller ut på Mac, men i serverhostede miljøer, så forfatteren har separert findcc.js for å gjøre det lettere å spore cc-viewers kildekodeoppdateringer fremover.

Merk: Denne applikasjonen er i konflikt med claude-code-switch og claude-code-router, da det er et proxy-konkurranseproblem, så sørg for å deaktivere claude-code-switch og claude-code-router når du bruker cc-viewer — inne i cc-viewer leveres en proxy-hot-update-funksjon som tilsvarende erstatning.

### Andre hjelpekommandoer

Se:

```bash
ccv -h
```

### Silent-modus (Silent Mode)

Som standard kjører `ccv` i silent-modus når den pakker inn `claude`, og holder terminalutgangen din ren og i samsvar med den native opplevelsen. Alle logger fanges opp i bakgrunnen og kan ses på `http://localhost:7008`.

Etter konfigurasjon bruker du `claude`-kommandoen som normalt. Besøk `http://localhost:7008` for å få tilgang til overvåkingsgrensesnittet.

## Funksjoner

### Programmeringsmodus

Etter oppstart med ccv kan du se:

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/ab353a2b-f101-409d-a28c-6a4e41571ea2" />

Du kan se code diffs direkte etter redigering:

<img height="728" width="1500" alt="image" src="https://github.com/user-attachments/assets/2a4acdaa-fc5f-4dc0-9e5f-f3273f0849b2" />

Selv om du manuelt kan åpne filer og kode, anbefales ikke manuell programmering — det er gammeldags koding!

### Mobil programmering

Du kan til og med skanne en QR-kode for å programmere fra mobilenheten din:

<img height="1460" width="3018" alt="image" src="https://github.com/user-attachments/assets/8debf48e-daec-420c-b37a-609f8b81cd20" />

<img height="790" width="1700" alt="image" src="https://github.com/user-attachments/assets/da3e519f-ff66-4cd2-81d1-f4e131215f6c" />

Oppfyll din forestilling om mobil programmering. Det finnes også en plugin-mekanisme — hvis du trenger tilpasninger til programmeringsvanene dine, kan du holde deg oppdatert om kommende plugin-hook-oppdateringer.

### Logger-modus (Se komplette Claude Code-økter)

<img height="768" width="1500" alt="image" src="https://github.com/user-attachments/assets/a8a9f3f7-d876-4f6b-a64d-f323a05c4d21" />

* Fanger alle API-forespørsler fra Claude Code i sanntid og sikrer råtekst — ikke redigerte logger (dette er viktig!!!)
* Identifiserer og merker automatisk Main Agent- og Sub Agent-forespørsler (undertyper: Plan, Search, Bash)
* MainAgent-forespørsler støtter Body Diff JSON og viser sammenklappede forskjeller fra forrige MainAgent-forespørsel (kun endrede/nye felter)
* Hver forespørsel viser inline Token-bruksstatistikk (input/output-Tokens, cache-opprettelse/-lesing, treffrate)
* Kompatibel med Claude Code Router (CCR) og andre proxy-scenarier — faller tilbake til mønstermatching av API-stier

<a href="https://www.star-history.com/?repos=weiesky%2Fcc-viewer&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&theme=dark&legend=top-left" />

    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&legend=top-left" />

    ![Star History Chart](https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&legend=top-left)
  </picture>
</a>

## Lisens

MIT
