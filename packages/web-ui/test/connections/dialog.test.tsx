import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { Button, Dialog, StepList } from '../../src';

const dialog = (onOpenChange = vi.fn()) => (
  <Dialog isOpen onOpenChange={onOpenChange} title="Conectar o SIGAA" actions={<Button>Conectar</Button>}>
    <p>Use o CPF e a senha do SIGAA.</p>
  </Dialog>
);

test('diálogo aberto tem papel e nome', () => {
  render(dialog());
  expect(screen.getByRole('dialog', { name: 'Conectar o SIGAA' })).toBeInTheDocument();
  expect(screen.getByText('Use o CPF e a senha do SIGAA.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Conectar' })).toBeInTheDocument();
});

test('Esc pede para fechar', async () => {
  const onOpenChange = vi.fn();
  render(dialog(onOpenChange));
  await userEvent.keyboard('{Escape}');
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test('fechado não renderiza', () => {
  render(
    <Dialog isOpen={false} onOpenChange={() => {}} title="Conectar o Moodle" actions={null}>
      <p>x</p>
    </Dialog>,
  );
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('StepList: ordem, números e passo feito', () => {
  render(
    <StepList
      steps={[
        { text: 'Navegador já permite os links do Moodle.', done: true },
        { text: 'Entre no AVA com a sua conta da UFBA.' },
        { text: 'Pronto, você volta para cá.' },
      ]}
    />,
  );
  const items = screen.getAllByRole('listitem');
  expect(items).toHaveLength(3);
  expect(items[0]).toHaveTextContent('Feito');
  expect(items[1]).toHaveTextContent('1Entre no AVA');
  expect(items[2]).toHaveTextContent('2Pronto');
});

test('sem violações de acessibilidade', async () => {
  const { baseElement } = render(dialog());
  expect(await axe(baseElement)).toHaveNoViolations();
});
