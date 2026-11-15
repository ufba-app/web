# ufba.app web

Monorepo pnpm do front do ecossistema ufba.app. `apps/web` é o painel (`meu.ufba.app`, dev `:3001`) e o auth
(`auth.ufba.app`, dev `:3002`): dois builds do mesmo projeto Vite (React 19, TypeScript, React Router, TanStack Query,
`zod/mini`). `apps/docs` (docs.ufba.app; conteúdo vem do memory no build, nunca vai para o git) e `apps/landing` (ufba.app) são Astro estático; os textos da landing que mudam muito (perguntas da faixa, confiança, segurança, FAQ, etapas) ficam em `apps/landing/src/content/textos.json`. `packages/web-ui` e
`packages/tokens` são o design system (`@ufba-app/*` é `workspace:*`). Os caminhos `src/...` abaixo são de
`apps/web/src/...`.

**O guia completo está em [`docs/front-guide.md`](docs/front-guide.md)** (stack e porquês, padrão de escrita, testes,
acessibilidade, Astro, fluxo). Números de desempenho: [`apps/web/docs/performance.md`](apps/web/docs/performance.md).
Este arquivo guarda só o que **não se negocia**.

Na raiz: `pnpm install && pnpm build:packages` (o web consome o `dist` dos pacotes), depois `pnpm dev` / `pnpm dev:auth`
(e `pnpm dev:landing`). Comandos do app (`size`, `e2e*`, `mutation`) rodam dentro de `apps/web`.

## Regras de trabalho

- **Commit só em branch. Push, PR e merge só com o OK do André** (ou do orquestrador). Nunca force push nem amend sem
  pedir. **Nada no Railway** (criar, variável, redeploy) sem o André.
- **Nomes de código em inglês** (identificadores, rotas, chaves JSON, arquivos). Só o texto da tela fica em pt-BR.
- **Combine antes de criar** algo visual ou de arquitetura que o André não pediu. Desenho vem do canvas dele.
- **Mudança pequena e direta quando ele testa ao vivo**; sem reestruturar. Se ele pedir "volte como estava", **reverta
  exatamente** o que foi feito.
- **Verifique de verdade antes de dizer que terminou** e diga com franqueza o que não foi verificado (Docker, Caddy,
  login real, deploy). Só ler ou revisar arquivo não é "testado".
- **Não invente endpoints** nem formato de erro: o contrato é `src/contract/openapi.json` (cópia da API) e
  `platform/docs/WEB-API.md`. Dúvida: perguntar ao backend.
- **A senha do SIGAA** vai direto do navegador para a API, nunca por proxy ou servidor do web, nem em log, URL ou erro.
  **O CPF nunca aparece inteiro na tela** (só os 2 últimos dígitos; `formatStoredCpf`).
- Roda na porta **3001** (é o `WEB_ORIGIN` da API). Nunca testar login em `*.up.railway.app`.

## Tela

- **Evento** (conectou, desconectou, falhou) é **toast**: `notify.success/info/error` de `src/lib/notify.ts`. Inline só
  estado ou formulário (erro de campo, erro no diálogo, falha ao carregar com "Tentar de novo"). Nos testes de unidade o
  `notify` é simulado; o toast de verdade é testado no navegador.
- **Formulários**: `react-hook-form` + `zodResolver` + schema `zod/mini`; sem `useState` por campo; mensagens de
  validação em pt-BR no schema; senha do SIGAA com `reset()` ao enviar e nunca `reportInput`.
- **Carregamento é skeleton** com a forma do conteúdo final; sem tela de carregamento nem spinner de página. Skeleton
  contrasta com o fundo (classe `web-sk-onwhite` em superfície branca). Conferir numa captura de tela.

## Desempenho (em toda mudança)

- **Página nova** em `src/routes/lazy.tsx` (auth: `src/auth/lazy.tsx`); diálogo ou componente pesado só depois do clique,
  com `lazy`. **Dependência nova**: conferir o tamanho, preferir a versão tree-shakable.
- **Rota nova do painel** também em `src/lib/panelPaths.ts` e na regra `@panel` do `Caddyfile` (o teste falha se divergirem).
- Mexeu em rotas, dependências ou estilos globais: `pnpm build && pnpm size` (e `build:auth` + `size:auth`). Passou do
  teto? **Não suba o teto sozinho**: reduza ou pergunte.

## Dois apps: painel e auth

- Sem sessão, o painel manda para `authUrl('/sign-in?return=…')`; o destino é só caminho relativo. As origens são fixas
  no build (`VITE_PANEL_ORIGIN`, `VITE_AUTH_ORIGIN`, `VITE_API_URL`), **nunca** vêm da URL nem ficam escritas no código.
  Build de produção do painel exige `VITE_AUTH_ORIGIN`; a imagem Docker exige também `VITE_PANEL_ORIGIN` (hoje
  `https://meu.ufba.app`). Localmente o `.env.production.local` (fora do git) traz as de desenvolvimento.
- **CSP estrita** (Caddyfile e Caddyfile.auth): sem `unsafe-inline`, sem `unsafe-eval`; as CSPs só citam a API.
  `src/zodConfig.ts` (`jitless`) é o primeiro import de cada entrada.
- **Caddyfile do painel**: `/healthz` responde 200 (é o healthcheck do Railway; `/` dá 302 sem cookie). Rota do painel
  sem o cookie marcador `ufba_signed_in=1` vai para o login com 302 (o marcador é só dica; o `GET /me` decide; o cookie
  de sessão `__Host-ufba_session` nunca chega ao painel). `Host ufba.app` recebe 301 para o painel (temporário). Regra
  nova que deva responder direto vai num `handle` antes do geral: o `try_files` reescreve o caminho.
- **Liberar o SIGAA com o celular (passkey + QR)**: a **DK é segredo** (nunca em log, URL, erro, `localStorage`, `useMutation`/
  `useQuery` nem teste que a imprima; é zerada com `fill(0)` depois do uso). A criptografia fica em `src/lib/passkey`; o
  PRF nunca sai do celular. `/pair` (a página que o celular abre pelo QR) fica **fora** de `panelPaths` e da regra `@panel`
  do Caddy de propósito: o servidor não pode redirecionar quem chega sem login, senão a chave do QR (só no fragmento `#…`)
  se perde. A oferta de ativar só aparece em quem "parece celular" (`looksLikePhone`); o app de auth importa só
  `components/passkey/lazyUnlock.tsx` (importar `lazyPasskey` traz o `Dialog` e estoura o teto do `size:auth`).
- Login e autorização não voltam para o painel. O auth tem `pnpm build:auth` e `pnpm size:auth`.

## Antes de dizer que terminou

`pnpm typecheck` e `pnpm test`; `pnpm e2e` (e `pnpm e2e:auth`) quando tocar nas telas. CSP de produção:
`pnpm exec playwright test -c playwright.prod.config.ts` e `pnpm e2e:auth:prod` (portas 3001 e 3002 livres).
Contrato: `src/contract` é à mão e `openapi.contract.test.ts` o compara com `src/contract/openapi.json`;
`pnpm contract:update` (em `apps/web`) traz a versão atual. O CI (`ci`) roda tudo isso, menos o Playwright e o Stryker.
Quais testes rodar para cada tipo de mudança: seção 4 do guia.

## Ambiente

O Node não está no PATH desta máquina (instalação do winget em
`%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.22_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v22.23.2-win-x64`);
use PowerShell e prefixe o PATH da sessão.
