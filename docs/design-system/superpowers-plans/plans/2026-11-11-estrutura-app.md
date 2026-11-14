# Estrutura de aplicação: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acrescentar ao `@ufba-app/web-ui` os componentes de estrutura da seção 4.2 da especificação: `AppShell`, `SideNav`, `SideNavGroup`, `SideNavItem`, `UserBadge`, `PageHeader`, `SyncStatus` e `SearchField`.

**Architecture:** Componentes React próprios em `packages/web-ui/src/components/app/`, montados sobre primitivos do HeroUI quando existe um (Avatar, Button, SearchField, Kbd). O estilo fica num arquivo novo, `src/styles/app.css`, com classes prefixadas `ufba-` dentro de `@layer components`, importado por `styles.css` depois de `components.css`. A medida de layout e os valores visuais vêm do artboard "Painel" do canvas de referência.

**Tech Stack:** o mesmo da fundação (React 19, HeroUI 3.2.7, Tailwind v4, Vitest + Testing Library + vitest-axe, tsup).

**Spec:** `docs/specs/2026-11-11-design-system-design.md` (seção 4.2, "Estrutura de aplicação")

## Global Constraints

- Tudo da fundação continua valendo: sem sombra, borda 1px `--ufba-border`, raio 20px nos cartões, foco pelo anel do HeroUI, alvo de toque mínimo 44px, texto pt-BR.
- Coluna de navegação com 240px; abaixo de 820px ela vira barra superior com botão de menu.
- Item de navegação: raio 12px, 14px de texto, item atual com fundo `--ufba-surface-soft` e peso 800, contador em 12px peso 700 cor `--ufba-muted`.
- Título de página em `h1`, Sora 800, 34px (28px abaixo de 820px); linha de apoio em `--ufba-muted`.
- Nenhum componente busca dados nem guarda estado de servidor: recebem valores por props e avisam por callbacks.
- Todo componente novo tem teste de comportamento e teste axe sem violações.

## Review Focus

1. **Celular sem acesso à navegação:** abaixo de 820px os links não podem sumir sem alternativa. Esperado: botão "Abrir menu" com `aria-expanded` que mostra a navegação. Teste na Task 1.
2. **Texto de sincronização congelado:** com a página aberta, "há 12 min" não pode ficar parado. Esperado: o texto se atualiza a cada minuto e o intervalo é limpo ao desmontar. Teste na Task 2.
3. **Relógio do servidor adiantado:** `lastSync` no futuro não pode virar "há -3 min". Esperado: "Sincronizado agora". Teste na Task 2.
4. **Ctrl K roubando o atalho de outro campo:** Esperado: Ctrl K ou ⌘ K foca a busca e cancela o atalho do navegador; o listener sai ao desmontar; `shortcut={false}` não registra nada. Teste na Task 3.
5. **Nome sem sobrenome ou vazio no `UserBadge`:** Esperado: "Marina" → "M", "" → "?", espaços extras ignorados. Teste na Task 1.

---

### Task 1: Navegação e casca da aplicação

**Files:**
- Create: `packages/web-ui/src/styles/app.css`
- Modify: `packages/web-ui/src/styles.css` (novo `@import "./styles/app.css";` por último)
- Modify: `packages/web-ui/test/styles.test.ts` (lista de imports esperada ganha `./styles/app.css` no fim)
- Create: `packages/web-ui/src/components/app/AppShell.tsx`, `SideNav.tsx`, `UserBadge.tsx`
- Modify: `packages/web-ui/src/index.ts`
- Test: `packages/web-ui/test/app/navigation.test.tsx`, `test/app/UserBadge.test.tsx`

**Interfaces:**
- Produces:
  - `AppShell(props: { sidebar: ReactNode; topBar?: ReactNode; children: ReactNode })`. Renderiza `div.ufba-shell` com a coluna `div.ufba-shell__nav` e `main.ufba-shell__main`. Abaixo de 820px mostra `div.ufba-shell__bar` com `topBar` e um `Button` "Abrir menu"/"Fechar menu" (`aria-expanded`, `aria-controls` apontando para a coluna). A coluna recebe `data-open="true"` quando aberta.
  - `SideNav(props: { brand?: ReactNode; footer?: ReactNode; children: ReactNode; 'aria-label'?: string })`: `<nav>` com rótulo padrão "Navegação principal".
  - `SideNavGroup(props: { label: string; children: ReactNode })`: `<section>` com o rótulo num `<h2 class="ufba-nav__group">` e os itens numa `<ul>`.
  - `SideNavItem(props: { href: string; icon?: ReactNode; count?: number | string; current?: boolean; as?: ElementType; children: ReactNode })`: `<li>` com o link (`as`, padrão `'a'`, para aceitar o `Link` do Next) e `aria-current="page"` quando `current`.
  - `UserBadge(props: { name: string; detail?: string; src?: string })`: `Avatar` do HeroUI com imagem opcional e as iniciais como fallback.
  - `initials(name: string): string`, exportada de `UserBadge.tsx`.

