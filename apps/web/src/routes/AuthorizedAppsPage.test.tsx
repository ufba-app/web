import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { AuthorizedApp } from '../contract';
import { authorizedAppFixture } from '../contract/fixtures';
import { meHandler, mockLocationAssign, mockLocationReplace, renderApp } from '../test/render';
import { API, server } from '../test/server';

let apps: AuthorizedApp[];

beforeEach(() => {
  apps = [
    authorizedAppFixture(),
    authorizedAppFixture({
      clientId: 'client-2',
      domain: 'estudos.exemplo.com',
      name: null,
      verified: false,
      lastUsedAt: null,
    }),
  ];
  server.use(
    meHandler(),
    http.get(`${API}/authorized-apps`, () => HttpResponse.json({ apps })),
    // A página também lista os celulares ativados (passkeys); aqui nenhum.
    http.get(`${API}/sigaa/passkey`, () => HttpResponse.json({ passkeys: [] })),
  );
});

describe('/authorized-apps', () => {
  it('lista os apps com selo, domínio e quantidade; sem nome, usa o domínio', async () => {
    renderApp('/authorized-apps');
    expect(await screen.findByText('2 apps')).toBeInTheDocument();
    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(screen.getByText('Verificado')).toBeInTheDocument();
    expect(screen.getByText('Não verificado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revogar estudos.exemplo.com' })).toBeInTheDocument();
    expect(screen.getByText('claude.ai')).toBeInTheDocument();
  });

  it('um app só diz "1 app"', async () => {
    apps = [authorizedAppFixture()];
    renderApp('/authorized-apps');
    expect(await screen.findByText('1 app')).toBeInTheDocument();
  });

  it('sem apps: estado vazio', async () => {
    apps = [];
    renderApp('/authorized-apps');
    expect(await screen.findByRole('heading', { name: 'Nenhum app autorizado' })).toBeInTheDocument();
    expect(screen.getByText(/quando você autorizar um app, como o claude, ele aparece aqui/i)).toBeInTheDocument();
  });

  it('revogar pede confirmação, chama DELETE com o clientId e atualiza a lista', async () => {
    let path = '';
    let headers: Headers | undefined;
    server.use(
      http.delete(`${API}/authorized-apps/:clientId`, ({ request }) => {
        path = new URL(request.url).pathname;
        headers = request.headers;
        apps = apps.filter((a) => a.clientId !== 'client-1');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/authorized-apps');

    await userEvent.click(await screen.findByRole('button', { name: 'Revogar Claude' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revogar o Claude?' });
    expect(within(dialog).getByText(/perde o acesso na hora/i)).toBeInTheDocument();
    expect(path).toBe(''); // ainda nada foi revogado

    await userEvent.click(within(dialog).getByRole('button', { name: 'Revogar acesso' }));

    await waitFor(() => expect(path).toBe('/authorized-apps/client-1'));
    expect(headers?.get('x-ufba')).toBe('1');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.queryByText('Claude')).toBeNull());
    expect(screen.getByText('1 app')).toBeInTheDocument();
  });

  it('cancelar não revoga nada', async () => {
    const spy = vi.fn();
    server.use(http.delete(`${API}/authorized-apps/:clientId`, () => (spy(), new HttpResponse(null, { status: 204 }))));
    renderApp('/authorized-apps');
    await userEvent.click(await screen.findByRole('button', { name: 'Revogar Claude' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revogar o Claude?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText('Claude')).toBeInTheDocument();
  });

  it('falha ao revogar: mostra a mensagem da API e mantém o diálogo aberto', async () => {
    server.use(
      http.delete(`${API}/authorized-apps/:clientId`, () =>
        HttpResponse.json({ error: 'not_found', message: 'Esse app já não está autorizado.' }, { status: 404 }),
      ),
    );
    renderApp('/authorized-apps');
    await userEvent.click(await screen.findByRole('button', { name: 'Revogar Claude' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revogar o Claude?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revogar acesso' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Esse app já não está autorizado.');
  });

  it('sessão expirada ao carregar a lista manda para o login no auth, voltando para Apps autorizados', async () => {
    // Sem diálogo no meio: um diálogo aberto enquanto o painel desmonta deixa estado do React Aria para o teste seguinte.
    // O caminho com o diálogo (revogar com a sessão vencida) está em e2e/screens.spec.ts, no navegador de verdade.
    server.use(
      http.get(`${API}/authorized-apps`, () =>
        HttpResponse.json({ error: 'session_expired', message: 'Entre de novo.' }, { status: 401 }),
      ),
    );
    window.history.pushState(null, '', '/authorized-apps');
    const replace = mockLocationReplace();
    renderApp('/authorized-apps');
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('http://localhost:3002/sign-in?return=%2Fauthorized-apps'),
    );
  });

  it('falha ao carregar: avisa e deixa tentar de novo', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/authorized-apps`, () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ error: 'internal_error', message: 'Erro nosso.' }, { status: 500 });
        return HttpResponse.json({ apps });
      }),
    );
    renderApp('/authorized-apps');
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro nosso.');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('2 apps')).toBeInTheDocument();
  });

  it('não tem violações de acessibilidade', async () => {
    const { container } = renderApp('/authorized-apps');
    await screen.findByText('2 apps');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('páginas "Em breve" e menu', () => {
  it.each([
    ['/schedule', 'Horário'],
    ['/deadlines', 'Prazos'],
  ])('%s mostra "Em breve"', async (route, title) => {
    renderApp(route);
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Em breve' })).toBeInTheDocument();
  });

  it('o menu marca a página atual e mostra a pessoa logada', async () => {
    renderApp('/authorized-apps');
    await screen.findByText('2 apps');
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(within(nav).getByRole('link', { name: 'Apps autorizados' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Conexões' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByText('Marina Costa')).toBeInTheDocument();
  });

  it('Sair chama DELETE /session e leva ao login no app de auth', async () => {
    let called = false;
    server.use(
      http.delete(`${API}/session`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const assign = mockLocationAssign();
    renderApp('/schedule');
    await userEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('http://localhost:3002/sign-in'));
    expect(called).toBe(true);
  });

  it('endereço desconhecido mostra "Página não encontrada"', async () => {
    renderApp('/nao-existe');
    expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
  });
});
