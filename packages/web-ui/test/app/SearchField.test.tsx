import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { SearchField } from '../../src';

const ctrlK = (extra: KeyboardEventInit = { ctrlKey: true }) =>
  new KeyboardEvent('keydown', { key: 'k', cancelable: true, bubbles: true, ...extra });

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
  const ev = ctrlK();
  document.dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(true);
});

test('sem atalho não escuta nem mostra a tecla', () => {
  render(<SearchField shortcut={false} />);
  expect(screen.queryByText('Ctrl K')).toBeNull();
  const ev = ctrlK();
  document.dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(false);
});

test('listener sai ao desmontar', () => {
  const { unmount } = render(<SearchField />);
  unmount();
  const ev = ctrlK();
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