- [ ] **Step 1: Escrever os testes**

```tsx
// test/app/navigation.test.tsx
test('item atual tem aria-current e os outros não', () => {
  render(<SideNav><SideNavItem href="/" current>Painel</SideNavItem><SideNavItem href="/horario">Horário</SideNavItem></SideNav>);
  expect(screen.getByRole('link', { name: 'Painel' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Horário' })).not.toHaveAttribute('aria-current');
});
test('SideNav é um landmark nomeado', () => {
  render(<SideNav><SideNavItem href="/">Painel</SideNavItem></SideNav>);
  expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
});
test('grupo tem título e lista', () => {
  render(<SideNav><SideNavGroup label="Disciplinas de 2026.2"><SideNavItem href="/d/1">Banco de Dados</SideNavItem></SideNavGroup></SideNav>);
  expect(screen.getByRole('heading', { name: 'Disciplinas de 2026.2' })).toBeInTheDocument();
  expect(screen.getByRole('list')).toContainElement(screen.getByRole('link', { name: 'Banco de Dados' }));
});
test('contador aparece no item', () => {
  render(<SideNav><SideNavItem href="/prazos" count={4}>Prazos</SideNavItem></SideNav>);
  expect(screen.getByRole('link', { name: /Prazos/ })).toHaveTextContent('4');
});
test('as troca o elemento do link', () => {
  const Fake = (p: ComponentProps<'a'>) => <a data-fake="sim" {...p} />;
  render(<SideNav><SideNavItem href="/" as={Fake}>Painel</SideNavItem></SideNav>);
  expect(screen.getByRole('link', { name: 'Painel' })).toHaveAttribute('data-fake', 'sim');
});
test('botão de menu abre e fecha a navegação', async () => {
  render(<AppShell sidebar={<SideNav><SideNavItem href="/">Painel</SideNavItem></SideNav>}>conteúdo</AppShell>);
  const button = screen.getByRole('button', { name: 'Abrir menu' });
  expect(button).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(button);
  expect(screen.getByRole('button', { name: 'Fechar menu' })).toHaveAttribute('aria-expanded', 'true');
  expect(document.querySelector('.ufba-shell__nav')).toHaveAttribute('data-open', 'true');
});
test('conteúdo fica no main', () => {
  render(<AppShell sidebar={<span />}>conteúdo</AppShell>);
  expect(screen.getByRole('main')).toHaveTextContent('conteúdo');
});
test('sem violações de acessibilidade', async () => {
  const { container } = render(<AppShell sidebar={<SideNav brand="UFBA"><SideNavGroup label="Curso"><SideNavItem href="/" current>Painel</SideNavItem></SideNavGroup></SideNav>}><h1>Bom dia</h1></AppShell>);
  expect(await axe(container)).toHaveNoViolations();
});
```

```tsx
// test/app/UserBadge.test.tsx
test.each([['Marina Costa', 'MC'], ['Marina', 'M'], ['  ana   maria  souza ', 'AS'], ['', '?']])('initials(%j) = %s', (n, i) => {
  expect(initials(n)).toBe(i);
});
test('mostra nome, detalhe e iniciais', () => {
  render(<UserBadge name="Marina Costa" detail="222115043, BCC" />);
  expect(screen.getByText('Marina Costa')).toBeInTheDocument();
  expect(screen.getByText('222115043, BCC')).toBeInTheDocument();
  expect(screen.getByText('MC')).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ufba-app/web-ui test -- test/app test/styles.test.ts`
Expected: FAIL, componentes inexistentes e lista de imports diferente.

- [ ] **Step 3: Implementar `AppShell.tsx`, `SideNav.tsx`, `UserBadge.tsx` e `app.css`**

