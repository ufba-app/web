import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { MemoryComputer } from '../contract';
import { memoryComputerFixture } from '../contract/fixtures';
import { notify } from '../lib/notify';
import { meHandler, renderApp } from '../test/render';
import { API, server } from '../test/server';

let computers: MemoryComputer[];
let memoryAvailable: boolean;

beforeEach(() => {
  memoryAvailable = true;
  computers = [
    memoryComputerFixture({ lastSeenAt: new Date(Date.now() - 2 * 3_600_000).toISOString() }),
    memoryComputerFixture({
      id: 'pc-2',
      name: 'Desktop do laboratório',
      os: 'linux',
      agents: [],
      installMode: 'profile',
      lastSeenAt: null,
    }),
    memoryComputerFixture({ id: 'pc-3', name: 'Mac antigo', os: 'darwin', revokedAt: '2026-11-10T12:00:00.000Z' }),
  ];
  server.use(
    meHandler(),
    http.get(`${API}/memory/status`, () =>
      HttpResponse.json({ memoryAvailable, userReady: true, isAdmin: false, computers }),
    ),
    http.get(`${API}/memory/computers`, () => HttpResponse.json({ computers })),
  );
});

describe('/memory/computers', () => {
  it('lista nome, sistema, agentes, modo, criação e último uso; o revogado fica sem ações', async () => {
    renderApp('/memory/computers');
    expect(await screen.findByRole('heading', { name: 'Computadores conectados', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('Notebook da Marina')).toBeInTheDocument();
    expect(screen.getByText('Windows · claude-code, codex · Instalação nova')).toBeInTheDocument();
    expect(screen.getAllByText(/Conectado em 04\/11\/2026/)).toHaveLength(3);
    expect(screen.getByText(/Último uso: há 2 h/)).toBeInTheDocument();
    expect(screen.getByText('Linux · Nenhum agente detectado · Perfil ufba')).toBeInTheDocument();
    expect(screen.getByText(/Nunca usou/)).toBeInTheDocument();
    expect(screen.getByText('2 computadores')).toBeInTheDocument();

    expect(screen.getByText('Mac antigo')).toBeInTheDocument();
    expect(screen.getByText('Desconectado')).toBeInTheDocument();
    expect(screen.getByText(/Desconectado em 10\/11\/2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Renomear Mac antigo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Desconectar Mac antigo' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Renomear Notebook da Marina' })).toBeInTheDocument();
  });

  it('navegação da área Memória: Computadores conectados é a seção atual e não há Administração sem ser admin', async () => {
    renderApp('/memory/computers');
    await screen.findByText('Notebook da Marina');
    const tabs = screen.getByRole('navigation', { name: 'Seções da Memória' });
    expect(within(tabs).getByRole('link', { name: 'Computadores conectados' })).toHaveAttribute('aria-current', 'page');
    expect(within(tabs).getByRole('link', { name: 'Meus projetos' })).toHaveAttribute('href', '/memory/projects');
    expect(within(tabs).queryByRole('link', { name: 'Administração' })).toBeNull();
  });

  it('o menu tem o item Memória marcado como atual', async () => {
    renderApp('/memory/computers');
    await screen.findByText('Notebook da Marina');
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(within(nav).getByRole('link', { name: 'Memória' })).toHaveAttribute('aria-current', 'page');
  });

  it('sem computadores: estado vazio que explica como conectar, sem inventar comando', async () => {
    computers = [];
    renderApp('/memory/computers');
    expect(await screen.findByRole('heading', { name: 'Nenhum computador conectado' })).toBeInTheDocument();
    expect(
      screen.getByText('Peça ao seu agente de IA para conectar este computador usando o MCP da ufba.app.'),
    ).toBeInTheDocument();
  });

  it('memória indisponível: aviso no lugar da lista', async () => {
    memoryAvailable = false;
    renderApp('/memory/computers');
    expect(await screen.findByText(/a memória está indisponível no momento/i)).toBeInTheDocument();
    expect(screen.queryByText('Notebook da Marina')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Nenhum computador conectado' })).toBeNull();
  });

  it('renomear: valida 1 a 60 caracteres, chama PATCH e avisa com toast', async () => {
    let received: { path: string; body: unknown; headers: Headers } | undefined;
    server.use(
      http.patch(`${API}/memory/computers/:id`, async ({ request }) => {
        received = { path: new URL(request.url).pathname, body: await request.json(), headers: request.headers };
        computers = computers.map((c) => (c.id === 'pc-1' ? { ...c, name: 'PC novo' } : c));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/memory/computers');
    await userEvent.click(await screen.findByRole('button', { name: 'Renomear Notebook da Marina' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renomear computador' });
    const input = within(dialog).getByLabelText('Nome do computador');
    expect(input).toHaveValue('Notebook da Marina');

    await userEvent.clear(input);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByText('Digite um nome.')).toBeInTheDocument();

    await userEvent.type(input, 'x'.repeat(61));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByText('Use até 60 caracteres.')).toBeInTheDocument();
    expect(received).toBeUndefined();

    await userEvent.clear(input);
    await userEvent.type(input, '  PC novo  ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(received?.path).toBe('/memory/computers/pc-1'));
    expect(received?.body).toEqual({ name: 'PC novo' });
    expect(received?.headers.get('x-ufba')).toBe('1');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(notify.success).toHaveBeenCalledWith('Computador renomeado para PC novo.');
    expect(await screen.findByText('PC novo')).toBeInTheDocument();
  });

  it('renomear com erro da API: mensagem dentro do diálogo', async () => {
    server.use(
      http.patch(`${API}/memory/computers/:id`, () =>
        HttpResponse.json({ error: 'computer_not_found', message: 'Esse computador não existe mais.' }, { status: 404 }),
      ),
    );
    renderApp('/memory/computers');
    await userEvent.click(await screen.findByRole('button', { name: 'Renomear Notebook da Marina' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renomear computador' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Esse computador não existe mais.');
  });

  it('desconectar pede confirmação, explica o efeito, chama DELETE e atualiza a lista', async () => {
    let path = '';
    let headers: Headers | undefined;
    server.use(
      http.delete(`${API}/memory/computers/:id`, ({ request }) => {
        path = new URL(request.url).pathname;
        headers = request.headers;
        computers = computers.map((c) => (c.id === 'pc-1' ? { ...c, revokedAt: '2026-11-14T12:00:00.000Z' } : c));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/memory/computers');
    await userEvent.click(await screen.findByRole('button', { name: 'Desconectar Notebook da Marina' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desconectar Notebook da Marina?' });
    expect(within(dialog).getByText(/para de funcionar na hora/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/hooks dele passam a falhar até você reconectar/i)).toBeInTheDocument();
    expect(path).toBe('');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));

    await waitFor(() => expect(path).toBe('/memory/computers/pc-1'));
    expect(headers?.get('x-ufba')).toBe('1');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(notify.success).toHaveBeenCalledWith('Notebook da Marina desconectado.');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Desconectar Notebook da Marina' })).toBeNull());
    expect(screen.getAllByText('Desconectado')).toHaveLength(2);
  });

  it('cancelar não desconecta nada', async () => {
    const spy = vi.fn();
    server.use(http.delete(`${API}/memory/computers/:id`, () => (spy(), new HttpResponse(null, { status: 204 }))));
    renderApp('/memory/computers');
    await userEvent.click(await screen.findByRole('button', { name: 'Desconectar Notebook da Marina' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desconectar Notebook da Marina?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(spy).not.toHaveBeenCalled();
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('falha ao desconectar: mensagem da API no diálogo, que continua aberto', async () => {
    server.use(
      http.delete(`${API}/memory/computers/:id`, () =>
        HttpResponse.json({ error: 'computer_not_found', message: 'Esse computador não existe mais.' }, { status: 404 }),
      ),
    );
    renderApp('/memory/computers');
    await userEvent.click(await screen.findByRole('button', { name: 'Desconectar Notebook da Marina' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Esse computador não existe mais.');
  });

  it('falha ao carregar: avisa e deixa tentar de novo', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/memory/computers`, () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ error: 'internal_error', message: 'Erro nosso.' }, { status: 500 });
        return HttpResponse.json({ computers });
      }),
    );
    renderApp('/memory/computers');
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro nosso.');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Notebook da Marina')).toBeInTheDocument();
  });

  it('não tem violações de acessibilidade', async () => {
    const { container } = renderApp('/memory/computers');
    await screen.findByText('Notebook da Marina');
    expect(await axe(container)).toHaveNoViolations();
  });
});
