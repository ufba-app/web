# Guia de engenharia do front

Como escrevemos e testamos o front do ufba.app (painel, auth, docs e landing). O `CLAUDE.md` da raiz tem só as regras
inegociáveis e aponta para cá; aqui está o porquê e o jeito de fazer.

**Como ler as marcações**

- **Decisão do André**: foi dita por ele (data e contexto entre parênteses). Não se reabre sem ele.
- **Combinado**: vem de uma decisão registrada no código, no handoff ou nos docs do repo.
- **Proposta, revisar com o André**: ainda não existe decisão. Está escrito como sugestão para ele aceitar, ajustar ou
  recusar. Nada marcado assim vale como regra.

Fontes: o código, o `CLAUDE.md`, `apps/web/docs/performance.md`, `apps/web/docs/contract-gaps.md`, o handoff do front e a
conversa do agente anterior com o André (12/11/2026), onde as ferramentas foram escolhidas.

---

## 1. Mapa do repositório

```
apps/web       painel (meu.ufba.app, dev :3001) e auth (auth.ufba.app, dev :3002): um projeto Vite, dois builds
apps/docs      docs.ufba.app: Astro + Starlight, conteúdo do memory no build
apps/landing   ufba.app: Astro estático, Cloudflare Pages
packages/web-ui    componentes React sobre HeroUI v3 (@ufba-app/web-ui)
packages/tokens    cores, fontes e raios (@ufba-app/tokens); gera dist/tokens.css
```

`@ufba-app/*` são `workspace:*`. Depois de `pnpm install`, rode `pnpm build:packages`: o web, a landing e o docs
consomem o `dist` dos pacotes, e de novo sempre que mexer em `packages/`.

---

## 2. Stack e o porquê de cada ferramenta

| Ferramenta | Para quê | Por que está aqui |
|---|---|---|
| **Vite + React 19 + TypeScript + React Router** (SPA) | painel e auth | **Decisão do André** (12/11, "definimos juntos"). Quase tudo roda no cliente: a sessão é cookie HttpOnly da API e a senha do SIGAA nunca passa por servidor do web. SSR e proxy do Next seriam coisas que passamos o tempo proibindo. Sem SSR. |
| **TanStack Query** | dados que vêm da API | **Decisão do André** (sem SWR). Cache, revalidação e estados de carregamento e erro sem estado global à mão. |
| **zod/mini** | validar toda resposta da API e os formulários | **Decisão do André** (zod). A versão `mini` é tree-shakable (`apps/web/docs/performance.md`). `src/zodConfig.ts` liga `jitless`, porque a CSP proíbe `eval`; tem que ser o primeiro import de cada entrada. |
| **react-hook-form + `@hookform/resolvers`** | formulários | **Decisão do André** (12/11: "melhor migrarmos logo reacthook form e zodresolver … pra ficar padronizado"). Sem `useState` por campo. |
| **Tailwind v4 + HeroUI v3 (`@ufba-app/web-ui`)** | estilo e componentes | **Decisão do André**: o design system é a base visual. O `web-ui` impõe `tailwindcss@^4` e fixa o HeroUI. Estilo novo vem do design system e dos tokens, não de cores soltas. |
| **Vitest + Testing Library + MSW + vitest-axe** | testes de unidade e de componente | **Decisão do André** (12/11): a skill `react-testing` guia a escrita e o MSW simula a rede. Ver seção 4. |
| **Playwright** | e2e e CSP de produção | **Decisão do André** ("Playwright desde a fase 1"). Prova o que o jsdom não prova: CSP, flash antes do JS, toast e navegação reais. |
| **Stryker** | testes de mutação | **Decisão do André** (12/11): "segue só com a documentação", sem instalar skill de mutação. Mede se os testes pegam defeitos de verdade. |
| **Astro (+ Starlight)** | docs e landing | **Combinado** com o orquestrador e o André. Sites estáticos, zero JavaScript por padrão. Ver seção 7. |
| **Caddy** | servir o `dist` em produção | **Combinado**. É onde moram a CSP, o fallback de rotas, o flash do painel (`shell.html`) e os redirects. |
| **pnpm 11, Node 22** | gerenciador e runtime | **Combinado** (versão em `packageManager`). O Astro está preso em `~7.3` porque o 7.4 pede Node >= 22.23.4. |
| **GitHub Actions** | CI e publicação | `.github/workflows/ci.yml` (check `ci`), `docs.yml` e `landing.yml`. |

