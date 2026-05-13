# CC-Viewer

Un toolkit Vibe Coding distillato dall'esperienza di sviluppo personale, costruito su Claude Code:

1. Elevare il limite delle capacità: esegui /ultraPlan e /ultraReview localmente, in modo che il codice del tuo progetto non debba mai essere completamente esposto al cloud di Claude;
2. Compatibilità multipiattaforma: consente la programmazione mobile (all'interno della LAN); la versione web si adatta a vari scenari, facile da incorporare in estensioni del browser e viste suddivise del sistema operativo, e fornisce un installatore nativo;
3. Registrazione completa: offre capacità complete di intercettazione e analisi del payload di Claude Code, ideale per la registrazione, l'analisi dei problemi, l'apprendimento, l'ispirazione e il reverse engineering;
4. Apprendimento ed esperienza condivisi: sono stati accumulati numerosi materiali di studio ed esperienze di sviluppo (vedi le icone "?" in tutto il sistema);
5. Esperienza nativa preservata: estende solo le capacità di Claude Code, senza modifiche sostanziali al kernel, mantenendo l'esperienza nativa;
6. Supporto per modelli di terze parti: compatibile con deepseek-v4-\*, GLM 5.1, Kimi K2.6, con la capacità cc-switch integrata per commutare a caldo tra strumenti di terze parti in qualsiasi momento.

[English](../README.md) | [简体中文](./README.zh.md) | [繁體中文](./README.zh-TW.md) | [한국어](./README.ko.md) | [日本語](./README.ja.md) | [Deutsch](./README.de.md) | [Español](./README.es.md) | [Français](./README.fr.md) | Italiano | [Dansk](./README.da.md) | [Polski](./README.pl.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [Norsk](./README.no.md) | [Português (Brasil)](./README.pt-BR.md) | [ไทย](./README.th.md) | [Türkçe](./README.tr.md) | [Українська](./README.uk.md)

## Utilizzo

### Prerequisiti

* Assicurati di aver installato Node.js 20.0.0+; [Scarica e installa](https://nodejs.org)
* Assicurati di aver installato Claude Code; [Tutorial di installazione](https://github.com/anthropics/claude-code)

### Installare ccv

#### Installazione tramite npm

```bash
npm install -g cc-viewer --registry=https://registry.npmjs.org
```

#### Installazione tramite Homebrew (consigliato per macOS / Linux)

```bash
brew tap weiesky/cc-viewer
brew install cc-viewer
brew upgrade cc-viewer   # per gli aggiornamenti — NON usare npm install -g con le installazioni brew
```

### Avvio

ccv è un sostituto diretto di claude — tutti gli argomenti vengono trasmessi a claude mentre viene avviato il Web Viewer.

```bash
ccv                    # == claude (modalità interattiva)
```

Il comando che l'autore stesso utilizza più spesso è:

```
ccv -c --d             # == claude --continue --dangerously-skip-permissions
                       # ccv trasmette tutti i parametri di avvio di Claude Code — puoi combinarli come preferisci
```

Dopo l'avvio in modalità programmazione, si aprirà automaticamente una pagina web.

cc-viewer è anche distribuito come applicazione desktop nativa: [Pagina di download](https://github.com/weiesky/cc-viewer/releases)

### Modalità Logger

Se preferisci ancora lo strumento nativo claude o l'estensione VS Code, usa questa modalità.

In questa modalità, l'avvio di `claude`

avvierà automaticamente un processo di registrazione che salva i log delle richieste in \~/.claude/cc-viewer/*yourproject*/date.jsonl

Abilitare la modalità logger:

```bash
ccv -logger
```

Quando la console non può stampare la porta specifica, la prima porta predefinita è 127.0.0.1:7008. Le istanze multiple utilizzano porte sequenziali come 7009, 7010.

Disinstallare la modalità logger:

```bash
ccv --uninstall
```

### Risoluzione dei problemi (Troubleshooting)

Se riscontri problemi all'avvio di cc-viewer, ecco l'approccio definitivo per la risoluzione dei problemi:
Passo 1: Apri Claude Code in qualsiasi directory.
Passo 2: Dai a Claude Code la seguente istruzione:

```
Ho installato il pacchetto npm cc-viewer, ma dopo aver eseguito ccv ancora non funziona correttamente. Controlla cli.js e findcc.js di cc-viewer e adattali al deployment locale di Claude Code in base all'ambiente specifico. Mantieni l'ambito delle modifiche il più possibile limitato a findcc.js.
```

Lasciare che Claude Code diagnostichi il problema da solo è più efficace che chiedere a chiunque o leggere qualsiasi documentazione!

Una volta completata l'istruzione precedente, findcc.js verrà aggiornato. Se il tuo progetto richiede frequentemente un deployment locale, o se il codice forkato deve spesso risolvere problemi di installazione, mantenere questo file ti permette semplicemente di copiarlo la volta successiva. Al momento, molti progetti e aziende che utilizzano Claude Code non distribuiscono su Mac ma in ambienti ospitati lato server, quindi l'autore ha separato il file findcc.js per facilitare il tracciamento degli aggiornamenti del codice sorgente di cc-viewer in futuro.

Nota: questa applicazione entra in conflitto con claude-code-switch e claude-code-router a causa della concorrenza del proxy, quindi quando la usi assicurati di chiudere claude-code-switch e claude-code-router. cc-viewer include una capacità di aggiornamento a caldo del proxy come sostituto equivalente.

### Altri comandi ausiliari

Consulta:

```bash
ccv -h
```

### Modalità silenziosa (Silent Mode)

Per impostazione predefinita, `ccv` viene eseguito in modalità silenziosa quando avvolge `claude`, mantenendo l'output del terminale pulito e coerente con l'esperienza nativa. Tutti i log vengono catturati in background e possono essere visualizzati su `http://localhost:7008`.

Una volta configurato, usa il comando `claude` normalmente. Visita `http://localhost:7008` per accedere all'interfaccia di monitoraggio.

## Funzionalità

### Modalità Programmazione

Dopo l'avvio con ccv, puoi vedere:

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/ab353a2b-f101-409d-a28c-6a4e41571ea2" />

Puoi vedere le differenze di codice direttamente dopo la modifica:

<img height="728" width="1500" alt="image" src="https://github.com/user-attachments/assets/2a4acdaa-fc5f-4dc0-9e5f-f3273f0849b2" />

Anche se puoi aprire file e codificare manualmente, la programmazione manuale non è consigliata — è programmazione all'antica!

### Programmazione mobile

Puoi persino scansionare un codice QR per programmare dal tuo dispositivo mobile:

<img height="1460" width="3018" alt="image" src="https://github.com/user-attachments/assets/8debf48e-daec-420c-b37a-609f8b81cd20" />

<img height="790" width="1700" alt="image" src="https://github.com/user-attachments/assets/da3e519f-ff66-4cd2-81d1-f4e131215f6c" />

Realizza la tua immaginazione della programmazione mobile. C'è anche un meccanismo di plugin — se hai bisogno di personalizzare in base alle tue abitudini di codifica, tieni d'occhio gli aggiornamenti degli hook dei plugin.

### Modalità Logger (Visualizzare sessioni complete di Claude Code)

<img height="768" width="1500" alt="image" src="https://github.com/user-attachments/assets/a8a9f3f7-d876-4f6b-a64d-f323a05c4d21" />

* Cattura tutte le richieste API di Claude Code in tempo reale, garantendo il testo grezzo — non log censurati (questo è importante!!!)
* Identifica ed etichetta automaticamente le richieste Main Agent e Sub Agent (sottotipi: Plan, Search, Bash)
* Le richieste MainAgent supportano Body Diff JSON, mostrando le differenze ripiegate rispetto alla precedente richiesta MainAgent (solo campi modificati/nuovi)
* Ogni richiesta mostra le statistiche di utilizzo dei Token in linea (Token di input/output, creazione/lettura cache, tasso di successo)
* Compatibile con Claude Code Router (CCR) e altri scenari di proxy — ricorre al pattern del percorso API

### Modalità Conversazione

Clicca sul pulsante «Modalità Conversazione» nell'angolo in alto a destra per analizzare la cronologia completa delle conversazioni del Main Agent in un'interfaccia di chat:

<img height="764" width="1500" alt="image" src="https://github.com/user-attachments/assets/725b57c8-6128-4225-b157-7dba2738b1c6" />

* La visualizzazione di Agent Team non è ancora supportata
* I messaggi dell'utente sono allineati a destra (bolle blu), le risposte del Main Agent sono allineate a sinistra (bolle scure)
* I blocchi `thinking` sono ripiegati per impostazione predefinita, renderizzati come Markdown — clicca per espandere e vedere il processo di pensiero; è supportata la traduzione con un clic (la funzionalità è ancora instabile)
* I messaggi di selezione utente (AskUserQuestion) vengono visualizzati in formato domanda-risposta
* Sincronizzazione bidirezionale delle modalità: passare alla modalità conversazione si posiziona automaticamente sulla conversazione corrispondente alla richiesta selezionata; tornare alla modalità testo grezzo si posiziona automaticamente sulla richiesta selezionata
* Pannello impostazioni: attiva/disattiva lo stato di ripiegamento predefinito per i risultati degli strumenti e i blocchi thinking
* Navigazione mobile delle conversazioni: in modalità mobile CLI, tocca il pulsante «Navigazione conversazioni» nella barra superiore per scorrere una vista di conversazione di sola lettura per navigare nella cronologia completa delle conversazioni su mobile

### Gestione dei log

Tramite il menu a tendina CC-Viewer nell'angolo in alto a sinistra:

<img height="760" width="1500" alt="image" src="https://github.com/user-attachments/assets/33295e2b-f2e0-4968-a6f1-6f3d1404454e" />

**Compressione dei log**
Riguardo ai log, l'autore desidera chiarire che le definizioni ufficiali di Anthropic non sono state modificate, garantendo l'integrità del log.
Tuttavia, poiché le singole voci di log del modello 1M Opus possono diventare estremamente grandi nelle fasi successive, grazie ad alcune ottimizzazioni di logging per MainAgent, si ottiene almeno una riduzione del 66% delle dimensioni senza gzip.
Il metodo di analisi per questi log compressi può essere estratto dal repository corrente.

### Altre funzionalità utili

<img height="767" width="1500" alt="image" src="https://github.com/user-attachments/assets/add558c5-9c4d-468a-ac6f-d8d64759fdbd" />

Puoi individuare rapidamente i tuoi prompt utilizzando gli strumenti della barra laterale.

***

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/82b8eb67-82f5-41b1-89d6-341c95a047ed" />

L'interessante funzionalità KV-Cache-Text ti permette di vedere esattamente ciò che vede Claude.

***

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/54cdfa4e-677c-4aed-a5bb-5fd946600c46" />

Puoi caricare immagini e descrivere le tue esigenze — la comprensione delle immagini da parte di Claude è incredibilmente potente. E come sai, puoi incollare immagini direttamente con Ctrl+V, e il loro contenuto completo verrà visualizzato nella conversazione.

***

<img height="370" width="600" alt="image" src="https://github.com/user-attachments/assets/87d332ea-3e34-4957-b442-f9d070211fbf" />

Puoi personalizzare plugin, gestire tutti i processi di cc-viewer, e cc-viewer supporta il passaggio a caldo a API di terze parti (sì, puoi usare GLM, Kimi, MiniMax, Qwen, DeepSeek — anche se l'autore li considera tutti piuttosto deboli al momento).

***

<img height="746" width="1500" alt="image" src="https://github.com/user-attachments/assets/b1f60c7c-1438-4ecc-8c64-193d21ee3445" />

Altre funzionalità attendono di essere scoperte... Ad esempio: il sistema supporta Agent Team, e ha un Code Reviewer integrato. L'integrazione di Codex Code Reviewer arriverà presto (l'autore raccomanda vivamente di utilizzare Codex per revisionare il codice di Claude Code).

## License

MIT
