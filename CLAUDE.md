# ufba.app web

Monorepo pnpm do front. `apps/docs` é o site de documentação (ver apps/docs/README.md; conteúdo vem do memory no build, nunca vai para o git). `apps/web` é o painel e o auth (dois builds do mesmo projeto Vite); `packages/web-ui` e
`packages/tokens` são o design system (workspace, sem registry: `@ufba-app/*` é `workspace:*`). Os caminhos `src/...`
abaixo são de `apps/web/src/...`. Na raiz: `pnpm install && pnpm build:packages` (o web consome o `dist` dos pacotes),
depois `pnpm dev` / `pnpm dev:auth`. Comandos do app (`size`, `e2e*`, `mutation`) rodam dentro de `apps/web`.

Front end do ecossistema ufba.app (Vite, React 19, TypeScript, React Router, TanStack Query, `zod/mini`, design system `@ufba-app/web-ui`).

## Regras de trabalho

- **Sem commit nem push** até o André pedir. Nada de criar ou alterar coisas no Railway.
- **Nomes de código em inglês** (identificadores, rotas, chaves JSON). Só o texto da tela fica em pt-BR.
- **Roda na porta 3001** (é o `WEB_ORIGIN` da API). Nunca testar login em `*.up.railway.app`.
- **A senha do SIGAA** vai direto do navegador para a API, nunca por proxy ou servidor do web.
- **Não invente endpoints** nem formato de erro: o contrato é `platform/docs/WEB-API.md`. Dúvida: perguntar ao backend.
- **Combine antes de criar** algo visual ou de arquitetura que o André não pediu. Desenho vem do canvas do André.

## Avisos de evento

- Evento (conectou, desconectou, falhou) é **toast**: `notify.success/info/error` de `src/lib/notify.ts`. Nunca uma caixa
  que aparece no meio da página. Inline só o que é estado ou parte de formulário (erro de campo, erro dentro do
  diálogo, falha ao carregar com "Tentar de novo"). Conferir o contraste numa captura de tela.
- O `ToastHost` entra uma vez por app. Nos testes de unidade o `notify` é simulado (`src/test/setup.ts`); o toast de
  verdade é testado no navegador.

## Formulários

- `react-hook-form` com `@hookform/resolvers` (`zodResolver`) e schema `zod/mini`. Sem `useState` por campo.
- Mensagens de validação em pt-BR, no schema. Senha do SIGAA: `reset()` ao enviar, nunca `reportInput`, nunca em log,
  URL ou mensagem de erro.

## Carregamento e desempenho (em toda mudança)

- Carregamento é **skeleton** com a forma do conteúdo final. Sem tela de carregamento nem spinner de página.
- **Página nova** entra em `src/routes/lazy.tsx`. **Diálogo ou componente pesado** só depois de clique: `lazy`.
- **Rota nova do painel** (dentro do `AppLayout`): também em `src/lib/panelPaths.ts` e na regra `@panel` do Caddyfile
  (o flash antes do JS depende disso; o teste falha se divergirem).
- **Skeleton** precisa contrastar com o fundo onde está (paleta azul no conteúdo, cinza em superfícies brancas:
  classe `web-sk-onwhite`). Conferir numa captura de tela.
- **Dependência nova:** conferir o tamanho e preferir a versão tree-shakable.
- Ao mexer em rotas, dependências ou estilos globais: `pnpm build && pnpm size`. Passou do teto? Não suba o teto
  sozinho: reduza ou pergunte. Detalhes e números em `docs/performance.md`.

## Dois apps: painel e auth

- **Painel** (`ufba.app`, dev `:3001`, `vite.config.ts`): tudo dentro do `AppLayout`. **Auth** (`auth.ufba.app`, dev
  `:3002`, `vite.auth.config.ts`, `pnpm dev:auth`): `/sign-in`, `/sign-in/callback`, `/authorize*`.
- O painel manda quem está sem sessão (e quem clica em Sair) para `authUrl('/sign-in?return=…')`. O destino é só caminho
  relativo; as origens são fixas no build (`VITE_AUTH_ORIGIN`, `VITE_PANEL_ORIGIN`), nunca vêm da URL.
- Build de produção do painel exige `VITE_AUTH_ORIGIN` (sem padrão). Localmente o `.env.production.local` (fora do git)
  traz as de desenvolvimento. O auth tem `pnpm build:auth` e `pnpm size:auth`.
- Login e autorização não voltam para o painel. Página nova de auth vai em `src/auth/lazy.tsx`.

## Antes de dizer que terminou

`pnpm typecheck`, `pnpm test`, e `pnpm e2e` quando tocar nas telas. Contrato: `src/contract` é à mão e `openapi.contract.test.ts` o compara com `src/contract/openapi.json` (cópia da API); `pnpm contract:update` (em `apps/web`) traz a versão atual. CSP de produção: `pnpm exec playwright test -c playwright.prod.config.ts`
(precisa da porta 3001 livre).

## Ambiente

O Node não está no PATH desta máquina (instalação do winget em
`%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.22_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v22.23.2-win-x64`).
