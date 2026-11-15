import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { AuthorizeRequest } from '../contract';
import { authorizeRequestFixture, meFixture } from '../contract/fixtures';
import * as pairing from '../components/passkey/usePairing';
import * as flows from '../lib/passkey/flows';
import { notify } from '../lib/notify';
import * as webauthn from '../lib/passkey/webauthn';
import { meHandler, mockLocationAssign, renderAuthApp, signedOutMeHandler } from '../test/render';
import { API, server } from '../test/server';

vi.mock('../components/passkey/usePairing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/passkey/usePairing')>()),
  usePairing: vi.fn(),
}));
vi.mock('../lib/passkey/webauthn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/passkey/webauthn')>()),
  looksLikePhone: vi.fn(),
}));
vi.mock('../lib/passkey/flows', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/passkey/flows')>()),
  unlockWithPasskey: vi.fn(),
}));

const wire = (r: AuthorizeRequest) => ({ ...r });

function mockRequest(request: AuthorizeRequest) {
  server.use(http.get(`${API}/authorize/requests/${request.id}`, () => HttpResponse.json(wire(request))));
}

function mockError(id: string, status: number, error: string, message = 'Mensagem da API.') {
  server.use(http.get(`${API}/authorize/requests/${id}`, () => HttpResponse.json({ error, message }, { status })));
}

