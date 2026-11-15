import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Me } from '../contract';
import { meFixture } from '../contract/fixtures';
import { notify } from '../lib/notify';
import { mockLocationAssign, renderApp } from '../test/render';
import { API, server } from '../test/server';

const LAUNCH_URL = `${API}/sigaa/launch?t=token-de-uso-unico`;

type FakeWindow = { opener: unknown; location: { href: string }; close: ReturnType<typeof vi.fn> };

let me: Me;
let posts: Array<{ body: unknown; csrf: string | null }>;
let launchGets: number;
let openSpy: ReturnType<typeof vi.spyOn>;
let popup: FakeWindow;

const withSigaa = (status: Me['connections']['sigaa']['status']): Me => {
  const base = meFixture();
  return { ...base, connections: { ...base.connections, sigaa: { ...base.connections.sigaa, status } } };
};

beforeEach(() => {
  me = meFixture();
  posts = [];
  launchGets = 0;
  popup = { opener: {}, location: { href: '' }, close: vi.fn() };
  openSpy = vi.spyOn(window, 'open').mockImplementation(() => popup as unknown as Window);
  vi.mocked(notify.error).mockClear();
  server.use(
    http.get(`${API}/me`, () => HttpResponse.json(me)),
    http.post(`${API}/connections/sigaa/launch`, async ({ request }) => {
      posts.push({ body: await request.json(), csrf: request.headers.get('x-ufba') });
      return HttpResponse.json({ launchUrl: LAUNCH_URL });
    }),
    // O painel NUNCA busca a URL de abertura por fetch (a API recusa com 403, e a senha não pode passar pelo JS dele).
    http.get(`${API}/sigaa/launch`, () => {
      launchGets += 1;
      return new HttpResponse(null, { status: 403 });
    }),
  );
});

const openButton = () => screen.findByRole('button', { name: 'Abrir o SIGAA' });

describe('/connections · Abrir o SIGAA já logado', () => {
  it('aparece só com o SIGAA conectado, ao lado de Desconectar', async () => {
    renderApp('/connections');
    expect(await openButton()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desconectar o SIGAA' })).toBeInTheDocument();
  });

  it.each(['disconnected', 'password_required', 'locked'] as const)('não aparece com o SIGAA %s', async (status) => {
    me = withSigaa(status);
    renderApp('/connections');
    await screen.findByRole('heading', { name: 'SIGAA', level: 3 });
    expect(screen.queryByRole('button', { name: 'Abrir o SIGAA' })).toBeNull();
  });

  it('abre a janela NO CLIQUE, antes de a API responder, e só depois navega para a URL (sem fetch)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.post(`${API}/connections/sigaa/launch`, async ({ request }) => {
        posts.push({ body: await request.json(), csrf: request.headers.get('x-ufba') });
        await gate;
        return HttpResponse.json({ launchUrl: LAUNCH_URL });
      }),
    );
    renderApp('/connections');
    await userEvent.click(await openButton());

    // Com a API ainda pensando: a janela já abriu (senão o bloqueador de popup a barraria) e ainda está em branco.
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank');
    expect(popup.location.href).toBe('');
    // A janela nova perde a ligação com o painel: a página do SIGAA não o alcança.
    expect(popup.opener).toBeNull();

    release();
    await waitFor(() => expect(popup.location.href).toBe(LAUNCH_URL));
    expect(posts).toEqual([{ body: {}, csrf: '1' }]);
    expect(launchGets).toBe(0);
    expect(popup.close).not.toHaveBeenCalled();
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('a URL é pedida a cada clique (uso único, 30 s): dois cliques seguidos, duas chamadas', async () => {
    renderApp('/connections');
    await userEvent.click(await openButton());
    await waitFor(() => expect(popup.location.href).toBe(LAUNCH_URL));
    await userEvent.click(await openButton());
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(openSpy).toHaveBeenCalledTimes(2);
  });

  it('clique repetido enquanto a primeira chamada está no ar não gasta outra abertura', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.post(`${API}/connections/sigaa/launch`, async ({ request }) => {
        posts.push({ body: await request.json(), csrf: request.headers.get('x-ufba') });
        await gate;
        return HttpResponse.json({ launchUrl: LAUNCH_URL });
      }),
    );
    renderApp('/connections');
    const button = await openButton();
    await userEvent.click(button);
    await userEvent.click(button);
    release();
    await waitFor(() => expect(popup.location.href).toBe(LAUNCH_URL));
    expect(posts).toHaveLength(1);
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it('navegador bloqueou a janela (window.open devolve null): navega nesta aba', async () => {
    openSpy.mockImplementation(() => null);
    const assign = mockLocationAssign();
    renderApp('/connections');
    await userEvent.click(await openButton());
    await waitFor(() => expect(assign).toHaveBeenCalledWith(LAUNCH_URL));
    expect(launchGets).toBe(0);
  });

  it.each([
    ['409 source_not_connected', 409, 'source_not_connected', 'Libere o SIGAA neste navegador antes de abri-lo.'],
    ['429 too_many_attempts', 429, 'too_many_attempts', 'Muitas aberturas seguidas. Espere alguns minutos e tente de novo.'],
    ['500 outro erro', 500, 'internal_error', 'Falhou do lado da API.'],
  ])('%s: fecha a janela em branco e avisa por toast', async (_label, status, code, text) => {
    server.use(http.post(`${API}/connections/sigaa/launch`, () => HttpResponse.json({ error: code, message: 'Falhou do lado da API.' }, { status })));
    renderApp('/connections');
    await userEvent.click(await openButton());
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith(text));
    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(popup.location.href).toBe('');
    expect(launchGets).toBe(0);
    // O botão volta a funcionar para tentar de novo.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abrir o SIGAA' })).toBeEnabled());
  });

  it('409: relê o estado das conexões, para o cartão mostrar o desbloqueio', async () => {
    server.use(
      http.post(`${API}/connections/sigaa/launch`, () => {
        me = withSigaa('locked');
        return HttpResponse.json({ error: 'source_not_connected', message: 'x' }, { status: 409 });
      }),
    );
    renderApp('/connections');
    await userEvent.click(await openButton());
    expect(await screen.findByText('Trancado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir o SIGAA' })).toBeNull();
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>1</script>', 'isso-nao-e-url', ''])(
    'a API devolveu uma URL que não é de navegação (%s): não navega, fecha a janela e avisa',
    async (launchUrl) => {
      server.use(http.post(`${API}/connections/sigaa/launch`, () => HttpResponse.json({ launchUrl })));
      const assign = mockLocationAssign();
      renderApp('/connections');
      await userEvent.click(await openButton());
      await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Não deu para abrir o SIGAA agora. Tente de novo.'));
      expect(popup.close).toHaveBeenCalledTimes(1);
      expect(popup.location.href).toBe('');
      expect(assign).not.toHaveBeenCalled();
    },
  );

  it('falha de rede: mensagem genérica e janela fechada', async () => {
    server.use(http.post(`${API}/connections/sigaa/launch`, () => HttpResponse.error()));
    renderApp('/connections');
    await userEvent.click(await openButton());
    await waitFor(() => expect(notify.error).toHaveBeenCalled());
    expect(popup.close).toHaveBeenCalledTimes(1);
    const card = screen.getByRole('heading', { name: 'SIGAA', level: 3 }).closest('article')!;
    expect(within(card).getByRole('button', { name: 'Abrir o SIGAA' })).toBeEnabled();
  });
});
