import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { AppRow, EmptyState, formatUsage, PageHeader } from '../../src';

const now = new Date('2026-11-11T15:00:00');

test.each([
  [new Date('2026-11-11T14:50:00'), 'usado há 10 min'],
  [new Date('2026-11-11T13:00:00'), 'usado há 2 h'],
  [new Date('2026-11-10T15:00:00'), 'usado há 1 dia'],
  [new Date('2026-11-05T15:00:00'), 'usado há 6 dias'],
  [new Date('2026-11-11T15:05:00'), 'usado agora'],
  [undefined, 'ainda não usado'],
])('formatUsage(%s)', (last, text) => {
  expect(formatUsage(last, now)).toBe(text);
});

test('AppRow: meta em pt-BR e Revogar só chama onRevoke', async () => {
  const onRevoke = vi.fn();
  render(
    <AppRow
      name="Claude"
      verified
      returnDomain="claude.ai"
      authorizedAt={new Date('2026-11-04T10:00:00')}
      lastUsedAt={new Date('2026-11-11T13:00:00')}
      now={now}
      onRevoke={onRevoke}
    />,
  );
  expect(screen.getByText('Verificado')).toBeInTheDocument();
  expect(screen.getByText(/Volta para/)).toHaveTextContent('Volta para claude.ai · autorizado em 4 nov · usado há 2 h');
  await userEvent.click(screen.getByRole('button', { name: 'Revogar Claude' }));
  expect(onRevoke).toHaveBeenCalledOnce();
});

test('AppRow não verificado mostra o selo de alerta', () => {
  render(<AppRow name="Assistente" returnDomain="x.exemplo.com" authorizedAt={now} now={now} onRevoke={() => {}} />);
  expect(screen.getByText('Não verificado').closest('.chip')).toHaveClass('chip--warning');
});

test('EmptyState e PageHeader com aside', () => {
  render(
    <>
      <PageHeader title="Apps autorizados" aside={<span>2 apps</span>} />
      <EmptyState title="Nenhum app autorizado" description="Quando você autorizar um app, ele aparece aqui." />
    </>,
  );
  expect(screen.getByRole('heading', { level: 1, name: 'Apps autorizados' })).toBeInTheDocument();
  expect(screen.getByText('2 apps')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Nenhum app autorizado' })).toBeInTheDocument();
});

test('painel segue o canvas: fundo de página, item atual em névoa', () => {
  const css = readFileSync(resolve(__dirname, '../../src/styles/app.css'), 'utf8');
  expect(css).toMatch(/\.ufba-shell \{[^}]*background: var\(--ufba-page\)/);
  expect(css).toMatch(/\.ufba-shell__nav \{[^}]*background: var\(--ufba-background\)/);
});

test('sem violações de acessibilidade', async () => {
  const { container } = render(
    <AppRow name="Claude" verified returnDomain="claude.ai" authorizedAt={now} now={now} onRevoke={() => {}} />,
  );
  expect(await axe(container)).toHaveNoViolations();
});
