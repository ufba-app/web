import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import { authorizeRequestFixture } from '../contract/fixtures';
import { API, server } from '../test/server';
import { meHandler, mockLocationAssign, renderAuthApp, signedOutMeHandler } from '../test/render';

describe('/sign-in', () => {
  it('mostra o login e leva para a API com PKCE ao clicar', async () => {
    const assign = mockLocationAssign();
    server.use(signedOutMeHandler());
    renderAuthApp('/sign-in');

    await userEvent.click(await screen.findByRole('button', { name: /entrar com google/i }));

    await waitFor(() => expect(assign).toHaveBeenCalledOnce());
    const target = new URL(assign.mock.calls[0]?.[0] as string);
    expect(target.pathname).toBe('/authorize');
    expect(target.searchParams.get('client_id')).toBe('ufba-web');
    expect(target.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('vindo de um cliente, diz quem pede acesso antes do login', async () => {
    server.use(
      signedOutMeHandler(),
      http.get(`${API}/authorize/requests/req-1`, () =>
        HttpResponse.json({
          id: 'req-1',
          client: {
            domain: 'claude.ai',
            redirectUri: 'https://claude.ai/cb',
            name: 'Claude',
            logoUrl: null,
            verified: true,
            metadata: 'present',
          },
          signedIn: false,
          sources: null,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      ),
    );
    renderAuthApp(`/sign-in?return=${encodeURIComponent('/authorize?request=req-1')}`);
    expect(await screen.findByText(/quer acessar seus dados acadêmicos/i)).toBeInTheDocument();
    expect(screen.getByText('Claude')).toBeInTheDocument();
  });

  it('sem nome nos metadados, usa o domínio do app', async () => {
    server.use(
      signedOutMeHandler(),
      http.get(`${API}/authorize/requests/req-2`, () =>
        HttpResponse.json({
          id: 'req-2',
          client: { domain: 'estudos.exemplo.com', redirectUri: 'https://x/cb', name: null, logoUrl: null, verified: false, metadata: 'absent' },
          signedIn: false,
          sources: null,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      ),
    );
    renderAuthApp(`/sign-in?return=${encodeURIComponent('/authorize?request=req-2')}`);
    expect(await screen.findByText('estudos.exemplo.com')).toBeInTheDocument();
  });

  it('mostra como veio o erro de conta fora do @ufba.br e oferece outra conta', async () => {
    server.use(signedOutMeHandler());
    const text = 'marina.costa@gmail.com não é um e-mail @ufba.br. Entre com a sua conta institucional.';
    // O erro chega pelo estado de navegação: a página de retorno do login redireciona para cá com ele.
    renderAuthApp({ pathname: '/sign-in', state: { authError: text } });
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('button', { name: /usar outra conta/i })).toBeInTheDocument();
  });

  it('já logado, vai direto para o destino no painel', async () => {
    const assign = mockLocationAssign();
    server.use(meHandler());
    renderAuthApp('/sign-in?return=/connections');
    await waitFor(() => expect(assign).toHaveBeenCalledWith('http://localhost:3001/connections'));
  });

  it('já logado, vindo de um pedido de app, continua no auth', async () => {
    const assign = mockLocationAssign();
    server.use(
      meHandler(),
      http.get(`${API}/authorize/requests/req-1`, () => HttpResponse.json(authorizeRequestFixture())),
    );
    renderAuthApp(`/sign-in?return=${encodeURIComponent('/authorize?request=req-1')}`);
    // Termina no /authorize do próprio auth (sem sair para o painel). O cache de teste não guarda dados (gcTime 0),
    // então a tela pode piscar o skeleton ao trocar de página; por isso o waitFor.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Autorizar' })).toBeInTheDocument(), { timeout: 5000 });
    expect(assign).not.toHaveBeenCalled();
  });

  it.each([['https://evil.example/x'], ['//evil.example/x'], ['/\\evil.example'], ['javascript:alert(1)']])(
    'ignora retorno %j: vai para o padrão do painel, nunca para fora',
    async (value) => {
      const assign = mockLocationAssign();
      server.use(meHandler());
      renderAuthApp(`/sign-in?return=${encodeURIComponent(value)}`);
      await waitFor(() => expect(assign).toHaveBeenCalledWith('http://localhost:3001/connections'));
    },
  );

  it('não tem violações de acessibilidade', async () => {
    server.use(signedOutMeHandler());
    const { container } = renderAuthApp('/sign-in');
    await screen.findByRole('button', { name: /entrar com google/i });
    expect(await axe(container)).toHaveNoViolations();
  });
});
