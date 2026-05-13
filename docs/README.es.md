# CC-Viewer

Un kit de herramientas de Vibe Coding destilado de la propia experiencia de desarrollo, construido sobre Claude Code:

1. Aumentar el límite de capacidad: ejecute /ultraPlan y /ultraReview localmente, para que el código de su proyecto nunca tenga que estar completamente expuesto a la nube de Claude;
2. Compatibilidad multiplataforma: permite la programación móvil (dentro de la LAN); la versión web se adapta a diversos escenarios, fácil de incrustar en extensiones del navegador y vistas divididas del sistema operativo, y proporciona un instalador nativo;
3. Registro completo: ofrece capacidades completas de interceptación y análisis del payload de Claude Code, ideal para registro, análisis de problemas, aprendizaje, inspiración e ingeniería inversa;
4. Aprendizaje y experiencia compartidos: se han acumulado numerosos materiales de estudio y experiencias de desarrollo (vea los iconos "?" en todo el sistema);
5. Experiencia nativa preservada: solo amplía las capacidades de Claude Code, sin modificaciones sustanciales al núcleo, manteniendo la experiencia nativa;
6. Soporta modelos de terceros: compatible con deepseek-v4-\*, GLM 5.1, Kimi K2.6, con la capacidad cc-switch incorporada para conmutar en caliente entre herramientas de terceros en cualquier momento.

[English](../README.md) | [简体中文](./README.zh.md) | [繁體中文](./README.zh-TW.md) | [한국어](./README.ko.md) | [日本語](./README.ja.md) | [Deutsch](./README.de.md) | Español | [Français](./README.fr.md) | [Italiano](./README.it.md) | [Dansk](./README.da.md) | [Polski](./README.pl.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md) | [Norsk](./README.no.md) | [Português (Brasil)](./README.pt-BR.md) | [ไทย](./README.th.md) | [Türkçe](./README.tr.md) | [Українська](./README.uk.md)

## Uso

### Requisitos previos

