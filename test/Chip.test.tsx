import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { Chip, type ChipTone } from '../src';

test.each<[ChipTone, string]>([
  ['neutral', 'chip--secondary'],
  ['highlight', 'chip--highlight'],
  ['success', 'chip--success'],
  ['danger', 'chip--danger'],
  ['solid', 'chip--primary'],
])('tone %s', (t, cls) => {
  render(<Chip tone={t}>amanhã</Chip>);
  expect(screen.getByText('amanhã').closest('.chip')).toHaveClass(cls);
});

test('padrão é neutral', () => {
  render(<Chip>4º semestre</Chip>);
  expect(screen.getByText('4º semestre').closest('.chip')).toHaveClass('chip--secondary');
});

test('sem violações de acessibilidade', async () => {
  const { container } = render(<Chip tone="highlight">amanhã</Chip>);
  expect(await axe(container)).toHaveNoViolations();
});
