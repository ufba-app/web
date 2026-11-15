# App instalável (PWA)

O painel (`meu.ufba.app`) pode ser **instalado** no celular e no computador: ganha ícone na tela inicial e abre em tela
cheia, sem a barra do navegador (é o que faz a barra de baixo e a folha do menu parecerem de app nativo). Não é
automático para todo site: o navegador só oferece instalar quando o site declara um manifest, e é o que este documento
descreve.

**Como ler as marcações** (as mesmas do `front-guide.md`)

- **Combinado**: está registrado no código e nos testes.
- **Proposta, revisar com o André**: ainda não existe decisão.

---

## 1. O que existe (primeira versão, sem service worker)

| Peça | Onde | Para quê |
|---|---|---|
| Manifest | `apps/web/public/manifest.webmanifest` | Nome, cores, página inicial, `display: standalone` e os ícones. |
| Ícones | `apps/web/public/icons/` | 192 e 512 (`any`), 512 `maskable` (recorte redondo do Android) e `apple-touch-icon` 180 (iPhone). Fundo branco sólido. |
| Linhas do `<head>` | `index.html` e `shell.html` | Ligam o manifest, o ícone do iPhone e a cor da barra de status (`theme-color`). |
| Tipo do manifest | `Caddyfile` (`@manifest`) | Serve `application/manifest+json`. |
| Gerador | `apps/web/scripts/make-icons.mjs` | Refaz os PNG a partir de `public/brasao.svg` (usa o Chromium do Playwright). |

O app de login (`auth.ufba.app`) é outra origem e **não** declara o manifest: o app instalado é só o painel.

Não há **service worker** de propósito: ele só serviria para funcionar offline, e o painel mostra dados de sessão e
acadêmicos, então um cache agressivo traria mais risco (dado velho, dado de outra pessoa) que ganho. Os navegadores
atuais oferecem instalar sem ele. **Proposta, revisar com o André:** se um dia houver offline, começar por uma página
"sem conexão", nunca por cache de resposta da API.

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
- **Num celular de verdade:** instalar e abrir. É o único jeito de ver tela cheia, ícone e abertura.

## 4. O que mudar junto

- **Trocou a cor do topo** (`--ufba-background`): atualize `theme_color` no manifest e a `theme-color` nos dois HTML (o
  teste obriga as duas a baterem). A `background_color` é a cor da tela de abertura (hoje a do fundo, `#e3e8f6`).
- **Trocou o brasão** (`public/brasao.svg`): rode `node scripts/make-icons.mjs` dentro de `apps/web` e confira os PNG.
- **Mudou o nome do app**: `name` e `short_name` no manifest (o curto aparece sob o ícone; até 12 caracteres, o teste cobra).

## 5. Pontos de atenção

- **O login é outra origem** (`auth.ufba.app`). O app instalado só "possui" `meu.ufba.app`: ao entrar, o navegador abre
  o login numa aba por cima e, na volta, pode abrir no navegador em vez de no app. No iPhone, o app instalado ainda
  guarda os cookies separados do Safari, então a sessão do Safari pode não valer lá dentro. **Não foi testado num
  aparelho**; é a primeira coisa a validar.
- O cookie marcador (`ufba_signed_in`, `Domain=.ufba.app`) e o redirecionamento do Caddy para o login continuam valendo;
  o manifest e os ícones ficam de fora do redirecionamento (são buscados sem cookie).
- O botão "Abrir o SIGAA" abre outra aba: no app instalado ela abre num visualizador do sistema. Confira num aparelho.
