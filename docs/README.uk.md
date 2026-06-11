# CC-Viewer

Інструмент Vibe Coding, побудований на основі Claude Code, у якому дистильовано власний досвід розробки:

1. Підвищення меж можливостей — запускайте /ultraPlan та /ultraReview локально, водночас уникаючи повного розкриття коду проєкту у хмарі Claude;
2. Адаптація до багатьох пристроїв — програмуйте з мобільного пристрою (у локальній мережі), вебверсія адаптується до різних сценаріїв, легко вбудовується у браузерні розширення чи розділений екран ОС, також доступний нативний інсталятор;
3. Повне збереження логів — повне перехоплення та аналіз payload Claude Code, ідеально для логування, налагодження, навчання та зворотної розробки;
4. Обмін навчальним досвідом — накопичено багато навчальних матеріалів і досвіду розробки (шукайте іконки «?» у різних місцях системи);
5. Збереження нативного досвіду — лише розширює можливості Claude Code без жодних суттєвих змін у ядрі, зберігаючи нативний досвід;
6. Підтримка сторонніх моделей — сумісний з deepseek-v4-\*, GLM 5.1, Kimi K2.6, вбудована функціональність cc-switch дозволяє перемикати сторонні інструменти на льоту;

<img width="860" alt="cc-viewer — deploy once, share with every device" src="https://raw.githubusercontent.com/weiesky/cc-viewer/main/docs/cc-viewer-share.svg" />

