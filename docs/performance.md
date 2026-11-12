# Desempenho da primeira carga

Meta: o web carrega e navega com a sensação de um app profissional (Notion como referência). Não usamos SSR (app
autenticado, cookie HttpOnly da API, CSP estrita, hospedagem estática). O que dá a sensação de rápido é: JS inicial
pequeno, moldura na hora, skeleton só onde há dado, código por rota e pré-carregamento.

## Medido em 2026-11-12 (gzip)

| | Antes | Depois | Teto (`pnpm size`) |
|---|---|---|---|
| JS da primeira carga | 177,6 kB | **153,3 kB** | 165 kB |
| CSS | 47,3 kB | 46,0 kB | 50 kB |
| Fontes pré-carregadas | (não havia) | 38,6 kB | 45 kB |
| Total | ~290 kB | **238,4 kB** | 255 kB |

O código das páginas é só ~3% do bundle. O peso está em bibliotecas que toda rota usa (`react-dom`, `react-aria`,
`react-router`, `@tanstack/query-core`), então a divisão por rota ajuda pouco hoje. Ela vale como regra para as páginas
futuras, que serão maiores.

## O que foi feito

- **`zod/mini`** (API funcional, tree-shakable) no lugar de `zod`. Schemas em `src/contract/`. Continua com
  `jitless` (a CSP proíbe `eval`); `src/zodConfig.ts` é o primeiro import de `main.tsx`.
- **Páginas por rota** com `React.lazy`: as do painel em `src/routes/lazy.tsx`, as do auth em `src/auth/lazy.tsx`.
  No auth ficam de fora só `SignInPage` e `SignInCallbackPage` (caminho do login). O fallback é skeleton
  (`src/components/Skeletons.tsx`), nunca spinner.
- **Pré-carregamento na intenção:** passar o mouse ou focar num item do menu baixa a página (`preloadRoute`).
- **Diálogos sob demanda** (`src/components/lazyDialogs.tsx`): SIGAA, Moodle e Desconectar saem da primeira carga e
  são baixados quando o navegador está ocioso. Só montam depois da primeira abertura.
- **Fontes:** `preload` das três mais usadas (Plus Jakarta 500 e 700, Sora 800, só latim), injetado no build por um
  plugin em `vite.config.ts` (o nome tem hash).
- **Tela de espera** antes do JS, **por grupo de rota** (sem JavaScript, o servidor escolhe o HTML):
  - **Painel** (`/`, `/schedule`, `/deadlines`, `/grades`, `/connections*`, `/authorized-apps*`): `shell.html`, com a
    moldura do `AppLayout` (classes do design system), a marca, 4 barras no lugar do menu e uma barra no lugar do
    título. É genérico de propósito: sem rótulos, sem item destacado, sem rodapé, para não ficar desatualizado quando o
    menu mudar.
  - **Resto do painel** (erros, 404): `index.html`, só o brasão, com `public/boot.css` (desenho do canvas).
  - **Auth** (app à parte, ver a seção abaixo): `auth.html`, só o brasão, com o mesmo `boot.css`; sem shell do painel.
  - Quem escolhe é o Caddy (regra `@panel` no Caddyfile); no `vite dev` e no `vite preview`, o plugin `panelShell` em
    `vite.config.ts` faz o mesmo. A lista de rotas fica em `src/lib/panelPaths.ts`.
  - O React troca o conteúdo da `#root` ao montar. Nada de `style=` nem script inline nesses HTMLs (a CSP não deixa).
  - **Rota nova no painel** (dentro do `AppLayout`): entra em `src/lib/panelPaths.ts` **e** na regra `@panel` do
    Caddyfile. `panelPaths.test.ts` falha se os dois divergirem; `e2e-prod/csp.spec.ts` confere o flash sem JavaScript.
- **Cache:** arquivos com hash em `/assets` são `immutable` (Caddyfile); compressão `zstd gzip`.

## Regras de trabalho (valem em toda mudança)

1. **Página nova** entra em `src/routes/lazy.tsx` (painel; e em `loaderByPath`, se estiver no menu) ou em
   `src/auth/lazy.tsx` (auth).
2. **Diálogo ou componente pesado que só aparece depois de um clique** carrega com `lazy` (`lazyDialogs.tsx`).
3. **Dependência nova:** antes de adicionar, ver o tamanho (bundlephobia ou `pnpm build`) e preferir a versão
   tree-shakable. Nada de importar a biblioteca inteira para usar um pedaço.
4. **Carregamento é skeleton** com a forma do conteúdo final, nunca tela de carregamento ou spinner de página.
5. **Antes de dizer que terminou** uma mudança que toque rotas, dependências ou estilos globais: `pnpm build && pnpm size`.
   Se passar do teto, não suba o teto sozinho: reduza ou pergunte ao André.
6. Teto novo só com decisão do André, anotando aqui o que entrou e por quê.

## App de autenticação (auth.ufba.app)

Segundo app do mesmo repositório: entrada `auth.html` (+ `src/auth-main.tsx`, `src/AuthApp.tsx`), config
`vite.auth.config.ts`, saída `dist-auth/`, `Caddyfile.auth` e `Dockerfile.auth` próprios. Rotas: `/sign-in`,
`/sign-in/callback`, `/authorize`, `/authorize/error` e 404. Sem shell do painel: a tela de espera é só o brasão
(`auth.html` + `public/boot.css`). O Caddy devolve `auth.html` em qualquer caminho sem arquivo.

- Subir: `pnpm dev:auth` (porta 3002, estrita). Build: `VITE_PANEL_ORIGIN=… VITE_AUTH_ORIGIN=… pnpm build:auth`
  (o build falha sem as duas origens). Medir: `pnpm build:auth && pnpm size:auth`.
- Páginas do auth com `React.lazy` em `src/auth/lazy.tsx` (e não em `src/routes/lazy.tsx`, para o build do auth não
  carregar chunks do painel). SignIn e SignInCallback ficam no bundle de entrada.
- Medido em 2026-11-12 (gzip): JS 127,9 kB · CSS 46,1 kB · fontes 38,6 kB · total 213,2 kB. Tetos (`pnpm size:auth`,
  ~8% acima): JS 138 · CSS 50 · fontes 42 · total 230. Subir teto é decisão do André.
- CSP própria no `Caddyfile.auth` (sem `unsafe-inline`/`unsafe-eval`; `connect-src` e `img-src` só `'self'` + API; sem
  `data:`). Testes: `pnpm e2e:auth` (API e painel simulados) e `pnpm e2e:auth:prod` (CSP lida do Caddyfile.auth).
- Origens fixas no build (`src/lib/origins.ts`): destino pós-login só por `resolveDestination` (`src/auth/destination.ts`).

## Próximos cortes possíveis (não feitos)

- `index-*.js` (77 kB) concentra `react-router`, `react-aria` e `@heroui`. Se o design system passar a expor
  importações mais finas, dá para tirar daqui o que a tela de login não usa.
- `client-*.js` (14 kB) e `hooks-*.js` (8 kB) são o cliente da API e o `@tanstack/query-core`.
