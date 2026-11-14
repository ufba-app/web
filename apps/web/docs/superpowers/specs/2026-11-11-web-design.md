# Web do ufba.app: especificação

Data: 2026-11-11
Estado: rascunho para revisão
Repo: `ufba-app/web`
Referências: canvas "ufba.app, Telas do app web" (23 artboards, 5 grupos), repo `ufba-app/design-system` (`@ufba-app/web-ui`, `@ufba-app/tokens`), backend `platform`.

## 1. Objetivo

Entregar o front oficial do ecossistema ufba.app, com as telas que o design aprovou:

1. **Entrar**: login com Google (@ufba.br).
2. **Conexões**: SIGAA, Moodle e Classroom, conectadas uma vez por pessoa.
3. **Autorizar cliente**: o usuário decide se um app (ex.: Claude) acessa seus dados.
4. **Apps autorizados**: lista com revogar.
5. **Erro** do fluxo de autorização.

O `web` também é um cliente OAuth com PKCE da casa, sem tela de consentimento. O backend lê SIGAA, Moodle e Classroom ao vivo, sem sincronizar nem guardar conteúdo.

### O que foi dito e o que é suposição

Dito pelo André (direto ou pelo agente do backend):
- Todas as telas ficam no web; o web é cliente PKCE da casa; sessão em cookie HttpOnly/SameSite.
- A senha do SIGAA vai direto do navegador para a API, nunca por SSR ou proxy.
- Na tela Autorizar, o app é identificado pelo domínio do `redirect_uri`, sempre em destaque. Nome e logo vêm dos metadados do app; selo "verificado" só para domínios da lista; senão ícone genérico e "não verificado". Para verificados, nome e logo da lista prevalecem sobre os metadados.
- Nomes de código em inglês; só o texto que a pessoa lê é pt-BR.
- Domínios: `https://ufba.app` (web) e `https://api.ufba.app` (API), no mesmo site. Hospedagem no Railway, só produção. Nada é criado nem alterado no Railway sem o André.
- Itens do menu sem tela (Painel, Horário, Prazos, Notas) viram páginas "Em breve".
- Sem commit e sem push até o André pedir.

Suposições desta especificação (corrigíveis na revisão): marcadas com **[SUPOSIÇÃO]** no texto.

### Regra sobre o contrato com a API

**Nenhum endpoint, campo ou formato de erro é inventado.** Tudo o que o backend ainda não implementou está marcado **[PROPOSTA]** (desenho recomendado pelo backend, ainda inexistente). Cada [PROPOSTA] vive atrás de um mock tipado em `src/contract/` e entra em `docs/contract-gaps.md`. O backend vai publicar um spec formal dos endpoints, que prevalece sobre este documento.

## 2. Stack

| Item | Escolha | Motivo |
|---|---|---|
| Build | Vite, React 19, TypeScript estrito | CSP estrita sem recurso experimental (ver 7) |
| Roteamento | React Router (modo biblioteca) | sem SSR; `Link` entra em `as` nos itens do menu |
| Estilo | Tailwind v4 | peer do `@ufba-app/web-ui` |
| Design system | `@ufba-app/web-ui` e `@ufba-app/tokens` | componentes de todas as telas já existem |
| Fontes | `@fontsource` (Sora 600/800, Plus Jakarta Sans 500/700/800) | fontes empacotadas no build; `font-src 'self'` |
| Dados | TanStack Query + `fetch` com `credentials: 'include'` | polling do Moodle, invalidação ao conectar/revogar |
| Validação | zod | a API é fronteira não confiável; schema é a fonte dos tipos |
| Gerenciador | pnpm 11, Node 22 | mesmo do design system |

Descartados: Next.js (CSP estrita inviável em export estático, ver 7), BFF (a `K` do token decifra a senha do SIGAA e nunca pode ficar gravada ou passar por mais um processo), SWR (redundante com TanStack Query).

O design system é consumido por **link local** do clone (`../design-system`) enquanto o pacote não está publicado no GitHub Packages. Isso precisa ser trocado pelo pacote publicado antes de subir o web (ver 11).

## 3. Estrutura

```
src/
  contract/     schemas zod, tipos (z.infer) e mocks tipados
  api/          cliente fetch, interceptor de 401, hooks do TanStack Query
  auth/         PKCE, estado do login, retorno do login
  routes/       uma página por rota
  components/   composição dos componentes do web-ui
  main.tsx
docs/
  contract-gaps.md
  superpowers/specs/
Dockerfile
Caddyfile
```