Escolhas de método que o André também decidiu:

- **Documentação antes de tentativa** (12/11, sobre a CSP): consultar a documentação oficial (Context7) antes de
  descobrir por tentativa e erro.
- **Sem skill de mutação instalada**; só a documentação do Stryker.

---

## 3. Padrão de escrita

### Nomes e idioma

- **Código em inglês**: identificadores, rotas, chaves JSON, nomes de arquivo e pasta (em ASCII). **Só o texto da
  tela** fica em pt-BR. **Decisão do André.**
- Componentes e páginas em `PascalCase.tsx` (`ConnectionsPage.tsx`); utilitários e hooks em `camelCase.ts`
  (`useDocumentTitle.ts`). Exportação nomeada (`export function ConnectionsPage`), sem `export default`.
- O teste fica ao lado do arquivo: `x.ts` → `x.test.ts`, `Page.tsx` → `Page.test.tsx`.
- Textos de erro e de validação em pt-BR, escritos na hora (no schema do formulário ou vindos da API). Nunca
  concatene mensagem de erro com dado do usuário.

### Estrutura de `apps/web/src`

```
api/        chamadas à API (client.ts + um arquivo por recurso: me, connections, authorize…)
contract/   formato dos dados, à mão: schemas zod/mini, códigos de erro, fixtures de teste
forms/      schemas e máscaras dos formulários (cpf, sigaa, moodleLink)
auth/       login: PKCE, destino pós-login, páginas lazy do auth
routes/     uma página por rota (e seu teste)
components/ componentes do app (AppLayout, diálogos, Skeletons, ErrorScreen…)
lib/        utilitários sem React ou quase (notify, origins, safe, panelPaths)
test/       render, servidor MSW e setup dos testes
```

Regra de dependência: `routes/` e `components/` usam `api/` e `lib/`; `api/` usa `contract/`; `contract/` não importa de
ninguém. Nada em `lib/` ou `contract/` importa de `routes/`.

### Componentes

- Função, com o tipo das props no mesmo arquivo. Use os componentes do `@ufba-app/web-ui` antes de criar um novo.
- **Combine antes de criar** algo visual ou de arquitetura que o André não pediu. O desenho vem do canvas dele
  (ele passa o link do artifact). **Decisão do André.**
- **Skeleton, nunca tela de carregamento ou spinner de página**, com a forma do conteúdo final (`components/Skeletons.tsx`).
  Precisa contrastar com o fundo onde está: paleta azul no conteúdo, cinza em superfície branca (classe
  `web-sk-onwhite`). Confira numa captura de tela. **Decisão do André** (12/11: "tela de carregamento é amadorismo").
- **Evento é toast** (`notify.success/info/error` de `src/lib/notify.ts`); inline só estado e formulário (erro de
  campo, erro dentro do diálogo, falha ao carregar com "Tentar de novo"). **Decisão do André.**
- Página nova entra em `src/routes/lazy.tsx` (auth: `src/auth/lazy.tsx`); diálogo pesado, só depois do clique, com `lazy`.

### Estado

| O estado é… | Fica em… |
|---|---|
| dado da API (sessão, conexões, apps) | TanStack Query (`useMe`, `useQuery`/`useMutation` por recurso, chaves em `api/`) |
| campo de formulário | react-hook-form |
| aberto/fechado, item escolhido, UI efêmera | `useState` local do componente |
| onde a pessoa está | a URL (React Router) |

Não existe estado global à mão (Redux, Zustand, contexto de dados). Depois de uma ação que muda dados, invalide a chave
da query (`meQueryKey`) em vez de copiar o resultado para outro lugar.

### Chamadas à API

- **Um único cliente**: `request()` em `src/api/client.ts`. Cookie de sessão (`credentials: 'include'`), `X-UFBA: 1` em
  tudo que muda estado, JSON, e **toda resposta passa por um schema** (`schema:` do `request`): a API é a fronteira não
  confiável.
- **O contrato é `src/contract`, escrito à mão**, e `openapi.contract.test.ts` o compara com `src/contract/openapi.json`
  (cópia de `https://api.ufba.app/openapi.json`). Para atualizar: `pnpm contract:update` (em `apps/web`) e depois
  `pnpm test`. **Decisão do André** (contrato à mão com teste; gerar do OpenAPI fica para depois do site estável).