[English](../README.md) | [简体中文](./README.zh.md) | [繁體中文](./README.zh-TW.md) | [한국어](./README.ko.md) | [日本語](./README.ja.md) | [Deutsch](./README.de.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Italiano](./README.it.md) | [Dansk](./README.da.md) | [Polski](./README.pl.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [Norsk](./README.no.md) | [Português (Brasil)](./README.pt-BR.md) | [ไทย](./README.th.md) | [Türkçe](./README.tr.md) | Українська

## Використання

### Передумови

* Переконайтеся, що встановлено nodejs 20.0.0+; [Завантажити та встановити](https://nodejs.org)
* Переконайтеся, що встановлено claude code; [Посібник з установлення](https://github.com/anthropics/claude-code)

### Встановлення ccv

#### Встановлення через npm

```bash
npm install -g cc-viewer --registry=https://registry.npmjs.org
```

#### Встановлення через Homebrew (рекомендовано для macOS / Linux)

```bash
brew tap weiesky/cc-viewer
brew install cc-viewer
brew upgrade cc-viewer   # для оновлення використовуйте саме це; ccv, встановлений через brew, не оновлюйте через npm install -g
```

### Спосіб запуску

ccv — це прямий замінник claude: усі аргументи передаються до claude, водночас запускається Web Viewer.

```bash
ccv                    # == claude (інтерактивний режим)
```

Найчастіше автор використовує таку команду:

```
ccv -c --d             # == claude --continue --dangerously-skip-permissions
                       # ccv передає всі аргументи запуску claude code — комбінуйте їх як завгодно
```

Після запуску в режимі програмування вебсторінка відкриється автоматично.

cc-viewer також постачається як клієнтська версія: [Сторінка завантаження](https://github.com/weiesky/cc-viewer/releases)

### Режим логування

Якщо ви все ще звикли користуватися нативним інструментом claude або розширенням VS Code, використовуйте цей режим.

У цьому режимі запуск `claude`

автоматично запустить процес логування, який записуватиме логи запитів до \~/.claude/cc-viewer/*yourproject*/date.jsonl

Увімкнення режиму логування:

```bash
ccv -logger
```

Коли консоль не може вивести конкретний порт, за замовчуванням першим портом запуску є 127.0.0.1:7008. За одночасної наявності кількох екземплярів порти продовжуються по черзі — 7009, 7010 тощо.

Видалення режиму логування:

```bash
ccv --uninstall
```

### Усунення поширених проблем (Troubleshooting)

Якщо у вас виникли проблеми із запуском, є остаточний спосіб розв'язання:
Крок 1: Відкрийте claude code у будь-якому каталозі;
Крок 2: Дайте claude code інструкцію такого змісту:

```
我已经安装了cc-viewer这个npm包，但是执行ccv以后仍然无法有效运行。查看cc-viewer的cli.js 和 findcc.js，根据具体的环境，适配本地的claude code的部署方式。适配的时候修改范围尽量约束在findcc.js中。
```

Дозволити Claude Code самому перевіряти помилки — це ефективніше за консультації будь-кого та читання будь-якої документації!

Після виконання вищевказаної інструкції findcc.js буде оновлено. Якщо ваш проєкт часто потребує локального розгортання або якщо форкнутому коду часто доводиться розв'язувати проблеми з установленням, збереження цього файлу буде доцільним. Наступного разу його можна просто скопіювати. На цьому етапі багато проєктів і компаній, що використовують claude code, розгортають його не на mac, а на хостингу серверних середовищ, тому автор виокремив файл findcc.js, щоб надалі було легше відстежувати оновлення вихідного коду cc-viewer.

Примітка: цей застосунок конфліктує з claude-code-switch та claude-code-router через конкуренцію за proxy, тому при використанні обов'язково вимкніть claude-code-switch та claude-code-router; усередині cc-viewer надається функція гарячого оновлення проксі як рівноцінна заміна.

### Інші допоміжні команди

Перегляд:

```bash
ccv -h
```

### Тихий режим (Silent Mode)

За замовчуванням `ccv` під час обгортання `claude` перебуває в тихому режимі, забезпечуючи чистий вивід терміналу та узгодженість із нативним досвідом. Усі логи захоплюються у фоновому режимі та доступні для перегляду за адресою `http://localhost:7008`.

Після налаштування використовуйте команду `claude` як зазвичай. Відвідайте `http://localhost:7008` для доступу до інтерфейсу моніторингу.

## Можливості

### Режим програмування

Після запуску за допомогою ccv ви побачите:

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/ab353a2b-f101-409d-a28c-6a4e41571ea2" />

Ви можете переглядати diff коду одразу після завершення редагування:

<img height="728" width="1500" alt="image" src="https://github.com/user-attachments/assets/2a4acdaa-fc5f-4dc0-9e5f-f3273f0849b2" />

Хоча ви можете відкривати файли і програмувати вручну, ручне програмування не рекомендоване — це старомодне програмування!

### Мобільне програмування

Ви навіть можете відсканувати QR-код, щоб програмувати з мобільного пристрою:

<img height="1460" width="3018" alt="image" src="https://github.com/user-attachments/assets/8debf48e-daec-420c-b37a-609f8b81cd20" />

<img height="790" width="1700" alt="image" src="https://github.com/user-attachments/assets/da3e519f-ff66-4cd2-81d1-f4e131215f6c" />

Втілюйте свою уяву про мобільне програмування. Крім того, існує механізм плагінів — якщо вам потрібно налаштувати все під власні звички програмування, слідкуйте за оновленнями hooks для плагінів.

### Режим логування (перегляд повної сесії claude code)

<img height="768" width="1500" alt="image" src="https://github.com/user-attachments/assets/a8a9f3f7-d876-4f6b-a64d-f323a05c4d21" />

* Захоплення всіх API-запитів від Claude Code у реальному часі — гарантується оригінал, а не урізані логи (це дуже важливо!!!)
* Автоматичне розпізнавання та маркування запитів Main Agent і Sub Agent (підтипи: Plan, Search, Bash)
* Запити MainAgent підтримують Body Diff JSON — відмінності від попереднього запиту MainAgent показуються згорнутими (лише змінені/нові поля)
* Кожен запит відображає вбудовану статистику використання Token (вхідні/вихідні Token, створення/читання кешу, частота влучань)
* Сумісність із Claude Code Router (CCR) та іншими проксі-сценаріями — резервне зіставлення запитів за шаблонами шляху API

<a href="https://www.star-history.com/?repos=weiesky%2Fcc-viewer&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&theme=dark&legend=top-left" />

    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&legend=top-left" />

    ![Star History Chart](https://api.star-history.com/chart?repos=weiesky/cc-viewer&type=date&legend=top-left)
  </picture>
</a>

## License

MIT
