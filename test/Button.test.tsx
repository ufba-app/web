import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { Button, type ButtonVariant } from '../src';

test.each<[ButtonVariant, string]>([
  ['primary', 'button--primary'],
  ['outline', 'button--outline'],
  ['ghost', 'button--ghost'],
  ['danger', 'button--danger'],
])('variant %s', (v, cls) => {
  render(<Button variant={v}>Atualizar</Button>);
  expect(screen.getByRole('button', { name: 'Atualizar' })).toHaveClass(cls);
});

test('highlight usa a classe nova', () => {
  render(<Button variant="highlight">Entregar hoje</Button>);
  expect(screen.getByRole('button')).toHaveClass('button--highlight');
});

test('padrão é primary md', () => {
  render(<Button>Concluir e autorizar</Button>);
  expect(screen.getByRole('button')).toHaveClass('button--primary', 'button--md');
});

test('sem violações de acessibilidade', async () => {
  const { container } = render(<Button>Concluir e autorizar</Button>);
  expect(await axe(container)).toHaveNoViolations();
});