`app.css` em `@layer components`: `.ufba-shell` em grid de duas colunas (`240px minmax(0,1fr)`); `.ufba-shell__nav` com borda direita; `.ufba-shell__bar` escondido acima de 820px; abaixo de 820px uma coluna só, a barra aparece e `.ufba-shell__nav` só aparece com `[data-open="true"]`. `.ufba-nav__item` com os valores das Global Constraints e altura mínima de 44px; `.ufba-nav__group` em 13px `--ufba-muted`. O estado do menu fica em `useState` no `AppShell`.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @ufba-app/web-ui test`
Expected: PASS, todos os testes do pacote.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui
git commit -m "feat(web-ui): AppShell, SideNav e UserBadge"
```

### Task 2: Cabeçalho de página e estado de sincronização

**Files:**
- Create: `packages/web-ui/src/components/app/PageHeader.tsx`, `SyncStatus.tsx`, `formatSince.ts`
- Modify: `packages/web-ui/src/styles/app.css`, `packages/web-ui/src/index.ts`
- Test: `packages/web-ui/test/app/PageHeader.test.tsx`, `test/app/SyncStatus.test.tsx`

**Interfaces:**
- Consumes: `Button` da fundação.
- Produces:
  - `PageHeader(props: { title: ReactNode; description?: ReactNode; actions?: ReactNode })`: `<header class="ufba-page-header">` com `h1`, a descrição num `<p>` e as ações num grupo que quebra linha.
  - `formatSince(last: Date, now: Date): string`. Regras: diferença menor que 60 s, ou negativa, → `"Sincronizado agora"`; menor que 60 min → `"Sincronizado há N min"`; menor que 24 h → `"Sincronizado há N h"`; senão → `"Sincronizado em DD/MM"` (dia e mês do `last`, dois dígitos). N é arredondado para baixo.
  - `SyncStatus(props: { lastSync: Date | null; onRefresh: () => void; isRefreshing?: boolean; now?: () => Date })`. `lastSync` nulo → `"Ainda não sincronizado"`. Botão "Atualizar" (variante `outline`, tamanho `sm`); com `isRefreshing`, o botão fica `isPending` e o texto vira "Atualizando". Sem `now` injetado, re-renderiza a cada 60 s com `setInterval`, limpo ao desmontar. O texto fica numa região `aria-live="polite"`.

- [ ] **Step 1: Escrever os testes**

```tsx
// test/app/SyncStatus.test.tsx
const at = (iso: string) => new Date(iso);
test.each([
  ['2026-11-04T10:52:30', 'Sincronizado agora'],
  ['2026-11-04T10:40:00', 'Sincronizado há 12 min'],
  ['2026-11-04T07:10:00', 'Sincronizado há 3 h'],
  ['2026-11-02T09:00:00', 'Sincronizado em 02/11'],
  ['2026-11-04T10:55:00', 'Sincronizado agora'],
])('formatSince(%s)', (last, text) => {
  expect(formatSince(at(last), at('2026-11-04T10:52:40'))).toBe(text);
});
test('sem sincronização ainda', () => {
  render(<SyncStatus lastSync={null} onRefresh={() => {}} />);
  expect(screen.getByText('Ainda não sincronizado')).toBeInTheDocument();
});
test('botão chama onRefresh', async () => {
  const onRefresh = vi.fn();
  render(<SyncStatus lastSync={at('2026-11-04T10:40:00')} now={() => at('2026-11-04T10:52:40')} onRefresh={onRefresh} />);
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
  expect(onRefresh).toHaveBeenCalledOnce();
});
test('atualizando', () => {
  render(<SyncStatus lastSync={null} isRefreshing onRefresh={() => {}} />);
  expect(screen.getByRole('button', { name: /Atualizando/ })).toBeInTheDocument();
});
test('texto avança com o tempo e o intervalo é limpo', () => {
  vi.useFakeTimers({ now: at('2026-11-04T10:52:40') });
  const { unmount } = render(<SyncStatus lastSync={at('2026-11-04T10:40:00')} onRefresh={() => {}} />);
  expect(screen.getByText('Sincronizado há 12 min')).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(60_000); });
  expect(screen.getByText('Sincronizado há 13 min')).toBeInTheDocument();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});
test('sem violações de acessibilidade', async () => {
  const { container } = render(<SyncStatus lastSync={null} onRefresh={() => {}} />);
  expect(await axe(container)).toHaveNoViolations();
});
```