* Asegúrese de tener Node.js 20.0.0+ instalado; [Descargar e instalar](https://nodejs.org)
* Asegúrese de tener Claude Code instalado; [Tutorial de instalación](https://github.com/anthropics/claude-code)

### Instalar ccv

#### Instalación con npm

```bash
npm install -g cc-viewer --registry=https://registry.npmjs.org
```

#### Instalación con Homebrew (recomendado para macOS / Linux)

```bash
brew tap weiesky/cc-viewer
brew install cc-viewer
brew upgrade cc-viewer   # para actualizaciones — no use npm install -g con instalaciones brew
```

### Lanzamiento

ccv es un reemplazo directo para claude — todos los argumentos se pasan a claude al mismo tiempo que se lanza el Web Viewer.

```bash
ccv                    # == claude (modo interactivo)
```

El comando que el propio autor usa con más frecuencia es:

```
ccv -c --d             # == claude --continue --dangerously-skip-permissions
                       # ccv pasa todos los parámetros de inicio de Claude Code — puede combinarlos como desee
```

Después de iniciar en modo programación, se abrirá automáticamente una página web.

cc-viewer también se distribuye como aplicación de escritorio nativa: [Página de descarga](https://github.com/weiesky/cc-viewer/releases)

### Modo Logger

Si aún prefiere la herramienta nativa claude o la extensión de VS Code, use este modo.

En este modo, al iniciar `claude`

se iniciará automáticamente un proceso de registro que guarda los registros de solicitudes en \~/.claude/cc-viewer/*yourproject*/date.jsonl

Habilitar el modo logger:

```bash
ccv -logger
```

Cuando la consola no puede imprimir el puerto específico, el primer puerto predeterminado es 127.0.0.1:7008. Las instancias múltiples usan puertos secuenciales como 7009, 7010.

Desinstalar el modo logger:

```bash
ccv --uninstall
```

### Solución de problemas (Troubleshooting)

Si encuentra problemas al iniciar cc-viewer, aquí está el enfoque definitivo para la solución de problemas:
Paso 1: Abra Claude Code en cualquier directorio.
Paso 2: Dé a Claude Code la siguiente instrucción:

```
He instalado el paquete npm cc-viewer, pero al ejecutar ccv aún no funciona correctamente. Revise cli.js y findcc.js de cc-viewer y adáptelos al despliegue local de Claude Code según el entorno específico. Mantenga el alcance de los cambios lo más restringido posible dentro de findcc.js.
```

¡Dejar que Claude Code diagnostique el problema por sí mismo es más efectivo que preguntar a nadie o leer cualquier documentación!

Una vez completada la instrucción anterior, se actualizará findcc.js. Si su proyecto requiere frecuentemente despliegue local, o si el código forkeado a menudo necesita resolver problemas de instalación, mantener este archivo le permite simplemente copiarlo la próxima vez. En este momento, muchos proyectos y empresas que usan Claude Code no están desplegando en Mac sino en entornos alojados del lado del servidor, por lo que el autor ha separado el archivo findcc.js para facilitar el seguimiento de las actualizaciones del código fuente de cc-viewer en el futuro.

Nota: Esta aplicación entra en conflicto con claude-code-switch y claude-code-router debido a la competencia de proxy, por lo que al usarla asegúrese de cerrar claude-code-switch y claude-code-router. cc-viewer incluye una capacidad de actualización en caliente de proxy como reemplazo equivalente.

### Otros comandos auxiliares

Consulte:

```bash
ccv -h
```

### Modo silencioso (Silent Mode)

Por defecto, `ccv` se ejecuta en modo silencioso cuando envuelve `claude`, manteniendo la salida del terminal limpia y consistente con la experiencia nativa. Todos los registros se capturan en segundo plano y se pueden ver en `http://localhost:7008`.

Una vez configurado, use el comando `claude` normalmente. Visite `http://localhost:7008` para acceder a la interfaz de monitoreo.

## Características

### Modo Programación

Después de iniciar con ccv, puede ver:

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/ab353a2b-f101-409d-a28c-6a4e41571ea2" />

Puede ver las diferencias de código directamente después de editar:

<img height="728" width="1500" alt="image" src="https://github.com/user-attachments/assets/2a4acdaa-fc5f-4dc0-9e5f-f3273f0849b2" />

Aunque puede abrir archivos y codificar manualmente, no se recomienda la codificación manual — ¡eso es programación anticuada!

### Programación móvil

Incluso puede escanear un código QR para programar desde su dispositivo móvil:

<img height="1460" width="3018" alt="image" src="https://github.com/user-attachments/assets/8debf48e-daec-420c-b37a-609f8b81cd20" />

<img height="790" width="1700" alt="image" src="https://github.com/user-attachments/assets/da3e519f-ff66-4cd2-81d1-f4e131215f6c" />

Cumpla su imaginación sobre la programación móvil. También hay un mecanismo de plugins — si necesita personalizar para sus hábitos de codificación, esté atento a las actualizaciones de los hooks de plugins.

### Modo Logger (Ver sesiones completas de Claude Code)

<img height="768" width="1500" alt="image" src="https://github.com/user-attachments/assets/a8a9f3f7-d876-4f6b-a64d-f323a05c4d21" />

* Captura todas las solicitudes API de Claude Code en tiempo real, asegurando texto sin procesar — no registros censurados (¡¡¡esto es importante!!!)
* Identifica y etiqueta automáticamente las solicitudes de Main Agent y Sub Agent (subtipos: Plan, Search, Bash)
* Las solicitudes de MainAgent admiten Body Diff JSON, mostrando diferencias plegadas respecto a la solicitud anterior de MainAgent (solo campos modificados/nuevos)
* Cada solicitud muestra estadísticas de uso de Token en línea (Tokens de entrada/salida, creación/lectura de caché, tasa de aciertos)
* Compatible con Claude Code Router (CCR) y otros escenarios de proxy — recurre al patrón de ruta API

### Modo Conversación

Haga clic en el botón «Modo Conversación» en la esquina superior derecha para analizar el historial completo de conversaciones del Main Agent en una interfaz de chat:

<img height="764" width="1500" alt="image" src="https://github.com/user-attachments/assets/725b57c8-6128-4225-b157-7dba2738b1c6" />

* La visualización de Agent Team aún no es compatible
* Los mensajes del usuario están alineados a la derecha (burbujas azules), las respuestas del Main Agent están alineadas a la izquierda (burbujas oscuras)
* Los bloques `thinking` están plegados por defecto, renderizados como Markdown — haga clic para expandir y ver el proceso de pensamiento; se admite la traducción con un clic (la función aún es inestable)
* Los mensajes de selección del usuario (AskUserQuestion) se muestran en formato de preguntas y respuestas
* Sincronización bidireccional de modos: cambiar al modo de conversación desplaza automáticamente a la conversación correspondiente a la solicitud seleccionada; volver al modo de texto original desplaza automáticamente a la solicitud seleccionada
* Panel de configuración: alternar el estado de plegado predeterminado para los resultados de herramientas y bloques thinking
* Navegación móvil de conversaciones: en el modo móvil de CLI, toque el botón «Navegación de conversaciones» en la barra superior para deslizar una vista de conversación de solo lectura y navegar por el historial completo de conversaciones en móvil

### Gestión de registros

A través del menú desplegable CC-Viewer en la esquina superior izquierda:

<img height="760" width="1500" alt="image" src="https://github.com/user-attachments/assets/33295e2b-f2e0-4968-a6f1-6f3d1404454e" />

**Compresión de registros**
Con respecto a los registros, el autor quiere aclarar que las definiciones oficiales de Anthropic no han sido modificadas, asegurando la integridad del registro.
Sin embargo, dado que las entradas individuales de registro del modelo 1M Opus pueden llegar a ser extremadamente grandes en etapas posteriores, gracias a ciertas optimizaciones de registro para MainAgent, se logra al menos un 66% de reducción de tamaño sin gzip.
El método de análisis para estos registros comprimidos se puede extraer del repositorio actual.

### Más funciones útiles

<img height="767" width="1500" alt="image" src="https://github.com/user-attachments/assets/add558c5-9c4d-468a-ac6f-d8d64759fdbd" />

Puede localizar rápidamente sus prompts usando las herramientas de la barra lateral.

***

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/82b8eb67-82f5-41b1-89d6-341c95a047ed" />

La interesante función KV-Cache-Text le permite ver exactamente lo que ve Claude.

***

<img height="765" width="1500" alt="image" src="https://github.com/user-attachments/assets/54cdfa4e-677c-4aed-a5bb-5fd946600c46" />

Puede cargar imágenes y describir sus necesidades — la comprensión de imágenes de Claude es increíblemente poderosa. Y como sabe, puede pegar imágenes directamente con Ctrl+V, y su contenido completo se mostrará en la conversación.

***

<img height="370" width="600" alt="image" src="https://github.com/user-attachments/assets/87d332ea-3e34-4957-b442-f9d070211fbf" />

Puede personalizar plugins, gestionar todos los procesos de cc-viewer, y cc-viewer admite el cambio en caliente a APIs de terceros (sí, puede usar GLM, Kimi, MiniMax, Qwen, DeepSeek — aunque el autor los considera a todos bastante débiles en este momento).

***

<img height="746" width="1500" alt="image" src="https://github.com/user-attachments/assets/b1f60c7c-1438-4ecc-8c64-193d21ee3445" />

Más funciones esperan ser descubiertas... Por ejemplo: el sistema admite Agent Team, y tiene un Code Reviewer integrado. La integración de Codex Code Reviewer llegará pronto (el autor recomienda encarecidamente usar Codex para revisar el código de Claude Code).

## License

MIT
