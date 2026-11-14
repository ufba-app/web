import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { AuthorizeRequest } from '../contract';
import { authorizeRequestFixture, meFixture } from '../contract/fixtures';
import { notify } from '../lib/notify';
import { meHandler, mockLocationAssign, renderAuthApp, signedOutMeHandler } from '../test/render';
import { API, server } from '../test/server';

const wire = (r: AuthorizeRequest) => ({ ...r });

function mockRequest(request: AuthorizeRequest) {
  server.use(http.get(`${API}/authorize/requests/${request.id}`, () => HttpResponse.json(wire(request))));
}

function mockError(id: string, status: number, error: string, message = 'Mensagem da API.') {
  server.use(http.get(`${API}/authorize/requests/${id}`, () => HttpResponse.json({ error, message }, { status })));
}

describe('/authorize', () => {
  beforeEach(() => server.use(meHandler()));

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

  it('SIGAA pedindo senha: avisa e leva a Conexões, sem bloquear a autorização', async () => {
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
    expect(screen.getByText(/só vai aparecer para o app depois que você digitar a senha/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Digitar senha' })).toHaveAttribute('href', 'http://localhost:3001/connections');
    expect(screen.getByRole('button', { name: 'Autorizar' })).toBeEnabled();
  });

  it('nenhuma fonte conectada: avisa que o app não vê nada ainda', async () => {
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

  it('não tem violações de acessibilidade', async () => {
    mockRequest(authorizeRequestFixture());
    const { container } = renderAuthApp('/authorize?request=req-1');
    await screen.findByText('Claude');
    expect(await axe(container)).toHaveNoViolations();
    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(0);
  });
});
