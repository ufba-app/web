import { render, screen } from '@testing-library/react';
import { Card, Chip } from '../src';

test('Card renderiza com a classe .card que o tema sobrescreve', () => {
  render(<Card><Card.Content>conteúdo</Card.Content></Card>);
  expect(screen.getByText('conteúdo').closest('.card')).not.toBeNull();
});

test('Chip de tom success usa a variante .chip--soft', () => {
  render(<Chip tone="success">subiu 0,1</Chip>);
  expect(screen.getByText('subiu 0,1').closest('.chip')).toHaveClass('chip--soft');
});