- **Não invente endpoint nem formato de erro.** Dúvida de contrato vai para o backend. **Decisão do André.**
- Erros: `ApiError` com `status`, `code` (`KnownErrorCode` em `contract/errors.ts`, igual ao enum da API) e a `message` em
  pt-BR que a API manda; mostre essa mensagem. `401 session_expired` tem um tratador único (manda ao login).
- **A senha do SIGAA vai direto do navegador para a API.** Nunca por proxy, servidor ou SSR do web; nunca em log, URL,
  mensagem de erro ou `reportInput`; `reset()` do campo ao enviar. **Decisão do André.**
- **Origens fixas no build** (`VITE_PANEL_ORIGIN`, `VITE_AUTH_ORIGIN`, `VITE_API_URL`; `src/lib/origins.ts`). Nada de
  origem escrita no código nem vinda da URL. O destino de um `return` é só caminho relativo seguro (`safeReturnPath`).

### TypeScript

`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters` e `verbatimModuleSyntax` ligados (`tsconfig.json`).
`pnpm typecheck` (raiz) cobre todos os pacotes e é passo do CI. Sem `any` para fugir de um erro de tipo: modele o dado
(schema) ou escreva a guarda.

---

## 4. Estratégia de testes

Escolhas: **Decisão do André** (skill `react-testing`: testar o que a pessoa vê e faz; Vitest + Testing Library + MSW +
axe; Playwright desde o começo; Stryker). A skill versionada em `.claude/skills/react-testing/` é o texto-base; esta
seção diz como ela se aplica aqui.

### Pirâmide

| Camada | Ferramenta | O que testa | Onde |
|---|---|---|---|
| **Unidade** | Vitest | funções puras e regras: `safe`, `origins`, `cpf`, PKCE, destino pós-login, cliente da API, `panelPaths`, o texto do Caddyfile | `src/**/*.test.ts` |
| **Componente / página** | Vitest + Testing Library + MSW + vitest-axe | uma tela inteira com os mesmos providers da produção, a rede simulada no nível do `fetch` | `src/routes/*.test.tsx`, `src/api/*.test.tsx` |
| **Acessibilidade** | vitest-axe | violações dentro dos testes de componente | no mesmo teste da tela |
| **e2e simulado** | Playwright (API simulada) | fluxos entre telas, toast real, contraste em captura, mobile | `e2e/`, `e2e-auth/` |
| **e2e de produção (CSP)** | Playwright contra `vite preview` | a CSP do Caddyfile vale, sem violação; o flash antes do JS | `e2e-prod/`, `e2e-auth-prod/` |
| **e2e com API real** | Playwright | encadeamento real; só com a API local de pé | `e2e/real-api.spec.ts`, `e2e-auth/real-api.spec.ts` |
| **Mutação** | Stryker | se os testes de unidade percebem um defeito introduzido | `pnpm mutation` (em `apps/web`) |

### Como escrever (componente)

- **Teste o que a pessoa vê e faz**, não detalhe de implementação: sem inspecionar estado, props de filhos ou quantas
  vezes renderizou. Renderize com os providers reais (`renderApp`/`renderAuthApp` de `src/test/render.tsx`).
- **Consultas por acessibilidade, de cima para baixo**: `getByRole` (com nome), `getByLabelText`, `getByText`; `getByTestId`
  só como último recurso. Para sumiço, `queryBy*`; para o que aparece depois, `findBy*`.
- **`userEvent` (com `await`)**, não `fireEvent`. Nunca `setTimeout` + asserção: use `findBy*`/`waitFor`.
- **Rede com MSW**, sem mockar o `fetch` nem os hooks. `onUnhandledFrame: 'error'` (em `test/setup.ts`) faz uma requisição
  sem mock falhar o teste; override por teste com `server.use(...)`.
- **Dados de teste**: `meFixture()` e `authorizeRequestFixture()` (`src/contract/fixtures.ts`). Não escreva JSON à mão em
  cada teste. CPF de teste: o que tem dígitos verificadores certos (`529.982.247-25`).
- `notify` e `ToastHost` são simulados no jsdom (`test/setup.ts`, por causa de React duplicado). Teste que o app **pediu**
  o aviso (`expect(notify.error).toHaveBeenCalledWith(...)`); o toast de verdade é testado no Playwright, com captura.