describe('/authorize', () => {
  beforeEach(() => {
    server.use(meHandler());
    vi.mocked(webauthn.looksLikePhone).mockReturnValue(false);
    vi.mocked(pairing.usePairing).mockReturnValue({
      status: 'waiting',
      url: 'http://localhost:3001/pair#AAECAwQFBgcICQoLDA0ODw.x',
      secondsLeft: 292,
      fraction: 0.97,
      message: null,
      regenerate: vi.fn(),
    });
  });

  it('app verificado: nome, selo, domínio, fontes e a conta em uso', async () => {
    mockRequest(authorizeRequestFixture());
    renderAuthApp('/authorize?request=req-1');

    expect(await screen.findByText('Claude')).toBeInTheDocument();
    expect(screen.getByText('Verificado')).toBeInTheDocument();
    expect(screen.getByText('claude.ai')).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: /SIGAA: Conectado/ })).toBeInTheDocument();
    expect(screen.getByText('marina.costa@ufba.br')).toBeInTheDocument();
    expect(screen.queryByText(/app não verificado/i)).toBeNull();
  });

  it('conta sem e-mail (a API pode mandar email: null) ainda mostra a tela, sem quebrar', async () => {
    server.use(meHandler({ ...meFixture(), email: null }));
    mockRequest(authorizeRequestFixture());
    renderAuthApp('/authorize?request=req-1');

    expect(await screen.findByText('Claude')).toBeInTheDocument();
    expect(screen.getByText('sua conta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Autorizar' })).toBeInTheDocument();
  });

  it('app sem metadados e sem selo: o título é o domínio, com aviso e ícone genérico', async () => {
    mockRequest(
      authorizeRequestFixture({
        client: {
          domain: 'estudos.exemplo.com',
          redirectUri: 'https://estudos.exemplo.com/cb',
          name: null,
          logoUrl: null,
          verified: false,
          metadata: 'absent',
        },
      }),
    );
    const { container } = renderAuthApp('/authorize?request=req-1');

    expect(await screen.findByText(/app não verificado/i)).toBeInTheDocument();
    expect(container.querySelector('.ufba-request__name')).toHaveTextContent('estudos.exemplo.com');
    expect(container.querySelector('.ufba-request__generic')).not.toBeNull();
    expect(screen.queryByText('Verificado')).toBeNull();
  });

  it('mostra o logo que vem da própria API, também para app não verificado', async () => {
    mockRequest(
      authorizeRequestFixture({
        client: {
          domain: 'estudos.exemplo.com',
          redirectUri: 'https://x/cb',
          name: 'Assistente',
          logoUrl: `${API}/client-logos/abc`,
          verified: false,
          metadata: 'present',
        },
      }),
    );
    const { container } = renderAuthApp('/authorize?request=req-1');
    await screen.findByText('Assistente');
    expect(container.querySelector('.ufba-request__logo img')).toHaveAttribute('src', `${API}/client-logos/abc`);
  });

  it('não carrega logo de outro servidor, mesmo que a API mande', async () => {
    mockRequest(
      authorizeRequestFixture({
        client: {
          domain: 'estudos.exemplo.com',
          redirectUri: 'https://x/cb',
          name: 'Assistente',
          logoUrl: 'https://evil.example/logo.png',
          verified: false,
          metadata: 'present',
        },
      }),
    );
    const { container } = renderAuthApp('/authorize?request=req-1');
    await screen.findByText('Assistente');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.ufba-request__generic')).not.toBeNull();
  });

  it('Autorizar manda o POST com os headers de CSRF e navega para o redirectTo, sem alterá-lo', async () => {
    const assign = mockLocationAssign();
    mockRequest(authorizeRequestFixture());
    let headers: Headers | undefined;
    let body: unknown;
    server.use(
      http.post(`${API}/authorize/requests/req-1/approve`, async ({ request }) => {
        headers = request.headers;
        body = await request.json();
        return HttpResponse.json({ redirectTo: 'https://claude.ai/api/mcp/auth_callback?code=abc&state=xyz' });
      }),
    );
    renderAuthApp('/authorize?request=req-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Autorizar' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?code=abc&state=xyz'));
    expect(body).toEqual({});
    expect(headers?.get('x-ufba')).toBe('1');
    expect(headers?.get('content-type')).toBe('application/json');
  });

  it('Recusar usa o endpoint de deny', async () => {
    const assign = mockLocationAssign();
    mockRequest(authorizeRequestFixture());
    server.use(
      http.post(`${API}/authorize/requests/req-1/deny`, () =>
        HttpResponse.json({ redirectTo: 'https://claude.ai/cb?error=access_denied&state=xyz' }),
      ),
    );
    renderAuthApp('/authorize?request=req-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Recusar' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://claude.ai/cb?error=access_denied&state=xyz'));
  });

  it('recusa redirectTo que executaria código e avisa, sem navegar', async () => {
    const assign = mockLocationAssign();
    mockRequest(authorizeRequestFixture());
    server.use(
      http.post(`${API}/authorize/requests/req-1/approve`, () => HttpResponse.json({ redirectTo: 'javascript:alert(1)' })),
    );
    renderAuthApp('/authorize?request=req-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Autorizar' }));

    // Falha de evento: vai como toast (o provider real não roda no jsdom; o teste confere o pedido de aviso).
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith(expect.stringMatching(/inesperado/i)));
    expect(assign).not.toHaveBeenCalled();
    // E dá para tentar de novo: os botões voltam a ficar ativos.
    expect(screen.getByRole('button', { name: 'Autorizar' })).toBeEnabled();
  });

  it('no computador, SIGAA pedindo senha: o bloco do QR vem (sem a dica repetida) e a autorização segue livre', async () => {
    mockRequest(
      authorizeRequestFixture({
        sources: [
          { source: 'sigaa', status: 'password_required' },
          { source: 'moodle', status: 'connected' },
          { source: 'classroom', status: 'connected' },
        ],
      }),
    );
    renderAuthApp('/authorize?request=req-1');

    expect(await screen.findByRole('listitem', { name: /SIGAA: Precisa da senha/ })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'QR para liberar o SIGAA com o celular' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'digite a senha do SIGAA' })).toBeInTheDocument();
    expect(screen.queryByText(/só vai aparecer para o app depois que você digitar a senha/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Autorizar' })).toBeEnabled();
  });

  it('no computador, SIGAA sem conexão: o bloco do QR vem mesmo sem passkey nem cofre', async () => {
    mockRequest(
      authorizeRequestFixture({
        sources: [
          { source: 'sigaa', status: 'disconnected' },
          { source: 'moodle', status: 'connected' },
          { source: 'classroom', status: 'connected' },
        ],
      }),
    );
    renderAuthApp('/authorize?request=req-1');

    expect(await screen.findByRole('img', { name: 'QR para liberar o SIGAA com o celular' })).toBeInTheDocument();
    expect(screen.getByText('Abra a câmera do celular e leia o código. Na primeira vez, o celular pede a senha do SIGAA.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'digite a senha do SIGAA' })).toBeInTheDocument();
  });

  it('no celular, SIGAA pedindo senha: avisa e leva a Conexões, sem bloquear a autorização', async () => {
    vi.mocked(webauthn.looksLikePhone).mockReturnValue(true);
    mockRequest(
      authorizeRequestFixture({
        sources: [
          { source: 'sigaa', status: 'password_required' },
          { source: 'moodle', status: 'connected' },
          { source: 'classroom', status: 'connected' },
        ],
      }),
    );
    renderAuthApp('/authorize?request=req-1');

    expect(await screen.findByRole('listitem', { name: /SIGAA: Precisa da senha/ })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'QR para liberar o SIGAA com o celular' })).toBeNull();
    expect(screen.getByText(/só vai aparecer para o app depois que você digitar a senha/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Digitar senha' })).toHaveAttribute('href', 'http://localhost:3001/connections');
    expect(screen.getByRole('button', { name: 'Autorizar' })).toBeEnabled();
  });

  it('fonte "locked" na lista do pedido aparece como "Trancado" e não quebra a tela', async () => {
    mockRequest(
      authorizeRequestFixture({
        sources: [
          { source: 'sigaa', status: 'locked' },
          { source: 'moodle', status: 'connected' },
          { source: 'classroom', status: 'connected' },
        ],
      }),
    );
    renderAuthApp('/authorize?request=req-1');

    expect(await screen.findByRole('listitem', { name: /SIGAA: Trancado/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Autorizar' })).toBeEnabled();
  });

  describe('com o SIGAA trancado', () => {
    const lockedSources = [
      { source: 'sigaa', status: 'locked' },
      { source: 'moodle', status: 'connected' },
      { source: 'classroom', status: 'connected' },
    ] as const;
    const connectedSources = lockedSources.map((item) => ({ ...item, status: 'connected' as const }));

    it('no computador: o bloco do QR (versão compacta) entre as fontes e os botões, com "ou digite a senha do SIGAA" levando ao painel', async () => {
      mockRequest(authorizeRequestFixture({ sources: [...lockedSources] }));
      const { container } = renderAuthApp('/authorize?request=req-1');
      expect(await screen.findByRole('heading', { name: 'Liberar o SIGAA com o celular' })).toBeInTheDocument();
      expect(screen.getByText('Abra a câmera do celular e leia o código. Use o celular que você ativou.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Autorizar' })).toBeEnabled();
      // O pedido do QR leva o nome do app que pede o acesso, para o celular mostrar o que está liberando.
      expect(vi.mocked(pairing.usePairing).mock.calls[0]?.[0]).toMatchObject({ enabled: true, client: 'Claude' });
      expect(await axe(container)).toHaveNoViolations();

      const assign = mockLocationAssign();
      await userEvent.click(screen.getByRole('button', { name: 'digite a senha do SIGAA' }));
      expect(assign).toHaveBeenCalledWith('http://localhost:3001/connections');
    });

    it('o celular libera: a lista recarrega ("Conectado"), o QR some e aparece "SIGAA liberado pelo seu celular. Pode autorizar."', async () => {
      let sources: AuthorizeRequest['sources'] = [...lockedSources];
      server.use(http.get(`${API}/authorize/requests/req-1`, () => HttpResponse.json(wire(authorizeRequestFixture({ sources })))));
      renderAuthApp('/authorize?request=req-1');
      await screen.findByRole('heading', { name: 'Liberar o SIGAA com o celular' });

      sources = [...connectedSources];
      await act(async () => vi.mocked(pairing.usePairing).mock.calls[0]?.[0].onUnlocked());

      expect(await screen.findByText('SIGAA liberado pelo seu celular. Pode autorizar.')).toBeInTheDocument();
      expect(await screen.findByRole('listitem', { name: /SIGAA: Conectado/ })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Liberar o SIGAA com o celular' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Autorizar' })).toBeEnabled();
    });

    it('no celular: um botão "Desbloquear com a digital" (sem QR), e liberar recarrega o pedido', async () => {
      vi.mocked(webauthn.looksLikePhone).mockReturnValue(true);
      let sources: AuthorizeRequest['sources'] = [...lockedSources];
      server.use(http.get(`${API}/authorize/requests/req-1`, () => HttpResponse.json(wire(authorizeRequestFixture({ sources })))));
      vi.mocked(flows.unlockWithPasskey).mockImplementation(async () => {
        sources = [...connectedSources];
        return { ok: true };
      });
      renderAuthApp('/authorize?request=req-1');

      await userEvent.click(await screen.findByRole('button', { name: /desbloquear com a digital/i }));
      expect(vi.mocked(flows.unlockWithPasskey)).toHaveBeenCalledWith({ userId: meFixture().id });
      expect(screen.queryByRole('img', { name: /QR/ })).toBeNull();
      expect(await screen.findByText('SIGAA liberado pelo seu celular. Pode autorizar.')).toBeInTheDocument();
      expect(await screen.findByRole('listitem', { name: /SIGAA: Conectado/ })).toBeInTheDocument();
    });

    it('sem o SIGAA trancado, nada do QR aparece (quem já está conectado não vê o bloco)', async () => {
      mockRequest(authorizeRequestFixture());
      renderAuthApp('/authorize?request=req-1');
      await screen.findByText('Claude');
      expect(screen.queryByRole('heading', { name: 'Liberar o SIGAA com o celular' })).toBeNull();
      expect(vi.mocked(pairing.usePairing)).not.toHaveBeenCalled();
    });
  });

  it('no celular, nenhuma fonte conectada: avisa que o app não vê nada ainda', async () => {
    vi.mocked(webauthn.looksLikePhone).mockReturnValue(true);
    mockRequest(
      authorizeRequestFixture({
        sources: [
          { source: 'sigaa', status: 'disconnected' },
          { source: 'moodle', status: 'disconnected' },
          { source: 'classroom', status: 'disconnected' },
        ],
      }),
    );
    renderAuthApp('/authorize?request=req-1');
    expect(await screen.findByText(/sem fontes conectadas, o app não vê nada ainda/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Conectar agora' })).toBeInTheDocument();
  });

  it('sem sessão, vai para o login e guarda o pedido para voltar', async () => {
    server.use(signedOutMeHandler());
    mockRequest(authorizeRequestFixture({ signedIn: false, sources: null }));
    renderAuthApp('/authorize?request=req-1');

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    // O pedido aparece no banner do login, o que mostra que o retorno guardou o id.
    expect(await screen.findByText(/quer acessar seus dados acadêmicos/i)).toBeInTheDocument();
  });

  it.each([
    ['request_expired', 410, 'Pedido expirado'],
    ['request_not_found', 404, 'Pedido não encontrado'],
  ])('%s (%i) mostra a tela de erro certa', async (code, status, title) => {
    mockError('req-1', status, code);
    renderAuthApp('/authorize?request=req-1');
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
  });

  it('pedido já vencido pelo relógio mostra expirado, sem esperar a API', async () => {
    mockRequest(authorizeRequestFixture({ expiresAt: new Date(Date.now() - 1000).toISOString() }));
    renderAuthApp('/authorize?request=req-1');
    expect(await screen.findByRole('heading', { name: 'Pedido expirado' })).toBeInTheDocument();
  });

  it('pedido que expira ou some entre carregar e decidir vira a tela de erro', async () => {
    mockLocationAssign();
    mockRequest(authorizeRequestFixture());
    server.use(
      http.post(`${API}/authorize/requests/req-1/approve`, () =>
        HttpResponse.json({ error: 'request_not_found', message: 'Não achamos.' }, { status: 404 }),
      ),
    );
    renderAuthApp('/authorize?request=req-1');
    await userEvent.click(await screen.findByRole('button', { name: 'Autorizar' }));
    expect(await screen.findByRole('heading', { name: 'Pedido não encontrado' })).toBeInTheDocument();
  });

  it('sem id do pedido vai para a tela de pedido inválido', async () => {
    renderAuthApp('/authorize');
    expect(await screen.findByRole('heading', { name: 'Pedido inválido' })).toBeInTheDocument();
  });

  it('/authorize/error mostra o texto da API só como texto', async () => {
    renderAuthApp('/authorize/error?error=invalid_redirect&message=' + encodeURIComponent('<b>x</b> Cliente desconhecido.'));
    const text = await screen.findByText('<b>x</b> Cliente desconhecido.');
    expect(text.querySelector('b')).toBeNull();
  });

  it('/authorize/error com transação expirada explica a causa e o botão recomeça o login com PKCE novo', async () => {
    const assign = mockLocationAssign();
    renderAuthApp('/authorize/error?error=invalid_request&message=' + encodeURIComponent('transação expirada ou inválida; recomece a autorização'));
    expect(await screen.findByRole('heading', { name: 'O pedido expirou' })).toBeInTheDocument();
    expect(screen.getByText(/tela do Google fica aberta por muito tempo/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Entrar de novo' }));

    await waitFor(() => expect(assign).toHaveBeenCalledOnce());
    const target = new URL(assign.mock.calls[0]?.[0] as string);
    expect(target.pathname).toBe('/authorize');
    expect(target.searchParams.get('client_id')).toBe('ufba-web');
    expect(target.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('/authorize/error: outros erros mantêm o texto da API e também oferecem "Entrar de novo"', async () => {
    renderAuthApp('/authorize/error?error=invalid_redirect&message=' + encodeURIComponent('Cliente desconhecido.'));
    expect(await screen.findByRole('heading', { name: 'Pedido inválido' })).toBeInTheDocument();
    expect(screen.getByText('Cliente desconhecido.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar de novo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ir para o painel' })).toBeInTheDocument();
  });

  it('não tem violações de acessibilidade', async () => {
    mockRequest(authorizeRequestFixture());
    const { container } = renderAuthApp('/authorize?request=req-1');
    await screen.findByText('Claude');
    expect(await axe(container)).toHaveNoViolations();
    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(0);
  });
});