Regras:
- Nomes de código em inglês; textos de tela em pt-BR.
- Nenhum CSS de componente próprio: telas montam componentes do `web-ui`. CSS próprio só para layout específico de página.
- Os componentes do `web-ui` não buscam dados; a camada `api/` entrega valores por props.
- Nenhuma dependência além das listadas, com lockfile versionado.

## 4. Rotas e telas

| Rota | Tela (artboards) | Componentes principais |
|---|---|---|
| `/sign-in` | Entrar: padrão, vindo de um cliente, conta não @ufba.br, celular | `AuthLayout`, `Notice`, `Button`, `ServiceIcon` |
| `/sign-in/callback` | sem tela visível; confere `state`, faz `POST /session`, limpa a URL | |
| `/connections` | Conexões: tudo conectado, primeiro acesso, SIGAA pede senha, conectar SIGAA, Moodle (3 passos), celular | `AppShell`, `SideNav`, `PageHeader`, `SourceCard`, `AccountRow`, `RequestAccess`, `Dialog`, `StepList` |
| `/authorize?request=<id>` | Autorizar: válido, não verificado, sem conexão, expirado, celular | `AuthLayout`, `ClientRequest`, `ScopeList`, `AccountLine`, `Button` |
| `/authorized-apps` | Apps autorizados: lista, confirmar revogação, vazio, celular | `AppShell`, `PageHeader`, `AppRow`, `EmptyState`, `Dialog` |
| `/error` | Erro do fluxo de autorização | `AuthLayout`, `Notice`, `Button` |
| `/`, `/schedule`, `/deadlines`, `/grades` | páginas "Em breve" | `AppShell`, `PageHeader`, `EmptyState` |

O menu lateral mostra Painel, Horário, Prazos e Notas e, no grupo Conta, Conexões e Apps autorizados. O contador "4" ao lado de Prazos do design fica de fora (não há dado).

Responsivo: o `AppShell` vira barra superior abaixo de 820px e o `AuthLayout` fica só com o cartão. Os artboards de celular (390px) são o critério de aceite.

## 5. Sessão e login

Fato que define o desenho: [EXISTE] o token OAuth é `<aleatório>.<K>`; `K` decifra a senha do SIGAA daquele cliente e **nunca fica gravada** (o banco guarda só `sha256` do token). Por isso o token do web **nunca é acessível ao JavaScript**: a sessão é um cookie HttpOnly emitido pela própria API.

Tudo abaixo é **[PROPOSTA]**:

- Cookie: `ufba_session` (dev) e `__Host-ufba_session` (prod); `HttpOnly; Secure` (prod); `SameSite=Lax`; `Path=/`; sem `Domain`; 30 dias. A API renova o access a partir do refresh guardado no cookie.
- Web e API no mesmo site (`ufba.app` e `api.ufba.app`; em dev, `localhost:3001` e `localhost:3000`). Nunca testar login em `*.up.railway.app`.
- Login (PKCE, cliente da casa, sem consentimento):
  1. O web gera `code_verifier`, `code_challenge` (S256) e `state` aleatório; guarda verifier e state em `sessionStorage`.
  2. Redireciona para `{API}/authorize?client_id=<VITE_UFBA_CLIENT_ID>&redirect_uri={WEB}/sign-in/callback&code_challenge=...&code_challenge_method=S256&response_type=code&state=...`.
  3. A API manda para o Google e volta para `{WEB}/sign-in/callback?code=&state=`.
  4. O web confere o `state` (uso único), chama `POST /session {code, code_verifier, redirect_uri}` com `credentials: 'include'` e espera `204`.
  5. Apaga verifier e state, limpa `?code&state` com `history.replaceState` e segue para o destino (`return`, ou `/connections`).
- `GET /me` → `{ id, name, email, connections: { sigaa, moodle, classroom: { accounts } } }` (`sigaa`: `connected | disconnected | password_required`; `moodle`: `connected | disconnected`).
- `DELETE /session` (`204`) sai da conta.
- Erros: `{ "error": "<snake_case>", "message": "<texto pt-BR>" }`; sessão expirada é `401 { "error": "session_expired" }`. Um único interceptor manda para `/sign-in?return=<caminho relativo>`.
- Chamadas que mudam estado: `Content-Type: application/json` + header `X-UFBA: 1`. O backend checa `Origin`.
- O `return` aceita **só caminho relativo do próprio web**, com a query codificada.