- Todo teste de tela com elementos interativos roda `axe(container)` (hoje: SignIn, Authorize, Connections e AuthorizedApps; tela nova entra com o seu).
- **Não deixe diálogo aberto** no fim do teste: contamina o seguinte.
- Sem snapshot de DOM. Nada de `container.querySelector` onde um papel acessível serve.
- **TDD para código novo**: teste vermelho pelo motivo certo, código mínimo, refatorar. (Skill `superpowers:test-driven-development`.)

### Quando rodar o quê

| Momento | Comandos |
|---|---|
| Durante o trabalho | `pnpm exec vitest run <arquivo>` ou `pnpm --filter @ufba-app/web test:watch` |
| Antes de dizer que terminou | `pnpm typecheck` e `pnpm test` (raiz); `pnpm e2e` (em `apps/web`) **quando tocar telas**; `pnpm e2e:auth` se tocar o auth |
| Mexeu em rota, dependência ou estilo global | `pnpm build && pnpm size` (e `build:auth` + `size:auth`) |
| Mexeu em Caddyfile, CSP, `index.html`, `shell.html`, `auth.html` ou `boot.css` | `pnpm exec playwright test -c playwright.prod.config.ts` e `pnpm e2e:auth:prod` (portas 3001 e 3002 livres) |
| Mexeu em `packages/` | `pnpm build:packages` antes de tudo |
| A API mudou o contrato | `pnpm contract:update` e `pnpm test` |
| Mexeu em `src/auth`, `src/api` ou `src/lib/safe.ts` | `pnpm mutation` (proposta: ver abaixo) |

**O que o CI roda hoje** (em todo PR e na `main`; check `ci`): instalação com lockfile congelado, build dos pacotes e da
landing, typecheck, testes de unidade e de componente de todos os pacotes, build + `size` do painel e do auth e a prova
do Caddyfile num Caddy real. O job `e2e` (em paralelo, ainda fora do check obrigatório) roda `e2e:auth` e `e2e` do painel. **Fora do CI**: Stryker, os e2e de CSP de produção (`e2e-prod`, `e2e-auth-prod`) e os `real-api`.

### Mutação (Stryker)

- **Escopo** (`apps/web/stryker.config.json`): `src/auth/**`, `src/api/**` e `src/lib/safe.ts`, o código em que um erro
  vira falha de segurança ou de sessão. Os testes entram como `!*.test.*`.
- **Nota mínima**: `thresholds`: **break 70** (abaixo disso o comando falha), **low 75**, **high 90**. Meta do dia a dia:
  ficar em 90 ou mais nesse escopo.
- **Como ler** (`reports/mutation/index.html`, gerado a cada execução; a pasta `reports/` não vai ao git):
  - **Killed**: algum teste falhou com a mutação (bom).
  - **Survived**: nenhum teste percebeu a mudança: **falta teste ou asserção**. É o que se corrige, abrindo o arquivo e
    vendo a linha mutada (por exemplo `>` virou `>=`).
  - **No coverage**: nenhuma linha de teste executa aquele código.
  - **Timeout/Error**: contam como detectados; só investigue se forem muitos.
  - Sobrevivente que não muda comportamento (equivalente) vale ser ignorado com comentário, nunca “consertado” com um
    teste que não prova nada.
- `incremental: true`: a segunda execução só reavalia o que mudou. Apague `reports/stryker-incremental.json` para uma
  rodada completa.
- **Proposta, revisar com o André**: rodar `pnpm mutation` à mão em PR que mexa no escopo acima (não no CI, que ficaria
  lento), e registrar a nota no PR. Hoje não há registro da última nota; a primeira rodada completa deve virar a
  linha de base aqui.

### e2e (Playwright)

- Painel e auth têm configs separadas (`playwright.config.ts`, `playwright.auth.config.ts`, `…prod…`, `…real…`).
  Simulam a API com `mockApi` (`e2e/support.ts`) e o painel com `stubPanel`.
- Os e2e do painel e do auth servem o **build** (`pnpm build && pnpm preview`), não o dev server: o dev entregava
  centenas de módulos soltos e, com a suíte em paralelo, estourava 10 s por página e derrubava testes ao acaso (era a
  causa do teste “login a partir de um pedido de app termina no /authorize”). `reuseExistingServer: false`: um
  `pnpm dev` esquecido na 3001 não é reaproveitado. Se ainda aparecer falha intermitente, **anote; não esconda.**