```tsx
// test/app/PageHeader.test.tsx
test('título é h1, com descrição e ações', () => {
  render(<PageHeader title="Bom dia, Marina." description="Quarta, 4 de novembro." actions={<button type="button">Atualizar</button>} />);
  expect(screen.getByRole('heading', { level: 1, name: 'Bom dia, Marina.' })).toBeInTheDocument();
  expect(screen.getByText('Quarta, 4 de novembro.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Atualizar' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ufba-app/web-ui test -- test/app`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implementar `formatSince.ts`, `SyncStatus.tsx`, `PageHeader.tsx` e os estilos em `app.css`**

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @ufba-app/web-ui test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui
git commit -m "feat(web-ui): PageHeader e SyncStatus"
```

### Task 3: Busca com atalho

**Files:**
- Create: `packages/web-ui/src/components/app/SearchField.tsx`
- Modify: `packages/web-ui/src/styles/app.css`, `packages/web-ui/src/index.ts`
- Test: `packages/web-ui/test/app/SearchField.test.tsx`

**Interfaces:**
- Consumes: `SearchField` e `Kbd` do HeroUI (o nosso reexporta com o mesmo nome; o do HeroUI é importado como `HeroSearchField`).
- Produces: `SearchField(props: { placeholder?: string; onSubmit?: (value: string) => void; shortcut?: boolean; 'aria-label'?: string })`. Padrões: `placeholder` "Buscar disciplina, tarefa, professor", `aria-label` "Buscar", `shortcut` `true`. Com atalho, mostra `Kbd` "Ctrl K" e escuta `keydown` no `document`: Ctrl+K ou Meta+K foca o campo e chama `preventDefault`. O listener sai ao desmontar. Enter chama `onSubmit` com o texto.

- [ ] **Step 1: Escrever os testes**

```tsx
// test/app/SearchField.test.tsx
test('Ctrl K e ⌘ K focam a busca', async () => {
  render(<SearchField />);
  await userEvent.keyboard('{Control>}k{/Control}');
  expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveFocus();
  (document.activeElement as HTMLElement).blur();
  await userEvent.keyboard('{Meta>}k{/Meta}');
  expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveFocus();
});
test('atalho cancela o comportamento padrão', () => {
  render(<SearchField />);
  const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true });
  document.dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(true);
});
test('sem atalho não escuta nem mostra a tecla', () => {
  render(<SearchField shortcut={false} />);
  expect(screen.queryByText('Ctrl K')).toBeNull();
  const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true });
  document.dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(false);
});
test('listener sai ao desmontar', () => {
  const { unmount } = render(<SearchField />);
  unmount();
  const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true });
  document.dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(false);
});
test('Enter envia o texto', async () => {
  const onSubmit = vi.fn();
  render(<SearchField onSubmit={onSubmit} />);
  await userEvent.type(screen.getByRole('searchbox'), 'grafos{Enter}');
  expect(onSubmit).toHaveBeenCalledWith('grafos');
});
test('sem violações de acessibilidade', async () => {
  const { container } = render(<SearchField />);
  expect(await axe(container)).toHaveNoViolations();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ufba-app/web-ui test -- test/app/SearchField.test.tsx`
Expected: FAIL, componente inexistente.

- [ ] **Step 3: Implementar `SearchField.tsx` e o estilo**

Campo com altura mínima de 44px e largura máxima de 320px; `Kbd` à direita.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @ufba-app/web-ui test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui
git commit -m "feat(web-ui): SearchField com atalho Ctrl K"
```

### Task 4: Documentação e versão

**Files:**
- Modify: `packages/web-ui/README.md` (seção "Estrutura de aplicação" com um exemplo de montagem do Painel: `AppShell` + `SideNav` + `PageHeader` com `SearchField` e `SyncStatus`, e a observação sobre `as={Link}` do Next)
- Modify: `packages/web-ui/test/exports.test.ts` (lista ganha os 8 componentes e `formatSince`)
- Create: `.changeset/estrutura-app.md` (`@ufba-app/web-ui`: minor)

- [ ] **Step 1: Atualizar o teste de exports e ver falhar só se faltar algo**

Run: `pnpm --filter @ufba-app/web-ui test -- test/exports.test.ts`
Expected: PASS (as Tasks 1 a 3 já exportam tudo; uma falha aqui aponta export esquecido).

- [ ] **Step 2: README e changeset**

- [ ] **Step 3: Verificação completa**

Run: `pnpm build && pnpm lint && pnpm typecheck && pnpm test`
Expected: tudo verde.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "docs(web-ui): estrutura de aplicação no README e changeset"
```