## 6. Tela Autorizar

[PROPOSTA] Fluxo: a API redireciona para `https://ufba.app/authorize?request=<id>` (pedido pendente, 15 min, [EXISTE]). O web chama `GET /authorize/requests/<id>` com o cookie:

```
{ id, client: { domain, redirectUri, name | null, logoUrl | null, verified, metadata: "present" | "absent" },
  sources: [ { source: "sigaa"|"moodle"|"classroom", status: "connected"|"disconnected"|"password_required" } ],
  expiresAt }
```

Ações: `POST /authorize/requests/<id>/approve` e `/deny` (corpo `{}`, headers de CSRF) respondem `200 { redirectTo }`. O web faz `window.location.assign(redirectTo)`, sem montar a URL. Só atribui se `redirectTo` for string e recusa os esquemas `javascript:` e `data:`; não restringe a `http(s)`, porque clientes MCP podem usar esquemas próprios.

### Regras de exibição

- Os dados do app vêm **sempre da resposta da API**, nunca da query string. Nada aprova sozinho.
- **Domínio** (`client.domain`, ASCII/punycode) sempre em destaque, exatamente como vier.
- **Nome**: `client.name`; sem nome, o título é o domínio. Renderizado só como texto.
- **Logo**: a API baixa, valida e serve a imagem em `api.ufba.app/client-logos/<sha256>.png` (a URL original nunca chega ao navegador). Sem `logoUrl`, ícone genérico, nunca a inicial do nome.
- **Selo "Verificado"**: só se `verified`, independe de nome e logo. Sem selo, aviso "App não verificado".
- O acesso é a **todas as fontes conectadas** da pessoa, não por escopo; a tela mostra `sources`.
- O `ClientRequest` com esse comportamento foi para o design system (PR #4, já mesclado).

### Fonte SIGAA com `password_required` **[SUPOSIÇÃO: texto]**

A sessão web não tem a senha, então o app novo fica sem SIGAA até a pessoa digitá-la. Na lista "Vai ver": selo de alerta **"Precisa da senha"** e, abaixo da lista, um aviso `info`: "O SIGAA só vai aparecer para o app depois que você digitar a senha." com o link **"Digitar senha"** para `/connections`. O botão Autorizar continua habilitado.

O `ScopeList` do design system hoje aceita só `connected: boolean`. Precisa de um estado a mais (`status`), que é um PR separado no `design-system`; até lá, o web compõe a linha.

### Erros do pedido **[SUPOSIÇÃO: textos]**

Todos usam a estrutura da tela "Pedido expirado" do design (título, uma frase, aviso, botão).

| Resposta | Título | Texto | Botão |
|---|---|---|---|
| `410 request_expired` | Pedido expirado | Volte ao app e peça acesso de novo. (aviso: "Por segurança, cada pedido vale por pouco tempo.") | Ir para o painel |
| `409 request_already_used` | Pedido já respondido | Esse pedido já foi usado. Se o app não abriu, volte a ele e peça acesso de novo. | Ir para o painel |
| `404 request_not_found` | Pedido não encontrado | Não achamos esse pedido. Volte ao app e peça acesso de novo. | Ir para o painel |
| `401 session_expired` | (sem tela) | redireciona para `/sign-in?return=/authorize?request=<id>` | |
| rede / `5xx` | Algo deu errado | Não foi você. Tente de novo em instantes. | Tentar de novo |

A tela "Algo deu errado" do design mostra "Código 7F3A-21C9", mas o formato de erro `{ error, message }` não traz código algum (ver lacunas). Até o backend dizer, mostro o valor de `error`, quando houver.

## 7. Segurança

### CSP e headers

Servidos pelo servidor de arquivos do Railway (ver 11), não pelo Vite. O Vite gera scripts externos, então `script-src 'self'` funciona sem `unsafe-inline` nem nonce.

- `default-src 'self'`; `script-src 'self'`; `font-src 'self'`; `img-src 'self' https://api.ufba.app`; `connect-src 'self' https://api.ufba.app`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`.
- `style-src`: **a verificar.** HeroUI e React Aria podem aplicar estilos inline, o que pode obrigar `'unsafe-inline'` só em estilos. Será medido ao montar a CSP e documentado; não prometemos CSP totalmente estrita antes disso.
- `Referrer-Policy: strict-origin-when-cross-origin` (e `no-referrer` em `/sign-in` e `/authorize`), `X-Content-Type-Options: nosniff`.
- Por que Vite e não Next: segundo a documentação do Next, nonces exigem renderização dinâmica e `headers()` não existe em export estático; o caminho de hash (SRI) é experimental e não confirmado com export.

### Checklist do front

- `state` aleatório e de uso único; verifier só em `sessionStorage` e apagado após a troca.
- `history.replaceState` depois do `POST /session`.
- "Voltar para" aceita só caminho relativo do próprio web.
- Nenhum script de terceiros (analytics, session replay, chat) no app.
- **Senha do SIGAA**: `type="password"`, `autocomplete="current-password"`; nunca em log, estado global persistido, URL ou mensagem de erro; campo limpo depois do envio; o envio é `fetch` direto para `api.ufba.app`, nunca por proxy.
- Sem `dangerouslySetInnerHTML`.
- `HttpOnly` impede ler o cookie, mas não impede um script injetado de usar a sessão: por isso a CSP e a ausência de terceiros importam.
- Domínios próprios para qualquer ambiente; sem subdomínios abandonados, porque `SameSite` não protege de ataque vindo de subdomínio irmão (quem protege é a checagem de `Origin`).
- Não é auditoria; o backend revisa a lista antes de produção.

## 8. Camada de contrato

- `src/contract/` guarda, por recurso, o schema zod, o tipo (`z.infer`) e um mock tipado.
- Toda resposta da API passa pelo schema antes de chegar às telas. Resposta fora do formato vira erro de contrato, não tela quebrada.
- `src/api/` tem um módulo por recurso (`me`, `session`, `authorizeRequests`, `connections`, `authorizedApps`) e hooks do TanStack Query. Para [PROPOSTA] ainda inexistente, o módulo devolve o mock; quando o endpoint existir, só a implementação muda.
- `docs/contract-gaps.md` lista cada [PROPOSTA] e cada dado que o design precisa mas a API não entrega.

### Lacunas já identificadas

1. Todos os endpoints de sessão, `/me`, `/authorize/requests/*` e o formato de erro são [PROPOSTA].
2. **Conexões**: não há contrato para conectar o SIGAA (corpo, erro de senha errada), conectar o Moodle (deep link e como o retorno chega ao web; o estado "esperando" do design parece exigir polling), pedir acesso e remover conta do Classroom.
3. `classroom.accounts` é só uma lista de e-mails, mas o design mostra contas "Conectada" e "Aguardando liberação": falta o estado por conta.
4. **Apps autorizados**: nenhum endpoint de listar ou revogar; o design pede domínio, data de autorização e último uso.
5. O **Entrar "vindo de um cliente"** mostra o nome do app antes do login, mas `GET /authorize/requests/<id>` exige sessão: falta saber de onde o web tira o nome.
6. **Conta não @ufba.br**: o design mostra o e-mail recusado; falta saber como o erro chega ao `/sign-in/callback`.
7. O `UserBadge` do design mostra matrícula e curso ("222115043, BCC"), mas `/me` só tem `id`, `name` e `email`.
8. O "Código" da tela de erro não existe no formato `{ error, message }`.
9. Os nomes em inglês dos endpoints e das rotas foram combinados por mensagem; vale o spec formal do backend quando sair.

## 9. Testes

Camadas, sem misturar ferramentas na mesma faixa:

| Camada | Ferramenta | Cobre |
|---|---|---|
| Unidade e componentes | Vitest (jsdom), Testing Library, `userEvent`, MSW, axe | lógica, hooks, telas |
| Mutação | Stryker (`@stryker-mutator/vitest-runner`) | qualidade dos testes de `src/auth/**` e `src/api/**` |
| Ponta a ponta | Playwright, contra a API real em `localhost` | login e cookie reais, CSP, responsivo, `frame-ancestors` |

- Prática: TDD (skill `superpowers:test-driven-development` e skill `react-testing` da `affaan-m/ecc`, instalada no projeto). Elementos por papel e nome acessível, nunca `data-testid`; mock de rede com MSW, nunca de componentes próprios; axe em todo componente interativo; sem snapshots de DOM.
- Stryker (da documentação oficial; configuração a validar no primeiro uso): `testRunner: "vitest"`, `vitest.related`, `checkers: ["typescript"]`, `coverageAnalysis: "perTest"`, `ignoreStatic`, `incremental`, `mutate` em `src/auth/**` e `src/api/**` sem os testes, `thresholds` com `break` inicial de **70 [SUPOSIÇÃO]**, ajustado após o primeiro resultado. Rodar só nos módulos alterados antes de cada PR. Como rodar só os arquivos de um PR no CI não está na documentação consultada, isso fica para quando chegarmos ao CI.
- Playwright desde a fase 1: o André garante o backend pronto em `localhost:3000` (web em `:3001`) antes de eu começar. Cobre os fluxos de Entrar, Conexões, Autorizar e Apps autorizados, a viewport de 390px e a ausência de violações de CSP no console.
- Mutação não vira skill: consultamos só a documentação.

## 10. Páginas "Em breve"

`/` (Painel), `/schedule` (Horário), `/deadlines` (Prazos), `/grades` (Notas e faltas): `AppShell` com `PageHeader` e `EmptyState`, texto curto em pt-BR (por exemplo, "Em breve" e uma frase). Servem para o menu não ter link morto. Sem dados.

## 11. Hospedagem e build

- Tudo no Railway, só produção: `ufba.app` (web) e `api.ufba.app` (API), serviços separados. **Nada é criado nem alterado no Railway por mim**; o André decide quando subir.
- O build do Vite gera arquivos estáticos (`dist/`). O Railway precisa de um servidor de arquivos: **Dockerfile em dois estágios** (Node 22 + pnpm compila; imagem só com o servidor serve o `dist/`).
- Servidor: **Caddy [SUPOSIÇÃO]**, com `try_files {path} /index.html` (fallback do React Router), os headers da seção 7 e escuta na porta que o Railway fornece. O TLS fica no Railway; o Caddy não busca certificado. Isso é o que espero do Railway e **não foi verificado na documentação deles**.
- Variáveis de build (sem segredo): `VITE_UFBA_CLIENT_ID` e a URL da API.
- Dockerfile e `Caddyfile` ficam versionados neste repo.
- Pré-requisito para o build em container: `@ufba-app/web-ui` precisa estar publicado no GitHub Packages (workflow Release do design system, manual), com `GITHUB_TOKEN` com `read:packages` como secret de build, nunca em arquivo.

## 12. Fora do escopo desta versão

- Telas de dados (horário, prazos, notas) além das páginas "Em breve".
- Tema escuro.
- SSR, BFF, rotas de API ou server actions.
- Pré-visualizações por PR e ambiente de dev na nuvem (só `localhost`).
- Criar ou alterar qualquer recurso no Railway.

## 13. Pré-requisitos e ordem

Pré-requisitos antes de criar o projeto:
1. Backend pronto em `localhost:3000` (garantia do André) e o spec formal dos endpoints.
2. Node 22 e pnpm 11 no PATH (o Node 22.23.2 e o pnpm 11.1.3 já existem na máquina, fora do PATH; usar o caminho completo ou ajustar o PATH).
3. Clone do design system em `../design-system`, na `main`, com `dist` construído (feito).

Ordem de entrega (cada passo com testes; sem commit até o André pedir):
1. Esqueleto: Vite, TypeScript, Tailwind, fontes, `web-ui` por link, `AppShell` e rotas, Vitest, Playwright, Stryker.
2. Camada de contrato e `api/`, com mocks e `contract-gaps.md`.
3. Entrar e retorno do login.
4. Conexões.
5. Autorizar cliente e erros.
6. Apps autorizados.
7. Páginas "Em breve".
8. Dockerfile, `Caddyfile` e CSP.

## 14. Pontos em aberto

- O formato real de cada [PROPOSTA] (aguarda o spec do backend).
- `style-src` da CSP (HeroUI e React Aria).
- Como o Moodle devolve o retorno ao web.
- Texto final dos selos e dos erros desta especificação (escolhidos por mim, a revisar).
- `ScopeList` com `status` (PR no design system).
- Publicação do `@ufba-app/web-ui` antes do deploy.
