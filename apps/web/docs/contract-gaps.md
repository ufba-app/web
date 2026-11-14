# Lacunas de contrato

O contrato com a API é o `platform/docs/WEB-API.md` (branch `feat/web-api`). Este arquivo lista o que **não fecha** entre
ele, o design (canvas "ufba.app, Telas do app web") e o design system, e como o web contornou cada ponto. Os tipos e
schemas do contrato estão em `src/contract/`.

Estado em 2026-11-12: a API foi implementada e testada pelo backend, mas **o web ainda não foi testado com o login
real** (passa pelo Google e exige o André). Os testes de ponta a ponta contra a API real, `e2e/real-api.spec.ts`,
passaram enquanto ela esteve no ar e precisam ser repetidos quando ela voltar.

## Decisões que o contrato deixou implícitas

| Ponto | Como o web trata |
|---|---|
| `GET /authorize/requests/{id}` funciona sem sessão (`signedIn: false`, `sources: null`) | Combinado com o backend por mensagem; o `WEB-API.md` pode estar atrasado. O schema aceita as duas formas. |
| `409 request_already_used` não existe na prática: pedido já decidido devolve `404 request_not_found` | As telas tratam os dois, com textos diferentes. |
| Pedido de outra pessoa devolve `404 request_not_found` | Cai na tela "Pedido não encontrado". |
| Rotas HTML antigas do backend redirecionam para `/authorize/error?error=invalid_request&message=…` | A página existe e mostra o `message` só como texto. |
| `error_description` do login vem em pt-BR e com o e-mail recusado | Mostrado como veio. Sem texto, usa "Use o seu e-mail @ufba.br." |
| Esquema do Moodle: o contrato dá `web+ufba` no exemplo e devolve `scheme` em `/connections/moodle/start` | O web registra `web+ufba` já no passo "Permitir" (antes do `start`, que ainda não respondeu) e registra de novo se o `scheme` vier diferente. |

## O que o design pede e o contrato não tem

1. **Matrícula e curso no menu** (`222115043 · BCC`): `/me` só tem `id`, `email` e `name`. O menu mostra nome e e-mail.
   Exigiria ler o perfil no SIGAA.
2. **Classroom: "Pedir acesso" e "Aguardando liberação"**: não existe endpoint de pedir acesso nem estado pendente
   (os usuários de teste do app `guest` são adicionados à mão no Google). O web trocou por "Conectar outra conta"
   (`app=guest`) e "Conectar conta @ufba.br" (`app=ufba`), sem estado pendente.
3. **"Código" na tela "Algo deu errado"**: o formato `{ error, message }` não tem código de suporte. O web mostra o
   valor de `error` quando a API respondeu, e nada em falha de rede.
4. **Contador "4" ao lado de Prazos** no menu: não há dado. Foi omitido.

## Acrescentado sem estar no design

- **"Desconectar" no SIGAA e no Moodle** (com confirmação). O contrato tem `DELETE /connections/sigaa` e
  `/connections/moodle` (204, sem corpo) e o backend pediu para ligar, mas o design não tem esse botão. Foi acrescentado
  como botão discreto no cartão da fonte, só quando ela está conectada. **O André precisa rever o desenho** (texto,
  posição e confirmação em `src/components/DisconnectDialog.tsx`).

## O que o design system ainda não cobre

Itens para PRs no `ufba-app/design-system`:

1. **`ScopeList` só conhece conectado ou não**; a API devolve quatro estados (`connected`, `disconnected`,
   `password_required`, `reconnect_required`). O web usa um `SourcesList` provisório (`src/components/SourcesList.tsx`)
   com as mesmas classes. Sai quando o `ScopeList` ganhar `status`.
2. **`AppRow` ainda mostra a inicial do nome** quando não há logo (o `ClientRequest` já usa ícone genérico desde o PR #4).
   Em "Apps autorizados", um app sem nome mostra a inicial do domínio.
3. **`SourceCard` e `AppRow` usam `<h3>`** e a página vai de `h1` direto para `h3` (regra `heading-order` do axe). O web
   põe um `<h2>` visualmente oculto antes de cada lista.
4. **`.ufba-field` tem `flex: 1 1 240px`** (pensado para uma linha): numa coluna vira altura de 240px. O web corrige com
   `.web-label .ufba-field { flex: none }` em `src/styles.css`.
5. **O círculo amarelo do `AuthLayout` (`shape--dot`) cai sobre a frase "Só leitura…"** na tela Autorizar quando o
   título tem três linhas e a janela é baixa (visto a 1280×720). É posição fixa no CSS do design system.
6. **React Aria (`usePress`, dentro do HeroUI) injeta um `<style>` no `<head>`**, o que obriga a CSP a liberar esse
   estilo por hash (ver `Caddyfile`). Também avisa no console: "A PressResponder was rendered without a pressable child".

## Segurança e hospedagem (pendências)

- A imagem Docker e o `Caddyfile` **não foram testados** (sem Docker nem Caddy na máquina de desenvolvimento).
- O design system agora mora neste monorepo (`packages/web-ui`, `packages/tokens`, `workspace:*`): não há mais GitHub
  Packages nem token de build. Os Dockerfiles usam a raiz do repositório como contexto.
- A CSP de produção foi validada num navegador real contra o build (`e2e-prod/csp.spec.ts`): sem `unsafe-inline` nem
  `unsafe-eval`. A única exceção é o hash do `<style>` do React Aria; se o HeroUI mudar esse estilo, o teste falha e o
  hash do `Caddyfile` precisa ser atualizado.
- O zod 4 compila validadores com `new Function`, que a CSP proíbe; por isso `src/zodConfig.ts` liga o modo `jitless`
  e precisa ser o primeiro import de `src/main.tsx`.
- O Stryker precisa do TypeScript 5.9 (o 7 não expõe a API que ele usa) e dos plugins listados em
  `stryker.config.json` (o layout do pnpm não os acha sozinho).
