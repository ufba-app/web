import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { formatSince, SyncStatus } from '../../src';

const at = (iso: string) => new Date(iso);

afterEach(() => {
  vi.useRealTimers();
});

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
  render(
    <SyncStatus lastSync={at('2026-11-04T10:40:00')} now={() => at('2026-11-04T10:52:40')} onRefresh={onRefresh} />,
  );
  expect(screen.getByText('Sincronizado há 12 min')).toBeInTheDocument();
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
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(screen.getByText('Sincronizado há 13 min')).toBeInTheDocument();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

test('sem violações de acessibilidade', async () => {
  const { container } = render(<SyncStatus lastSync={null} onRefresh={() => {}} />);
  expect(await axe(container)).toHaveNoViolations();
});

test('HTML do servidor não depende do relógio', async () => {
  const { renderToString } = await import('react-dom/server');
  const html = renderToString(<SyncStatus lastSync={at('2026-11-04T10:40:00')} onRefresh={() => {}} />);
  expect(html).toContain('Sincronizado');
  expect(html).not.toMatch(/há \d+|agora|em \d\d\//);
});

test('texto que muda a cada minuto não é região viva; o fim da atualização é anunciado', () => {
  const props = { lastSync: at('2026-11-04T10:40:00'), onRefresh: () => {} };
  const { rerender, container } = render(<SyncStatus {...props} isRefreshing />);
  expect(container.querySelector('.ufba-sync__text')).not.toHaveAttribute('aria-live');
  rerender(<SyncStatus {...props} isRefreshing={false} />);
  expect(screen.getByRole('status')).toHaveTextContent('Sincronização concluída');
});
