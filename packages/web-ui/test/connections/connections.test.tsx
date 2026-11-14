import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { AccountRow, Button, RequestAccess, ServiceIcon, SourceCard } from '../../src';

test('SourceCard mostra título, descrição, estado e conteúdo extra', () => {
  render(
    <SourceCard
      icon={<ServiceIcon service="sigaa" />}
      title="SIGAA"
      description="CPF e senha · só leitura"
      action={<Button size="sm">Conectar</Button>}
    >
      <p>conteúdo</p>
    </SourceCard>,
  );
  expect(screen.getByRole('heading', { name: 'SIGAA' })).toBeInTheDocument();
  expect(screen.getByText('CPF e senha · só leitura')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Conectar' })).toBeInTheDocument();
  expect(screen.getByText('conteúdo')).toBeInTheDocument();
});

test.each([
  ['connected', 'Conectada', 'chip--success'],
  ['pending', 'Aguardando liberação', 'chip--warning'],
  ['expired', 'Acesso expirou', 'chip--danger'],
] as const)('AccountRow %s', (status, label, cls) => {
  render(<AccountRow email="marina.costa@gmail.com" status={status} />);
  expect(screen.getByText(label).closest('.chip')).toHaveClass(cls);
});

test('AccountRow remover chama onRemove; e-mail longo quebra linha', async () => {
  const onRemove = vi.fn();
  const email = 'nome.muito.longo.de.uma.conta.pessoal.do.google@gmail.com';
  render(<AccountRow email={email} status="connected" onRemove={onRemove} />);
  expect(screen.getByText(email)).toHaveClass('ufba-account__email');
  await userEvent.click(screen.getByRole('button', { name: `Remover ${email}` }));
  expect(onRemove).toHaveBeenCalledOnce();
});

test('RequestAccess não envia e-mail inválido e mostra o erro', async () => {
  const onRequest = vi.fn();
  render(<RequestAccess onRequest={onRequest} />);
  await userEvent.type(screen.getByLabelText('Gmail da outra conta'), 'marina');
  await userEvent.click(screen.getByRole('button', { name: 'Pedir acesso' }));
  expect(onRequest).not.toHaveBeenCalled();
  expect(screen.getByText('Digite um e-mail válido.')).toBeInTheDocument();
});

test('RequestAccess envia e-mail válido e limpa o campo', async () => {
  const onRequest = vi.fn();
  render(<RequestAccess onRequest={onRequest} />);
  const input = screen.getByLabelText('Gmail da outra conta');
  await userEvent.type(input, ' marina.costa@gmail.com ');
  await userEvent.click(screen.getByRole('button', { name: 'Pedir acesso' }));
  expect(onRequest).toHaveBeenCalledWith('marina.costa@gmail.com');
  expect(input).toHaveValue('');
});

test('sem violações de acessibilidade', async () => {
  const { container } = render(
    <SourceCard icon={<ServiceIcon service="classroom" />} title="Classroom" description="marina.costa@ufba.br">
      <AccountRow email="marina.costa@gmail.com" status="pending" note="Avisamos quando liberar." />
      <RequestAccess onRequest={() => {}} />
    </SourceCard>,
  );
  expect(await axe(container)).toHaveNoViolations();
});