- Trave por evento, não por tempo: para “olhar uma tela de espera”, segure a resposta numa promessa e libere depois
  (um `setTimeout` fixo estoura em máquina carregada).
- Os testes `real-api` precisam da API local (porta 3000, `AUTH_ORIGIN=http://localhost:3002`); sem ela falham, e isso
  não é regressão.
- No CI roda o job `e2e` (`e2e:auth` e `e2e` do painel, API simulada, traces só na falha). Ele ainda não é check
  obrigatório: a decisão fica para depois de ver o tempo no runner. CSP de produção e `real-api` ficam fora.

---

## 5. Divisão da carga de JavaScript

Meta, números e método estão em **`apps/web/docs/performance.md`**: leia antes de mexer em rota, dependência ou estilo
global. O resumo que vale em toda mudança:

- JS inicial pequeno (referência: Notion). Teto medido por `pnpm size` e `pnpm size:auth`; passou, **não suba o teto
  sozinho**: reduza ou pergunte. **Decisão do André.**
- Página por rota com `React.lazy`; diálogo ou componente pesado só depois do clique; pré-carregamento na intenção
  (passar o mouse no menu).
- Dependência nova: veja o tamanho e prefira a versão tree-shakable (`zod/mini` e não `zod`).
- A tela de espera antes do JS é HTML estático (`shell.html` no painel, só o brasão no resto); por isso rota nova do
  painel entra em `src/lib/panelPaths.ts` **e** na regra `@panel` do Caddyfile. O teste falha se divergirem.

---

## 6. Acessibilidade

- **Estrutura primeiro**: um `h1` por página, ordem dos títulos sem pular nível (o cartão do design system usa `h3`, por
  isso `Conexões` tem um `h2` escondido), landmarks, listas como listas. Use o elemento certo (`button` para ação,
  `a` para navegação) antes de qualquer `role`.
- **Nome acessível em todo controle** (rótulo, `aria-label` quando só há ícone). Os testes consultam por papel e nome:
  se o teste não acha, a pessoa com leitor de tela também não acha.
- **Teclado**: tudo que se faz com o mouse se faz com Tab, Enter, Espaço e Esc; foco visível; diálogos prendem o foco
  (o HeroUI/React Aria já faz: não reimplemente).
- **Contraste**: o jsdom não calcula CSS, então o axe não pega contraste real. Confira em **captura de tela** no
  navegador (toast, skeleton, estados de erro). **Decisão do André.**
- **Movimento**: respeite `prefers-reduced-motion` (o pulso do brasão em `boot.css` já respeita). Skeleton é decorativo
  (`aria-hidden`) e o carregamento tem um texto só para leitor de tela (“Carregando”, `role="status"`).
- Erro de formulário fica junto do campo. Toast é para evento, não para erro que a pessoa precisa corrigir no campo.
- Toda tela nova roda `axe` no seu teste (seção 4). **Proposta, revisar com o André**: rodar o axe também no Playwright
  (`@axe-core/playwright`) nas telas principais, onde o CSS real existe, para pegar contraste automaticamente.

---

## 7. Astro: `apps/docs` e `apps/landing`

Regras comuns (**combinado**):

1. **Zero JavaScript por padrão.** Páginas são HTML e CSS estáticos. Ilha de JavaScript só onde há interação que HTML
   não resolve, e como arquivo externo. Hoje o único JS da landing é `public/typing.js` (carregado por `<script src>`); o
   docs não escreve JavaScript próprio nas páginas (o que o Starlight traz por conta dele não foi auditado aqui).
2. **Mesmos tokens do app**: cores, fontes e raios vêm de `@ufba-app/tokens` (rode `pnpm build:packages` ou
   `pnpm build:landing`, que já constrói os tokens). Não repita valor de cor ou fonte.
3. **Fontes locais** (`@fontsource`), nunca Google Fonts. **Sem terceiros** (analytics, CDN, widget).
4. **CSP estrita, sem inline**: sem `style=`, `<style>` ou `<script>` inline. Na landing, `inlineStylesheets: 'never'` e
   `assetsInlineLimit: 0` (nada vira `data:`); os cabeçalhos ficam em `public/_headers` (Cloudflare Pages).
