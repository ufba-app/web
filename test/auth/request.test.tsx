import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { AccountLine, ClientRequest, Notice, ScopeList } from '../../src';

test('app verificado: selo e domínio de retorno', () => {
  render(<ClientRequest name="Claude" verified returnDomain="claude.ai" />);
  expect(screen.getByText('Claude')).toBeInTheDocument();
  expect(screen.getByText('Verificado')).toBeInTheDocument();
  expect(screen.getByText('claude.ai')).toBeInTheDocument();
  expect(screen.queryByText(/não verificado/i)).toBeNull();
});

test('app não verificado com nome de app conhecido: sem selo, com aviso e domínio', () => {
  render(<ClientRequest name="Claude" returnDomain="claude-login.exemplo.com" />);
  expect(screen.queryByText('Verificado')).toBeNull();
  expect(screen.getByText(/App não verificado/)).toBeInTheDocument();
  expect(screen.getByText('claude-login.exemplo.com')).toBeInTheDocument();
});

test('sem logo mostra o ícone genérico, nunca a inicial do nome', () => {
  const { container } = render(<ClientRequest name="assistente" returnDomain="x.exemplo.com" />);
  expect(container.querySelector('.ufba-request__generic svg')).toHaveAttribute('aria-hidden', 'true');
  expect(screen.queryByText('A')).toBeNull();
});

test('app não verificado também mostra o logo que a API entregou', () => {
  render(
    <ClientRequest
      name="Assistente"
      logo={<img src="/client-logos/abc.png" alt="" />}
      returnDomain="x.exemplo.com"
    />,
  );
  expect(document.querySelector('.ufba-request__logo img')).toHaveAttribute('src', '/client-logos/abc.png');
  expect(document.querySelector('.ufba-request__generic')).toBeNull();
  expect(screen.getByText(/App não verificado/)).toBeInTheDocument();
});

test('sem nome, o título é o domínio', () => {
  render(<ClientRequest name={null} returnDomain="x.exemplo.com" />);
  expect(document.querySelector('.ufba-request__name')).toHaveTextContent('x.exemplo.com');
});

test('nome só de espaços também cai no domínio', () => {
  render(<ClientRequest name="   " returnDomain="x.exemplo.com" />);
  expect(document.querySelector('.ufba-request__name')).toHaveTextContent('x.exemplo.com');
});

test('o domínio de retorno tem o mesmo destaque, verificado ou não', () => {
  const { rerender, container } = render(<ClientRequest name="Claude" verified returnDomain="claude.ai" />);
  const verified = container.querySelector('.ufba-request__return')?.className;
  rerender(<ClientRequest name="Claude" returnDomain="claude.ai" />);
  expect(container.querySelector('.ufba-request__return')?.className).toBe(verified);
});

test('o selo Verificado independe de ter nome ou logo', () => {
  render(<ClientRequest verified returnDomain="claude.ai" />);
  expect(screen.getByText('Verificado')).toBeInTheDocument();
});

test('ScopeList mostra cada fonte com o estado', () => {
  render(
    <ScopeList
      items={[
        { service: 'sigaa', connected: true },
        { service: 'moodle', connected: false },
      ]}
    />,
  );
  expect(screen.getByText('Vai ver')).toBeInTheDocument();
  expect(screen.getByRole('listitem', { name: /SIGAA/ })).toHaveTextContent('Conectado');
  expect(screen.getByRole('listitem', { name: /Moodle/ })).toHaveTextContent('Não conectado');
});

test('AccountLine mostra o e-mail e troca de conta', async () => {
  const onSwitch = vi.fn();
  render(<AccountLine email="marina.costa@ufba.br" onSwitch={onSwitch} />);
  expect(screen.getByText('marina.costa@ufba.br')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Trocar conta' }));
  expect(onSwitch).toHaveBeenCalledOnce();
});

test('Notice de perigo é um alerta; os outros não', () => {
  const { rerender } = render(<Notice tone="danger">Essa conta não é @ufba.br.</Notice>);
  expect(screen.getByRole('alert')).toHaveTextContent('Essa conta não é @ufba.br.');
  rerender(<Notice tone="info">Sem fontes conectadas.</Notice>);
  expect(screen.queryByRole('alert')).toBeNull();
});

test('sem violações de acessibilidade', async () => {
  const { container } = render(
    <div>
      <ClientRequest name="Assistente" returnDomain="x.exemplo.com" />
      <ScopeList items={[{ service: 'classroom', connected: true }]} />
      <Notice tone="warning">Atenção.</Notice>
      <AccountLine email="marina.costa@ufba.br" onSwitch={() => {}} />
    </div>,
  );
  expect(await axe(container)).toHaveNoViolations();
});
