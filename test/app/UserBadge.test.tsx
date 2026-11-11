import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { initials, UserBadge } from '../../src';

test.each([
  ['Marina Costa', 'MC'],
  ['Marina', 'M'],
  ['  ana   maria  souza ', 'AS'],
  ['', '?'],
])('initials(%j) = %s', (n, i) => {
  expect(initials(n)).toBe(i);
});

test('mostra nome, detalhe e iniciais', () => {
  render(<UserBadge name="Marina Costa" detail="222115043, BCC" />);
  expect(screen.getByText('Marina Costa')).toBeInTheDocument();
  expect(screen.getByText('222115043, BCC')).toBeInTheDocument();
  expect(screen.getByText('MC')).toBeInTheDocument();
});

test('sem violações de acessibilidade', async () => {
  const { container } = render(<UserBadge name="Marina Costa" detail="222115043, BCC" />);
  expect(await axe(container)).toHaveNoViolations();
});
