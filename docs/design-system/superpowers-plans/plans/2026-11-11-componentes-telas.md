# Componentes das telas aprovadas: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar para `@ufba-app/tokens` e `@ufba-app/web-ui` as decisões das telas aprovadas e criar só os componentes que elas usam.

**Architecture:** Mesma estrutura dos planos anteriores: valores em `packages/tokens`, tema em `packages/web-ui/src/styles`, componentes próprios em `packages/web-ui/src/components/<grupo>/` com classes `ufba-` em `@layer components`. Os ícones dos serviços entram como SVG dentro do pacote.

**Tech Stack:** o mesmo da fundação (React 19, HeroUI 3.2.7, Tailwind v4, Vitest + Testing Library + vitest-axe, tsup).

**Spec:** `docs/specs/2026-11-11-design-system-design.md`
**Referência visual (binding):** canvas "ufba.app — Telas do app web" (https://claude.ai/artifact/GKaZc8Csn4nrxnxq9pTo8M), linhas 1 a 5, aprovadas em 11/11/2026. Onde o canvas e a especificação divergem, vale o canvas.

## Global Constraints

- Cores novas aprovadas no canvas: fundo de página `#e3e8f6`; borda de cartão `#d3d9ec`; alerta `#8a5a00` sobre `#fff1cc`. As anteriores continuam (marinho `#1b2a7a`, amarelo `#ffc93c`, névoa `#eef1fb`, `#4d5680`, verde e vermelho).
- O amarelo da marca não é cor de estado: fica para grafismo e informação do app (contador). Estados usam verde (ok), vermelho (problema) e alerta (espera).
- Botão secundário e campos: borda de 1,5px no marinho. Cartões: borda de 1px `#d3d9ec`, sem sombra.
- Ação negativa ("Recusar", "Revogar") é texto vermelho sem fundo; a confirmação destrutiva é vermelho cheio.
- Navegação lateral branca com borda; item atual em névoa e peso 800; perfil no rodapé separado por linha.
- Textos curtos, como no canvas. Todo componente novo tem teste de comportamento e axe.

## Mudanças de interface (quebram compatibilidade, versão 0.x)

- `Button`: sai `variant="highlight"` (amarelo como ação viola a regra de cor); entra `variant="danger-text"`.
- `Chip`: `tone="highlight"` passa a ser só para informação do app; entra `tone="warning"` (alerta).

## Review Focus

1. **Ícone do serviço sem texto:** um `ServiceIcon` sozinho precisa de nome acessível. Esperado: `aria-label` com o nome do serviço quando não há texto ao lado; `aria-hidden` quando há. Teste na Task 2.
2. **Diálogo e foco:** abrir o diálogo move o foco para dentro, Esc fecha, o foco volta ao botão que abriu. Esperado: herdado do `Modal` do HeroUI e testado. Teste na Task 5.
3. **App não verificado com nome falso:** o selo e o domínio de retorno precisam aparecer mesmo quando o nome imita um app verificado. Esperado: `ClientRequest` sempre mostra o domínio; o selo "Verificado" só com `verified`. Teste na Task 3.
4. **Lista de contas pessoais longa:** e-mails longos não podem empurrar o botão para fora do cartão. Esperado: texto quebra, botão fica visível. Teste por classe na Task 4.
5. **Revogar por engano:** o botão "Revogar" da lista não revoga sozinho; ele chama `onRevoke` e quem decide é o diálogo de confirmação. Teste na Task 6.

---

### Task 1: Tokens e tema

**Files:** `packages/tokens/src/color.ts`, `packages/tokens/test/*.ts`, `packages/web-ui/src/styles/theme.css`, `src/styles/components.css`, `src/components/Button.tsx`, `src/components/Chip.tsx`, testes correspondentes.

**Produces:** tokens `page` (`#e3e8f6`), `cardBorder` (`#d3d9ec`), `warning` (`#8a5a00`), `warningSoft` (`#fff1cc`) e variáveis `--ufba-page`, `--ufba-card-border`, `--ufba-warning`, `--ufba-warning-soft`; `ButtonVariant` = `'primary' | 'outline' | 'ghost' | 'danger' | 'danger-text'`; `ChipTone` = `'neutral' | 'highlight' | 'success' | 'warning' | 'danger' | 'solid'`.

- [ ] Testes: cores novas no `color`; contraste de `warning` sobre `warningSoft` ≥ 4,5:1; `--ufba-page` no CSS gerado; `danger-text` gera a classe `button--danger-text`; `tone="warning"` gera `chip--warning`; `highlight` não existe mais no `Button` (tipo); `.button--outline` e `.input` com borda 1,5px `--ufba-foreground` em `components.css`; `.card` com borda `--ufba-card-border`.
- [ ] Rodar e ver falhar; implementar; rodar e ver passar; commit `feat(tokens,web-ui): cores e bordas das telas aprovadas`.

### Task 2: Ícones dos serviços e casca da autenticação

**Files:** `src/components/auth/ServiceIcon.tsx` (+ `src/assets/{sigaa,moodle,classroom,google}.tsx` com os SVGs do canvas), `src/components/auth/AuthLayout.tsx`, `src/styles/auth.css`, testes.

**Produces:**
- `ServiceIcon({ service: 'sigaa' | 'moodle' | 'classroom' | 'google'; size?: number; label?: string })`.
- `AuthLayout({ headline: ReactNode; subline?: ReactNode; sources?: Array<'sigaa'|'moodle'|'classroom'>; children: ReactNode; below?: ReactNode })`: bloco marinho com o sol, o anel e o ponto, marca "ufba.app", título, apoio e pílulas das fontes; à direita, fundo de página com o cartão (`children`) e, abaixo dele, `below` (linha da conta). Abaixo de 820px só o cartão, com "ufba.app" acima.

- [ ] Testes: cada serviço renderiza um `svg`/`img` com nome acessível quando `label`; `AuthLayout` tem `main` com o cartão, o título no bloco, as pílulas com os nomes e `below` fora do cartão; axe.
- [ ] Implementar; commit `feat(web-ui): ServiceIcon e AuthLayout`.

### Task 3: Pedido de autorização

**Files:** `src/components/auth/ClientRequest.tsx`, `src/components/auth/ScopeList.tsx`, `src/components/auth/AccountLine.tsx`, `src/components/Notice.tsx`, testes.

**Produces:**
- `ClientRequest({ name: string; logo?: ReactNode; verified?: boolean; returnDomain: string })`: logo ou inicial, nome, selo "Verificado", "quer acessar seus dados acadêmicos" e "Volta para <domínio>" (destacado quando não verificado, junto com o aviso de alerta).
- `ScopeList({ items: Array<{ service; connected: boolean }> })`: "Vai ver" com ícone e selo "Conectado"/"Não conectado".
- `AccountLine({ email: string; onSwitch?: () => void })`: "Como <email>" e "Trocar conta".
- `Notice({ tone: 'info' | 'warning' | 'danger'; children })`: aviso em linha, `role="alert"` em `danger`.

- [ ] Testes: domínio sempre visível; selo só com `verified`; aviso de não verificado quando `verified` é falso; `Notice` com papel certo; axe.
- [ ] Implementar; commit `feat(web-ui): ClientRequest, ScopeList, AccountLine e Notice`.

### Task 4: Conexões

**Files:** `src/components/connections/SourceCard.tsx`, `AccountRow.tsx`, `RequestAccess.tsx`, `src/styles/connections.css`, testes.

**Produces:**
- `SourceCard({ icon: ReactNode; title: string; description: string; status?: ReactNode; action?: ReactNode; children?: ReactNode })`.
- `AccountRow({ email: string; note?: string; status: 'connected' | 'pending' | 'expired'; onRemove?: () => void })`: selo verde, alerta ou vermelho.
- `RequestAccess({ onRequest: (email: string) => void })`: campo de Gmail com rótulo acessível e botão "Pedir acesso"; valida formato antes de chamar.

- [ ] Testes: status → selo e texto certos; `RequestAccess` não chama `onRequest` com e-mail inválido e mostra o erro; e-mail longo com a classe que quebra linha; axe.
- [ ] Implementar; commit `feat(web-ui): SourceCard, AccountRow e RequestAccess`.

### Task 5: Diálogo e passo a passo

**Files:** `src/components/Dialog.tsx` (sobre o `Modal` do HeroUI), `src/components/connections/StepList.tsx`, testes.

**Produces:**
- `Dialog({ isOpen; onOpenChange; icon?: ReactNode; title: string; children; actions: ReactNode })`.
- `StepList({ steps: Array<{ text: string; done?: boolean; action?: ReactNode }> })`: números em névoa, passo feito com check verde.

- [ ] Testes: diálogo aberto tem `role="dialog"` com o título como nome; Esc chama `onOpenChange(false)`; passos numerados na ordem e o feito marcado; axe.
- [ ] Implementar; commit `feat(web-ui): Dialog e StepList`.

### Task 6: Apps autorizados e ajustes do painel

**Files:** `src/components/apps/AppRow.tsx`, `src/components/EmptyState.tsx`, ajustes em `src/styles/app.css` (navegação e perfil conforme o canvas) e `PageHeader` (slot `aside` para o contador), testes.

**Produces:**
- `AppRow({ name; logo?; verified?: boolean; returnDomain; authorizedAt: Date; lastUsedAt?: Date; onRevoke: () => void })`: meta "Volta para … · autorizado em … · usado há …"; "Revogar" em `danger-text`.
- `EmptyState({ title: string; description?: string; action?: ReactNode })`.
- `PageHeader` ganha `aside?: ReactNode`.

- [ ] Testes: `Revogar` chama `onRevoke` e nada mais; datas formatadas em pt-BR; `aside` renderiza; axe.
- [ ] Implementar; commit `feat(web-ui): AppRow, EmptyState e ajustes do painel`.

### Task 7: Documentação e versão

- [ ] README do `web-ui`: seções "Autenticação", "Conexões", "Apps autorizados", com um exemplo de cada tela montada; regra das cores de estado; mudanças de interface do `Button` e do `Chip`.
- [ ] Changeset `minor` para os dois pacotes.
- [ ] `pnpm build && pnpm lint && pnpm typecheck && pnpm test` verde; commit `docs(web-ui): componentes das telas e changeset`.
