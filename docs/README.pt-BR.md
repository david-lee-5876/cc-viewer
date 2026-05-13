# CC-Viewer

Um kit de ferramentas de Vibe Coding destilado da própria experiência de desenvolvimento, construído sobre Claude Code:

1. Elevar o limite das capacidades: execute /ultraPlan e /ultraReview localmente, para que o código do seu projeto nunca precise estar totalmente exposto à nuvem do Claude;
2. Compatibilidade multiplataforma: permite a programação móvel (dentro da LAN); a versão web se adapta a diversos cenários, fácil de incorporar em extensões de navegador e visualizações divididas do sistema operacional, e fornece um instalador nativo;
3. Registro completo: oferece capacidades completas de interceptação e análise do payload do Claude Code, ideal para registro, análise de problemas, aprendizado, inspiração e engenharia reversa;
4. Aprendizado e experiência compartilhados: foram acumulados inúmeros materiais de estudo e experiências de desenvolvimento (veja os ícones "?" em todo o sistema);
5. Experiência nativa preservada: apenas amplia as capacidades do Claude Code, sem modificações substanciais ao núcleo, mantendo a experiência nativa;
6. Suporte a modelos de terceiros: compatível com deepseek-v4-\*, GLM 5.1, Kimi K2.6, com a capacidade cc-switch integrada para alternar a quente entre ferramentas de terceiros a qualquer momento.