5. **Estático de verdade**: nada de chamada ao servidor no navegador; dado dinâmico entra no build.
6. Astro preso em `~7.3` (Node 22.23.2). Teste de conferência do build: `pnpm --filter @ufba-app/landing test`
   (`check-dist`) e `pnpm --filter @ufba-app/docs check:dist`.

**`apps/landing`** (ufba.app): desenho fiel ao do canvas do André; publica no Cloudflare Pages por
`.github/workflows/landing.yml` (secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no repositório, nunca em arquivo).

**`apps/docs`** (docs.ufba.app): o conteúdo **não está no git**: vem do memory (páginas com a tag `public`) no build.
Markdown sem HTML cru (`remark-safe`), varredura de segredos (interna e gitleaks), falha em vez de publicar página
vazia. Detalhes e pipeline: `apps/docs/README.md`. Publica pelo `docs.yml` (push, a cada 6 h e manual).

**Fora do CI de PR**: o build do docs precisa da chave do memory, que PR de fork não recebe. O workflow `ci` nunca usa
`secrets`.

---

## 8. Como trabalhar aqui

### Regras do André (valem sempre)

- **Commit só em branch; push, PR e merge só com o OK dele** (ou do orquestrador, que coordena). Nunca force push nem
  amend sem pedir. **Nada no Railway** sem o André (nem criar, nem variável, nem redeploy).
- **Consulte antes de criar** algo visual ou de arquitetura que ele não pediu. Uma coisa de cada vez. Para decidir,
  ofereça uma recomendação e opções curtas. Quando ele disser “não entendi”, explique **sem jargão**.
- **Mudança pequena e direta quando ele testa ao vivo**: edição pequena, sem reestruturar. Se ele pedir “volte como
  estava”, **reverta exatamente** o que foi feito (já aconteceu com um ajuste de alinhamento que ele não queria).
- **Verifique de verdade antes de dizer que terminou** (typecheck, testes, e2e quando tocar tela, CSP de produção) e
  **diga com franqueza o que não foi verificado** (Docker, Caddy, login real, deploy). O que só foi lido ou revisado em
  arquivo não é “testado”.
- **Dados pessoais e segredos**: ninguém digita nem lê credencial do André; nada de senha, token ou CPF inteiro em log,
  nota, commit, memory ou mensagem. O CPF do SIGAA aparece na tela só com os 2 últimos dígitos.
- Resposta final curta, em pt-BR: o que mudou, o que foi verificado e o que ficou para ele decidir.
- Nunca testar login em `*.up.railway.app` (quebra o cookie). O painel roda na porta 3001 (é o `WEB_ORIGIN` da API).

### Fluxo

1. Branch a partir da `main` (um assunto por branch).
2. Escreva o teste, depois o código; rode o que a seção 4 manda para o que você tocou.
3. Commit na branch. O PR precisa do check **`ci`** verde (o ruleset da `main` exige PR e proíbe force push).
4. Depois do merge, o Railway publica a `main` sozinho (serviços `panel` e `auth`). O painel só passa a servir se o
   healthcheck `/healthz` responder 200.

### Ambiente (Windows)

O Node não está no PATH da máquina do André; use PowerShell e prefixe o PATH da sessão (caminho no `CLAUDE.md`). Pelo
Git Bash o atalho do `pnpm` quebra. PowerShell 5.1 marca como erro qualquer saída em stderr do pnpm/node mesmo com
sucesso: confira o código de saída e a linha de resultado, não só a cor.

---

## 9. Propostas em aberto (revisar com o André)

Nada abaixo é regra até ele decidir.

1. **Lint no `apps/web`.** O `eslint.config.js` da raiz ignora `apps/**`, então o painel e o auth não passam por lint. Incluir
   o `apps/web` (e `apps/docs`, `apps/landing`) com as regras recomendadas do `typescript-eslint` e do
   `eslint-plugin-react-hooks`, e um passo `lint` no CI.
2. **axe no Playwright** para pegar contraste real.
3. **Nota de mutação**: rodar `pnpm mutation` em PR que mexa em `src/auth`, `src/api` ou `src/lib/safe.ts`, registrar a nota
   no PR e guardar a primeira rodada completa como linha de base.
4. **Cobertura** (`vitest --coverage`): hoje não é medida. A skill sugere metas por camada; se o André quiser um número, o
   ponto de partida é medir e só então fixar.
5. **Geração do contrato** a partir do OpenAPI (opção 1, já adiada pelo André) quando o site estiver estável.
