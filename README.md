# web

Monorepo do front do ufba.app (pnpm workspaces):

```
apps/web            painel (meu.ufba.app) e auth (auth.ufba.app): dois builds do mesmo projeto Vite
packages/web-ui     componentes React (HeroUI v3), @ufba-app/web-ui
packages/tokens     tokens de design, @ufba-app/tokens
apps/docs           site de documentação (docs.ufba.app): Astro + Starlight, conteúdo do memory em tempo de build
apps/landing        landing (ufba.app): Astro estático, zero JS por padrão, Cloudflare Pages (`pnpm dev:landing`, `pnpm build:landing`)
docs/design-system  especificação e planos do design system
```

O design system é consumido por `workspace:*`: sem GitHub Packages e sem token de build. Os caminhos `src/...` e
`docs/...` abaixo são de `apps/web/`.

Front end do ecossistema [ufba.app](https://ufba.app) (o painel fica em `meu.ufba.app`; o `ufba.app` será a landing), em **dois apps** do mesmo repositório (dois builds, dois deploys):

- **Painel** (`meu.ufba.app`, dev :3001): conexões (SIGAA, Moodle, Classroom) e apps autorizados.
- **Auth** (`auth.ufba.app`, dev :3002): login, retorno do login e autorização de clientes OAuth (ex.: Claude).

A API segue em `api.ufba.app` (dev :3000). O código compartilhado (`src/api`, `src/contract`, `src/lib`, `src/forms`,
`src/components`, `styles.css`) é único.

SPA em Vite, React 19, TypeScript e React Router, com os componentes do `@ufba-app/web-ui` (design system).
A sessão é um cookie HttpOnly emitido pela API; o JavaScript do web nunca vê token. A senha do SIGAA vai direto do
navegador para a API.

- Especificação: [docs/superpowers/specs/2026-11-11-web-design.md](docs/superpowers/specs/2026-11-11-web-design.md)
- Contrato com a API: `platform/docs/WEB-API.md`; lacunas e decisões: [docs/contract-gaps.md](docs/contract-gaps.md)

## Rodando

Requer Node 22 e pnpm 11. O design system vem do próprio workspace.

```bash
pnpm install
pnpm build:packages   # gera o dist dos pacotes: uma vez, e sempre que mexer em packages/
pnpm dev          # painel: http://localhost:3001
pnpm dev:auth     # auth:   http://localhost:3002
```

As portas são fixas: o painel é a `WEB_ORIGIN` da API, o auth é a `AUTH_ORIGIN` e o `redirect_uri` do cliente `ufba-web`
é `http://localhost:3002/sign-in/callback` (o login começa e termina no auth). A API local precisa subir com
`AUTH_ORIGIN=http://localhost:3002`. A API roda em `http://localhost:3000` (`VITE_API_URL`, ver `.env.example`).
Painel, auth e API precisam estar no mesmo site; nunca teste o login em `*.up.railway.app`.

As origens do painel e do auth são **fixas no build** (`VITE_PANEL_ORIGIN`, `VITE_AUTH_ORIGIN`, ver `src/lib/origins.ts`):
em dev têm padrão; em build de produção são obrigatórias. O destino depois do login é só caminho relativo validado.

## Testes

```bash
pnpm typecheck
pnpm test         # Vitest (jsdom), Testing Library, MSW e axe
pnpm e2e          # Playwright do painel: API simulada e, em e2e/real-api.spec.ts, API real em :3000 (com o auth de pé)
pnpm exec playwright test -c playwright.prod.config.ts   # CSP de produção do painel, contra o build (porta 3001 livre)
pnpm e2e:auth       # Playwright do auth (:3002), API e painel simulados
pnpm e2e:auth:real  # auth contra a API real (precisa da API com AUTH_ORIGIN)
pnpm e2e:auth:prod  # CSP de produção do auth (lê o Caddyfile.auth; porta 3002 livre)
pnpm mutation     # Stryker em src/auth, src/api e src/lib/safe.ts
```

O login de verdade passa pelo Google e não é testado automaticamente.

## Estrutura

```
src/contract/    schemas zod do contrato, tipos e dados de exemplo para teste
src/api/         cliente fetch (cookie, CSRF, validação) e um módulo por recurso
src/auth/        PKCE, login e destino pós-login (usado pelo auth)
src/routes/      uma página por rota (painel e auth)
src/AuthApp.tsx  rotas do auth (entrada: auth.html + src/auth-main.tsx)
src/components/  composição dos componentes do web-ui
```

Nomes de código em inglês; só o texto que a pessoa lê é pt-BR.

## Publicação

Cada app tem o seu par: `Dockerfile` + `Caddyfile` (painel, saída `dist/`) e `Dockerfile.auth` + `Caddyfile.auth` (auth,
saída `dist-auth/`, `pnpm build:auth`; as duas origens são argumentos de build). Headers, CSP e fallback das rotas estão no repo, mas **ainda não foram testados** e o
`package.json` precisa trocar o link local do design system por versões publicadas antes do build em container.
Nada é criado nem alterado no Railway por este repo; quem sobe é o André.

## Memória compartilhada

A memória compartilhada do time é https://memory.ufba.app (workspace `ufba-app`, projeto com o nome do repo: `web`). O `.mcp.json` da raiz já aponta o MCP `ai-memory` para ela; para usar, defina `AI_MEMORY_KEY` com a sua chave `aim_` (gerada em https://memory.ufba.app/manage). A chave nunca vai para o repositório.