[English](../README.md) | [简体中文](./README.zh.md) | [繁體中文](./README.zh-TW.md) | [한국어](./README.ko.md) | [日本語](./README.ja.md) | [Deutsch](./README.de.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Italiano](./README.it.md) | [Dansk](./README.da.md) | [Polski](./README.pl.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [Norsk](./README.no.md) | Português (Brasil) | [ไทย](./README.th.md) | [Türkçe](./README.tr.md) | [Українська](./README.uk.md)

## Uso

### Pré-requisitos

* Certifique-se de ter o Node.js 20.0.0+ instalado; [Baixar e instalar](https://nodejs.org)
* Certifique-se de ter o Claude Code instalado; [Tutorial de instalação](https://github.com/anthropics/claude-code)

### Instalar ccv

#### Instalação via npm

```bash
npm install -g cc-viewer --registry=https://registry.npmjs.org
```

#### Instalação via Homebrew (recomendado para macOS / Linux)

```bash
brew tap weiesky/cc-viewer
brew install cc-viewer
brew upgrade cc-viewer   # para atualizações — NÃO use npm install -g com instalações brew
```

### Inicialização

ccv é um substituto direto do claude — todos os argumentos são repassados para o claude enquanto o Web Viewer é iniciado.

```bash
ccv                    # == claude (modo interativo)
```

O comando que o próprio autor usa com mais frequência é:

```
ccv -c --d             # == claude --continue --dangerously-skip-permissions
                       # ccv repassa todos os parâmetros de inicialização do Claude Code — você pode combiná-los como quiser
```

Após iniciar no modo de programação, uma página web será aberta automaticamente.

cc-viewer também é distribuído como aplicativo desktop nativo: [Página de download](https://github.com/weiesky/cc-viewer/releases)

### Modo Logger

Se você ainda prefere a ferramenta nativa claude ou a extensão do VS Code, use este modo.

Neste modo, iniciar `claude`

iniciará automaticamente um processo de registro que salva os logs de solicitações em \~/.claude/cc-viewer/*yourproject*/date.jsonl

Ativar o modo logger:

```bash
ccv -logger
```

Quando o console não pode imprimir a porta específica, a primeira porta padrão é 127.0.0.1:7008. Instâncias múltiplas usam portas sequenciais como 7009, 7010.

Desinstalar o modo logger:

```bash
ccv --uninstall
```

### Solução de problemas (Troubleshooting)

Se você encontrar problemas ao iniciar o cc-viewer, aqui está a abordagem definitiva para solução de problemas:
Passo 1: Abra o Claude Code em qualquer diretório.
Passo 2: Dê ao Claude Code a seguinte instrução:

```
Eu instalei o pacote npm cc-viewer, mas após executar ccv ainda não funciona corretamente. Por favor, verifique cli.js e findcc.js do cc-viewer e adapte-os ao deployment local do Claude Code com base no ambiente específico. Mantenha o escopo das alterações o mais restrito possível dentro do findcc.js.
```

Deixar o Claude Code diagnosticar o problema sozinho é mais eficaz do que perguntar a qualquer pessoa ou ler qualquer documentação!

Depois que a instrução acima for concluída, o findcc.js será atualizado. Se o seu projeto requer frequentemente deployment local, ou se o código forkado precisa frequentemente resolver problemas de instalação, manter este arquivo permite que você simplesmente o copie da próxima vez. No momento, muitos projetos e empresas que usam Claude Code não estão fazendo deployment no Mac, mas sim em ambientes hospedados no lado do servidor, então o autor separou o arquivo findcc.js para facilitar o acompanhamento das atualizações do código-fonte do cc-viewer no futuro.

Nota: este aplicativo entra em conflito com claude-code-switch e claude-code-router devido à concorrência de proxy, portanto, ao usá-lo, certifique-se de fechar claude-code-switch e claude-code-router. cc-viewer inclui uma capacidade de atualização a quente de proxy como substituto equivalente.

### Outros comandos auxiliares

Consulte:

```bash
ccv -h
```

### Modo silencioso (Silent Mode)

Por padrão, `ccv` é executado em modo silencioso ao envolver `claude`, mantendo a saída do terminal limpa e consistente com a experiência nativa. Todos os logs são capturados em segundo plano e podem ser visualizados em `http://localhost:7008`.

Uma vez configurado, use o comando `claude` normalmente. Visite `http://localhost:7008` para acessar a interface de monitoramento.

## Recursos

### Modo Programação

Após iniciar com ccv, você pode ver:

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/ab353a2b-f101-409d-a28c-6a4e41571ea2" />

Você pode ver as diferenças de código diretamente após editar:

<img height="728" width="1500" alt="image" src="https://github.com/user-attachments/assets/2a4acdaa-fc5f-4dc0-9e5f-f3273f0849b2" />

Embora você possa abrir arquivos e programar manualmente, a programação manual não é recomendada — isso é programação antiquada!

### Programação móvel

Você pode até escanear um código QR para programar a partir do seu dispositivo móvel:

<img height="1460" width="3018" alt="image" src="https://github.com/user-attachments/assets/8debf48e-daec-420c-b37a-609f8b81cd20" />

<img height="790" width="1700" alt="image" src="https://github.com/user-attachments/assets/da3e519f-ff66-4cd2-81d1-f4e131215f6c" />

Realize sua imaginação sobre programação móvel. Também há um mecanismo de plugins — se precisar personalizar para seus hábitos de programação, fique atento às atualizações dos hooks de plugins.

### Modo Logger (Visualizar sessões completas do Claude Code)

<img height="768" width="1500" alt="image" src="https://github.com/user-attachments/assets/a8a9f3f7-d876-4f6b-a64d-f323a05c4d21" />

* Captura todas as solicitações de API do Claude Code em tempo real, garantindo o texto bruto — não logs censurados (isso é importante!!!)
* Identifica e marca automaticamente as solicitações Main Agent e Sub Agent (subtipos: Plan, Search, Bash)
* As solicitações MainAgent suportam Body Diff JSON, mostrando diferenças recolhidas em relação à solicitação MainAgent anterior (apenas campos modificados/novos)
* Cada solicitação exibe estatísticas de uso de Token em linha (Tokens de entrada/saída, criação/leitura de cache, taxa de acerto)
* Compatível com Claude Code Router (CCR) e outros cenários de proxy — recorre ao padrão de caminho da API

### Modo Conversa

Clique no botão «Modo Conversa» no canto superior direito para analisar o histórico completo de conversas do Main Agent em uma interface de chat:

<img height="764" width="1500" alt="image" src="https://github.com/user-attachments/assets/725b57c8-6128-4225-b157-7dba2738b1c6" />

* A visualização do Agent Team ainda não é suportada
* As mensagens do usuário ficam alinhadas à direita (balões azuis), as respostas do Main Agent ficam alinhadas à esquerda (balões escuros)
* Os blocos `thinking` ficam recolhidos por padrão, renderizados como Markdown — clique para expandir e ver o processo de pensamento; tradução com um clique é suportada (o recurso ainda é instável)
* As mensagens de seleção do usuário (AskUserQuestion) são exibidas em formato pergunta-resposta
* Sincronização bidirecional de modos: alternar para o modo conversa posiciona automaticamente na conversa correspondente à solicitação selecionada; voltar para o modo texto bruto posiciona automaticamente na solicitação selecionada
* Painel de configurações: alternar o estado de recolhimento padrão para resultados de ferramentas e blocos thinking
* Navegação móvel de conversas: no modo móvel CLI, toque no botão «Navegação de Conversas» na barra superior para deslizar uma visualização de conversa somente leitura para navegar pelo histórico completo de conversas no celular

### Gerenciamento de logs

Através do menu suspenso CC-Viewer no canto superior esquerdo:

<img height="760" width="1500" alt="image" src="https://github.com/user-attachments/assets/33295e2b-f2e0-4968-a6f1-6f3d1404454e" />

**Compressão de logs**
Em relação aos logs, o autor deseja esclarecer que as definições oficiais da Anthropic não foram modificadas, garantindo a integridade do log.
No entanto, como as entradas individuais de log do modelo 1M Opus podem se tornar extremamente grandes em estágios posteriores, graças a certas otimizações de log para MainAgent, pelo menos 66% de redução de tamanho é alcançada sem gzip.
O método de análise para esses logs comprimidos pode ser extraído do repositório atual.

### Mais recursos úteis

<img height="767" width="1500" alt="image" src="https://github.com/user-attachments/assets/add558c5-9c4d-468a-ac6f-d8d64759fdbd" />

Você pode localizar rapidamente seus prompts usando as ferramentas da barra lateral.

***

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/82b8eb67-82f5-41b1-89d6-341c95a047ed" />

O interessante recurso KV-Cache-Text permite que você veja exatamente o que o Claude vê.

***

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/54cdfa4e-677c-4aed-a5bb-5fd946600c46" />

Você pode fazer upload de imagens e descrever suas necessidades — a compreensão de imagens do Claude é incrivelmente poderosa. E como você sabe, pode colar imagens diretamente com Ctrl+V, e seu conteúdo completo será exibido na conversa.

***

<img height="370" width="600" alt="image" src="https://github.com/user-attachments/assets/87d332ea-3e34-4957-b442-f9d070211fbf" />

Você pode personalizar plugins, gerenciar todos os processos do cc-viewer, e o cc-viewer suporta a alternância a quente para APIs de terceiros (sim, você pode usar GLM, Kimi, MiniMax, Qwen, DeepSeek — embora o autor considere todos eles bastante fracos no momento).

***

<img height="746" width="1500" alt="image" src="https://github.com/user-attachments/assets/b1f60c7c-1438-4ecc-8c64-193d21ee3445" />

Mais recursos esperam para ser descobertos... Por exemplo: o sistema suporta Agent Team e tem um Code Reviewer integrado. A integração do Codex Code Reviewer chegará em breve (o autor recomenda fortemente usar Codex para revisar o código do Claude Code).

## License

MIT
