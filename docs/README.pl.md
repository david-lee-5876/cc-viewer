# CC-Viewer

Zestaw narzędzi Vibe Coding wydestylowany z własnego doświadczenia programistycznego i zbudowany na Claude Code:

1. Podnieś pułap możliwości: uruchamiaj /ultraPlan i /ultraReview lokalnie, dzięki czemu kod twojego projektu nigdy nie jest w pełni eksponowany na chmurę Claude;
2. Wsparcie wieloplatformowe: umożliwia programowanie mobilne (w sieci lokalnej); wersja webowa dostosowuje się do różnych scenariuszy, łatwo osadza się w rozszerzeniach przeglądarek i podzielonym ekranie systemu operacyjnego, oraz dostarcza natywny instalator;
3. Pełne logowanie: zapewnia kompleksowe przechwytywanie i analizę payloadów Claude Code — idealne do logowania, debugowania, nauki, inspiracji i inżynierii wstecznej;
4. Dzielenie się nauką i doświadczeniem: zebrano wiele materiałów dydaktycznych i doświadczeń programistycznych (patrz symbole „?" rozsiane po systemie);
5. Zachowane natywne doświadczenie: jedynie rozszerza możliwości Claude Code bez istotnych modyfikacji jądra — natywne doświadczenie zostaje zachowane;
6. Wsparcie modeli zewnętrznych: kompatybilny z deepseek-v4-\*, GLM 5.1, Kimi K2.6, z wbudowaną funkcją cc-switch umożliwiającą hot-switching pomiędzy narzędziami zewnętrznymi w dowolnym momencie;

[English](../README.md) | [简体中文](./README.zh.md) | [繁體中文](./README.zh-TW.md) | [한국어](./README.ko.md) | [日本語](./README.ja.md) | [Deutsch](./README.de.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Italiano](./README.it.md) | [Dansk](./README.da.md) | Polski | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [Norsk](./README.no.md) | [Português (Brasil)](./README.pt-BR.md) | [ไทย](./README.th.md) | [Türkçe](./README.tr.md) | [Українська](./README.uk.md)

## Użycie

### Wymagania wstępne

* Upewnij się, że masz zainstalowane Node.js 20.0.0+; [Pobierz i zainstaluj](https://nodejs.org)
* Upewnij się, że masz zainstalowane Claude Code; [Instrukcja instalacji](https://github.com/anthropics/claude-code)

### Instalacja ccv

#### Instalacja przez npm

```bash
npm install -g cc-viewer --registry=https://registry.npmjs.org
```

#### Instalacja przez Homebrew (zalecane dla macOS / Linux)

```bash
brew tap weiesky/cc-viewer
brew install cc-viewer
brew upgrade cc-viewer   # użyj tego do aktualizacji — NIE używaj npm install -g do aktualizacji ccv zainstalowanego przez brew
```

### Jak uruchomić

ccv jest bezpośrednim zamiennikiem claude — wszystkie argumenty są przekazywane do claude, jednocześnie uruchamiając Web Viewer.

```bash
ccv                    # == claude (tryb interaktywny)
```

Komenda, której autor używa najczęściej, to:

```
ccv -c --d             # == claude --continue --dangerously-skip-permissions
                       # ccv przekazuje wszystkie parametry startowe Claude Code — możesz dowolnie je łączyć
```

Po uruchomieniu trybu programowania automatycznie otwiera się strona internetowa.

cc-viewer jest również dostarczany jako natywna aplikacja desktopowa: [Strona pobierania](https://github.com/weiesky/cc-viewer/releases)

### Tryb loggera

Jeśli nadal wolisz natywne narzędzie claude lub rozszerzenie VS Code, użyj tego trybu.

W tym trybie `claude`

automatycznie uruchamia proces logowania, który zapisuje logi żądań do \~/.claude/cc-viewer/*yourproject*/date.jsonl

Uruchom tryb loggera:

```bash
ccv -logger
```

Gdy konsola nie może wyświetlić konkretnego portu, domyślnym pierwszym portem jest 127.0.0.1:7008. Przy wielu jednoczesnych instancjach używane są kolejne porty, np. 7009, 7010.

Odinstaluj tryb loggera:

```bash
ccv --uninstall
```

### Rozwiązywanie problemów (Troubleshooting)

Jeśli napotkasz problemy z uruchomieniem, oto ostateczne podejście do rozwiązywania problemów:
Krok 1: Otwórz Claude Code w dowolnym katalogu;
Krok 2: Daj Claude Code następującą instrukcję:

```
Zainstalowałem pakiet npm cc-viewer, ale po uruchomieniu ccv nadal nie działa poprawnie. Sprawdź cli.js i findcc.js z cc-viewer i dostosuj je do lokalnego wdrożenia Claude Code w oparciu o specyficzne środowisko. Utrzymaj zakres zmian jak najbardziej ograniczony do findcc.js.
```

Pozwolenie Claude Code na samodzielne zdiagnozowanie problemu jest bardziej skuteczne niż pytanie kogokolwiek lub czytanie jakiejkolwiek dokumentacji!

Po zakończeniu powyższej instrukcji plik findcc.js zostanie zaktualizowany. Jeśli twój projekt często wymaga lokalnego wdrożenia lub forkowany kod musi często rozwiązywać problemy instalacyjne, po prostu zachowaj ten plik. Następnym razem po prostu go skopiuj. Obecnie wiele projektów i firm korzystających z Claude Code nie wdraża się na Macu, lecz w środowiskach hostowanych na serwerach, dlatego autor wyodrębnił findcc.js, aby ułatwić śledzenie aktualizacji kodu źródłowego cc-viewer w przyszłości.

Uwaga: ta aplikacja jest w konflikcie z claude-code-switch i claude-code-router, ponieważ występuje problem konkurencji proxy, więc upewnij się, że wyłączyłeś claude-code-switch i claude-code-router podczas korzystania z cc-viewer — wewnątrz cc-viewer zapewniona jest funkcja hot-update proxy jako równoważny zamiennik.

### Inne komendy pomocnicze

Sprawdź:

```bash
ccv -h
```

### Tryb cichy (Silent Mode)

Domyślnie `ccv` działa w trybie cichym, gdy opakowuje `claude`, utrzymując czyste wyjście terminala zgodne z natywnym doświadczeniem. Wszystkie logi są przechwytywane w tle i można je przeglądać pod adresem `http://localhost:7008`.

Po konfiguracji używaj komendy `claude` jak zwykle. Odwiedź `http://localhost:7008`, aby uzyskać dostęp do interfejsu monitorowania.

## Funkcje

### Tryb programowania

Po uruchomieniu z ccv możesz zobaczyć:

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/ab353a2b-f101-409d-a28c-6a4e41571ea2" />

Możesz wyświetlać diffy kodu bezpośrednio po edycji:

<img height="728" width="1500" alt="image" src="https://github.com/user-attachments/assets/2a4acdaa-fc5f-4dc0-9e5f-f3273f0849b2" />

Chociaż możesz ręcznie otwierać pliki i kod, ręczne programowanie nie jest zalecane — to staroszkolne kodowanie!

### Programowanie mobilne

Możesz nawet zeskanować kod QR, aby programować z urządzenia mobilnego:

<img height="1460" width="3018" alt="image" src="https://github.com/user-attachments/assets/8debf48e-daec-420c-b37a-609f8b81cd20" />

<img height="790" width="1700" alt="image" src="https://github.com/user-attachments/assets/da3e519f-ff66-4cd2-81d1-f4e131215f6c" />

Spełnij swoje wyobrażenie o programowaniu mobilnym. Istnieje również mechanizm wtyczek — jeśli potrzebujesz dostosowań do swoich nawyków programistycznych, śledź nadchodzące aktualizacje hooków wtyczek.

### Tryb loggera (Wyświetlanie pełnych sesji Claude Code)

<img height="768" width="1500" alt="image" src="https://github.com/user-attachments/assets/a8a9f3f7-d876-4f6b-a64d-f323a05c4d21" />

* Przechwytuje wszystkie żądania API z Claude Code w czasie rzeczywistym, zapewniając tekst surowy — nie zredagowane logi (to jest ważne!!!)
* Automatycznie identyfikuje i oznacza żądania Main Agent i Sub Agent (podtypy: Plan, Search, Bash)
* Żądania MainAgent obsługują Body Diff JSON, pokazując zwinięte różnice w stosunku do poprzedniego żądania MainAgent (tylko zmienione/nowe pola)
* Każde żądanie wyświetla inline statystyki użycia Tokenów (Tokeny wejścia/wyjścia, tworzenie/odczyt cache, współczynnik trafień)
* Kompatybilny z Claude Code Router (CCR) i innymi scenariuszami proxy — wraca do dopasowywania wzorców ścieżek API

### Tryb konwersacji

Kliknij przycisk „Tryb konwersacji" w prawym górnym rogu, aby przeparsować pełną historię konwersacji Main Agent do interfejsu czatu:

<img height="764" width="1500" alt="image" src="https://github.com/user-attachments/assets/725b57c8-6128-4225-b157-7dba2738b1c6" />

* Wyświetlanie Agent Team nie jest jeszcze obsługiwane
* Wiadomości użytkownika są wyrównane do prawej (niebieskie bąbelki), odpowiedzi Main Agent są wyrównane do lewej (ciemne bąbelki)
* Bloki `thinking` są domyślnie zwinięte i renderowane jako Markdown — kliknij, aby rozwinąć i zobaczyć proces myślowy; obsługiwane jest tłumaczenie jednym kliknięciem (funkcja jest jeszcze niestabilna)
* Wiadomości wyboru użytkownika (AskUserQuestion) są wyświetlane w formacie pytanie/odpowiedź
* Dwukierunkowa synchronizacja trybów: przełączenie na tryb konwersacji automatycznie przewija do konwersacji odpowiadającej wybranemu żądaniu; przełączenie z powrotem na tryb surowy automatycznie przewija do wybranego żądania
* Panel ustawień: przełącz domyślny stan zwinięcia dla wyników narzędzi i bloków thinking
* Mobilne przeglądanie konwersacji: w trybie CLI mobilnym dotknij przycisku „Przeglądanie konwersacji" na górnym pasku, aby wysunąć widok konwersacji tylko do odczytu do przeglądania pełnej historii konwersacji na mobilnym

### Zarządzanie logami

Poprzez menu rozwijane CC-Viewer w lewym górnym rogu:

<img height="760" width="1500" alt="image" src="https://github.com/user-attachments/assets/33295e2b-f2e0-4968-a6f1-6f3d1404454e" />

**Kompresja logów**
W kwestii logów autor pragnie wyjaśnić, że oficjalne definicje Anthropic nie zostały zmodyfikowane, aby zapewnić integralność logów.
Jednakże, ponieważ pojedyncze wpisy logów modelu 1M Opus mogą stać się ekstremalnie duże w późniejszych fazach, dzięki niektórym optymalizacjom logów dla MainAgent osiągana jest redukcja rozmiaru o co najmniej 66 % bez gzip.
Metodę parsowania tych skompresowanych logów można wyekstrahować z bieżącego repozytorium.

### Więcej wygodnych i przydatnych funkcji

<img height="767" width="1500" alt="image" src="https://github.com/user-attachments/assets/add558c5-9c4d-468a-ac6f-d8d64759fdbd" />

Możesz szybko zlokalizować swoje prompty za pomocą narzędzi paska bocznego.

***

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/82b8eb67-82f5-41b1-89d6-341c95a047ed" />

Interesująca funkcja KV-Cache-Text pozwala zobaczyć dokładnie to, co widzi Claude.

***

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/54cdfa4e-677c-4aed-a5bb-5fd946600c46" />

Możesz przesyłać obrazy i opisywać swoje potrzeby — rozumienie obrazów przez Claude jest niesamowicie potężne. I jak wiesz, możesz wklejać obrazy bezpośrednio za pomocą Ctrl+V, a twoja pełna zawartość zostanie wyświetlona w konwersacji.

***

<img height="370" width="600" alt="image" src="https://github.com/user-attachments/assets/87d332ea-3e34-4957-b442-f9d070211fbf" />

Możesz dostosowywać wtyczki, zarządzać wszystkimi procesami cc-viewer, a cc-viewer obsługuje hot-switching do zewnętrznych API (tak, możesz używać GLM, Kimi, MiniMax, Qwen, DeepSeek — choć autor uważa, że obecnie są one wszystkie dość słabe).

***

<img height="746" width="1500" alt="image" src="https://github.com/user-attachments/assets/b1f60c7c-1438-4ecc-8c64-193d21ee3445" />

Więcej funkcji czeka na odkrycie... Na przykład: system obsługuje Agent Team i ma wbudowanego Code Reviewer. Integracja Codex Code Reviewer wkrótce (autor gorąco poleca używanie Codex do code review kodu Claude Code).

## Licencja

MIT
