import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { authorizeRequestFixture } from '../contract/fixtures';
import { API, server } from '../test/server';
import { meHandler, mockLocationAssign, renderAuthApp, signedOutMeHandler } from '../test/render';

function seed(returnTo = '/connections') {
  window.sessionStorage.setItem('ufba.pkce.state', 'state-1');
  window.sessionStorage.setItem('ufba.pkce.verifier', 'verifier-1');
  window.sessionStorage.setItem('ufba.pkce.return', returnTo);
}

describe('/sign-in/callback', () => {
  it('troca o code, limpa a barra de endereço e segue para o destino guardado', async () => {
    seed('/connections');
    let sessionBody: unknown;
    const replace = vi.spyOn(window.history, 'replaceState');
    server.use(
      http.post(`${API}/session`, async ({ request }) => {
        sessionBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
      meHandler(),
    );
    // O jsdom começa em "/": a página lê o code da barra de endereço real.
    window.history.pushState(null, '', '/sign-in/callback?code=the-code&state=state-1');
    // O espião copia `window.location`: precisa vir depois do pushState, para a cópia já ter o code na URL.
    const assign = mockLocationAssign();

    renderAuthApp('/sign-in/callback');

    // O painel é outro app: a volta do login sai do auth com a origem fixa do build.
    await waitFor(() => expect(assign).toHaveBeenCalledWith('http://localhost:3001/connections'));
    expect(sessionBody).toMatchObject({ code: 'the-code', codeVerifier: 'verifier-1' });
    expect(replace).toHaveBeenCalledWith(null, '', '/sign-in/callback');
    replace.mockRestore();
  });

  it('destino /authorize?request=… continua dentro do auth, sem sair para o painel', async () => {
    seed('/authorize?request=req-1');
    server.use(
      http.post(`${API}/session`, () => new HttpResponse(null, { status: 204 })),
      meHandler(),
      http.get(`${API}/authorize/requests/req-1`, () =>
        HttpResponse.json({ ...authorizeRequestFixture(), id: 'req-1' }),
      ),
    );
    window.history.pushState(null, '', '/sign-in/callback?code=the-code&state=state-1');
    const assign = mockLocationAssign();

    renderAuthApp('/sign-in/callback');

    expect(await screen.findByRole('button', { name: 'Autorizar' }, { timeout: 5000 })).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it.each([['//evil.example/x'], ['/\\evil.example'], ['https://evil.example/x'], ['javascript:alert(1)']])(
    'destino guardado %j nunca leva para fora do painel',
    async (returnTo) => {
      seed(returnTo);
      server.use(http.post(`${API}/session`, () => new HttpResponse(null, { status: 204 })), meHandler());
      window.history.pushState(null, '', '/sign-in/callback?code=the-code&state=state-1');
      const assign = mockLocationAssign();

      renderAuthApp('/sign-in/callback');

      await waitFor(() => expect(assign).toHaveBeenCalledWith('http://localhost:3001/connections'));
    },
  );

  it('state errado: não chama a API e volta ao login com aviso', async () => {
    seed();
    const spy = vi.fn();
    server.use(
      http.post(`${API}/session`, () => (spy(), new HttpResponse(null, { status: 204 }))),
      signedOutMeHandler(),
    );
    window.history.pushState(null, '', '/sign-in/callback?code=x&state=outro');

    renderAuthApp('/sign-in/callback');

    expect(await screen.findByRole('alert')).toHaveTextContent(/não deu para confirmar o login/i);
    expect(spy).not.toHaveBeenCalled();
  });

  it('erro do Google/API aparece como veio, em pt-BR', async () => {
    seed();
    server.use(signedOutMeHandler());
    const text = 'marina.costa@gmail.com não é um e-mail @ufba.br. Entre com a sua conta institucional.';
    window.history.pushState(null, '', `/sign-in/callback?error=access_denied&error_description=${encodeURIComponent(text)}`);

    renderAuthApp('/sign-in/callback');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(text));
  });
});
