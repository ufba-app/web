# App instalável (PWA)

O painel (`meu.ufba.app`) pode ser **instalado** no celular e no computador: ganha ícone na tela inicial e abre em tela
cheia, sem a barra do navegador (é o que faz a barra de baixo e a folha do menu parecerem de app nativo). Não é
automático para todo site: o navegador só oferece instalar quando o site declara um manifest, e é o que este documento
descreve.

**Como ler as marcações** (as mesmas do `front-guide.md`)

- **Combinado**: está registrado no código e nos testes.
- **Proposta, revisar com o André**: ainda não existe decisão.

---

## 1. O que existe (service worker só para avisos)

| Peça | Onde | Para quê |
|---|---|---|
| Manifest | `apps/web/public/manifest.webmanifest` | Nome, cores, página inicial, `display: standalone` e os ícones. |
| Ícones | `apps/web/public/icons/` | 192 e 512 (`any`), 512 `maskable` (recorte redondo do Android) e `apple-touch-icon` 180 (iPhone). Fundo branco sólido. |
| Linhas do `<head>` | `index.html` e `shell.html` | Ligam o manifest, o ícone do iPhone e a cor da barra de status (`theme-color`). |
| Tipo do manifest | `Caddyfile` (`@manifest`) | Serve `application/manifest+json`. |
| Gerador | `apps/web/scripts/make-icons.mjs` | Refaz os PNG a partir de `public/brasao.svg` (usa o Chromium do Playwright). |
| Service worker | `apps/web/public/sw.js` | **Só avisos (Web Push).** Eventos `push` (mostra título, texto e tag) e `notificationclick` (abre o endereço do aviso). |

O app de login (`auth.ufba.app`) é outra origem e **não** declara o manifest: o app instalado é só o painel.

O **service worker** (`public/sw.js`) existe **só para os avisos** e é de propósito mínimo. **Combinado:**

- **Sem handler de `fetch`**: ele nunca intercepta navegação nem requisição, e não há cache. O painel mostra dados de
  sessão e acadêmicos, então um cache traria mais risco (dado velho, dado de outra pessoa) que ganho. A API, com o cookie
  de sessão, passa direto pelo navegador, como se o worker não existisse.
- **Só nasce ao ativar os avisos**: o painel registra o worker quando a pessoa clica em "Ativar avisos neste aparelho"
  (Conexões, seção Avisos), nunca na abertura. Quem não ativa nunca tem worker.
- **O aviso só abre caminho deste site** (o `url` do aviso é validado: outra origem ou `javascript:` cai no painel). O
  ícone do aviso é `/icons/icon-192.png` (o sistema não aceita SVG). Aviso nenhum leva dado de paciente: o conteúdo é de
  quem envia.
- **Sem VAPID configurado** na API, `GET /push/config` responde 503 `push_unavailable`: a tela explica que os avisos ainda
  não estão disponíveis e não oferece o botão.

Os navegadores atuais oferecem instalar sem worker. **Proposta, revisar com o André:** se um dia houver offline, começar
por uma página "sem conexão", nunca por cache de resposta da API (e isso muda a regra acima: precisa de decisão).

**iPhone:** o Web Push só existe com o painel **instalado na tela inicial** (iOS 16.4 ou mais novo). Por isso a seção
Avisos mostra a nota de instalar quando o navegador não oferece push no iPhone.

## 2. Como a pessoa instala

| Onde | Como |
|---|---|
| Android (Chrome, Edge) | Menu do navegador, "Instalar app" (ou o aviso que o próprio navegador mostra). Vira um app de verdade (WebAPK). |
| iPhone (Safari) | Compartilhar, "Adicionar à Tela de Início". O site **não** consegue disparar a instalação, só orientar. |
| Computador (Chrome, Edge) | Ícone de instalar na barra de endereço. |
| Firefox | No Android é limitado; no computador não instala. |

**Proposta, revisar com o André:** um botão "Instalar" dentro do painel. No Android/Chrome dá para disparar a
instalação com o evento `beforeinstallprompt`; no iPhone só uma dica ("Compartilhar, Adicionar à Tela de Início"). Não
foi feito: precisa de decisão de onde aparece.

## 3. Como conferir

- **Instalável?** No Chrome, DevTools, aba **Application**, "Manifest": não pode haver erro nem aviso de instalabilidade.
  Pela linha de comando (foi assim que a primeira versão foi verificada), o Chromium responde `Page.getAppManifest` e
  `Page.getInstallabilityErrors` por CDP; as duas listas de erro vêm vazias.
- **Os arquivos:** `apps/web/src/pwa.test.ts` confere o manifest, o tamanho real de cada PNG e as linhas do `<head>`
  nas duas páginas. `apps/web/scripts/check-caddyfile.sh` (roda no CI, com Docker) confere que o manifest e o ícone saem
  sem cookie e com o tipo certo.
- **O service worker:** `apps/web/src/lib/serviceWorker.test.ts` roda o `sw.js` num contexto isolado e confere o `push`, o
  `notificationclick`, o endereço do aviso só deste site e que **não há `fetch`** (nem `caches`). O teste de CSP de
  produção (`e2e-prod/csp.spec.ts`) confere que ele registra sob a CSP, sem cache e sem violação. O aviso aparecendo de
  verdade **não** é testado no CI (o Chromium sem tela nega a permissão de notificação): confira num aparelho.
- **Num celular de verdade:** instalar e abrir. É o único jeito de ver tela cheia, ícone, abertura e os avisos.

## 4. O que mudar junto

- **Trocou a cor do topo** (`--ufba-background`): atualize `theme_color` no manifest e a `theme-color` nos dois HTML (o
  teste obriga as duas a baterem). A `background_color` é a cor da tela de abertura (hoje a do fundo, `#e3e8f6`).
- **Trocou o brasão** (`public/brasao.svg`): rode `node scripts/make-icons.mjs` dentro de `apps/web` e confira os PNG
  (o `icon-192.png` também é o ícone dos avisos, em `public/sw.js`).
- **Mexeu no `public/sw.js`**: não registre `fetch` nem cache (o teste do worker falha). O navegador só troca o worker
  quando o arquivo muda e o servidor o serve sem cache (o `Caddyfile` já dá `no-cache` fora de `/assets/`).
- **Mudou o nome do app**: `name` e `short_name` no manifest (o curto aparece sob o ícone; até 12 caracteres, o teste cobra).

## 5. Pontos de atenção

- **O login é outra origem** (`auth.ufba.app`). O app instalado só "possui" `meu.ufba.app`: ao entrar, o navegador abre
  o login numa aba por cima e, na volta, pode abrir no navegador em vez de no app. No iPhone, o app instalado ainda
  guarda os cookies separados do Safari, então a sessão do Safari pode não valer lá dentro. **Não foi testado num
  aparelho**; é a primeira coisa a validar.
- O cookie marcador (`ufba_signed_in`, `Domain=.ufba.app`) e o redirecionamento do Caddy para o login continuam valendo;
  o manifest e os ícones ficam de fora do redirecionamento (são buscados sem cookie).
- O botão "Abrir o SIGAA" abre outra aba: no app instalado ela abre num visualizador do sistema. Confira num aparelho.
