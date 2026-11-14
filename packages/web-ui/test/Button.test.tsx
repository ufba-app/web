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

test('danger-text usa a classe nova', () => {
  render(<Button variant="danger-text">Recusar</Button>);
  expect(screen.getByRole('button')).toHaveClass('button--danger-text');
});

test('padrão é primary md', () => {
  render(<Button>Concluir e autorizar</Button>);
  expect(screen.getByRole('button')).toHaveClass('button--primary', 'button--md');
});

test('sem violações de acessibilidade', async () => {
  const { container } = render(<Button>Concluir e autorizar</Button>);
  expect(await axe(container)).toHaveNoViolations();
});
