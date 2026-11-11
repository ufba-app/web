import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { PageHeader } from '../../src';

test('título é h1, com descrição e ações', () => {
  render(
    <PageHeader
      title="Bom dia, Marina."
      description="Quarta, 4 de novembro."
      actions={<button type="button">Atualizar</button>}
    />,
  );
  expect(screen.getByRole('heading', { level: 1, name: 'Bom dia, Marina.' })).toBeInTheDocument();
  expect(screen.getByText('Quarta, 4 de novembro.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Atualizar' })).toBeInTheDocument();
});

test('sem violações de acessibilidade', async () => {
  const { container } = render(<PageHeader title="Prazos" />);
  expect(await axe(container)).toHaveNoViolations();
});
