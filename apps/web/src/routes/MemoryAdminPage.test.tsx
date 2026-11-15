import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { AdminMemorySync, AdminTeam } from '../contract';
import { adminMemorySyncFixture, adminTeamFixture } from '../contract/fixtures';
import { notify } from '../lib/notify';
import { meHandler, renderApp } from '../test/render';
import { API, server } from '../test/server';

let team: AdminTeam;
let sync: AdminMemorySync;
let isAdmin: boolean;

beforeEach(() => {
  isAdmin = true;
  team = adminTeamFixture();
  sync = adminMemorySyncFixture();
  server.use(
    meHandler(),
    http.get(`${API}/memory/status`, () =>
      HttpResponse.json({ memoryAvailable: true, userReady: true, isAdmin, computers: [] }),
    ),
    http.get(`${API}/admin/team`, () =>
      isAdmin ? HttpResponse.json(team) : HttpResponse.json({ error: 'not_admin', message: 'Só admin.' }, { status: 403 }),
    ),
    http.get(`${API}/admin/memory/sync`, () =>
      isAdmin ? HttpResponse.json(sync) : HttpResponse.json({ error: 'not_admin', message: 'Só admin.' }, { status: 403 }),
    ),
  );
});

describe('/memory/admin', () => {
  it('admin: o aviso diz o que o mantenedor faz, sem tabela de papéis, e a navegação marca Administração', async () => {
    renderApp('/memory/admin');
    expect(await screen.findByRole('heading', { name: 'Administração da memória', level: 1 })).toBeInTheDocument();
    expect(
      await screen.findByText(
        'Todo estudante com conta @ufba.br já lê a documentação. Quem é mantenedor também escreve em API, Web, Docs.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    const tabs = screen.getByRole('navigation', { name: 'Seções da Memória' });
    expect(await within(tabs).findByRole('link', { name: 'Administração' })).toHaveAttribute('aria-current', 'page');
  });

  it('mantenedores: lista só quem tem o papel, com botão Retirar', async () => {
    renderApp('/memory/admin');
    const section = within(await screen.findByRole('region', { name: 'Mantenedores' }));
    expect(section.getByRole('heading', { name: 'Marina Costa' })).toBeInTheDocument();
    expect(section.getByRole('button', { name: 'Retirar Marina Costa de mantenedor' })).toBeInTheDocument();
    expect(screen.queryByText('joao.souza@ufba.br')).toBeNull();
  });

  it('sem mantenedores: mensagem de lista vazia', async () => {
    team = adminTeamFixture({ members: [] });
    renderApp('/memory/admin');
    expect(await screen.findByText('Nenhum mantenedor ainda. Busque alguém abaixo.')).toBeInTheDocument();
  });

  it('busca: pede 2 letras, mostra resultados e marca quem já é mantenedor', async () => {
    const asked: string[] = [];
    server.use(
      http.get(`${API}/admin/team/people`, ({ request }) => {
        const q = new URL(request.url).searchParams.get('q') ?? '';
        asked.push(q);
        return HttpResponse.json({
          people: [
            { userId: 'u-1', name: 'Marina Costa', email: 'marina.costa@ufba.br', roles: ['maintainer'] },
            { userId: 'u-2', name: null, email: 'joao.souza@ufba.br', roles: [] },
          ],
        });
      }),
    );
    renderApp('/memory/admin');
    const box = await screen.findByLabelText('Buscar por nome ou e-mail');
    expect(screen.getByText('Digite ao menos 2 letras.')).toBeInTheDocument();
    await userEvent.type(box, 'j');
    expect(asked).toEqual([]); // 1 letra não consulta
    await userEvent.type(box, 'o');
    const results = within(await screen.findByLabelText('Resultados da busca'));
    expect(asked).toEqual(['jo']);
    expect(results.getByText('Já é mantenedor')).toBeInTheDocument();
    expect(results.getByRole('button', { name: 'Tornar joao.souza@ufba.br mantenedor' })).toBeInTheDocument();
    expect(results.queryByRole('button', { name: 'Tornar Marina Costa mantenedor' })).toBeNull();
  });

  it('busca sem resultado: "Ninguém encontrado."', async () => {
    server.use(http.get(`${API}/admin/team/people`, () => HttpResponse.json({ people: [] })));
    renderApp('/memory/admin');
    await userEvent.type(await screen.findByLabelText('Buscar por nome ou e-mail'), 'zz');
    expect(await screen.findByText('Ninguém encontrado.')).toBeInTheDocument();
  });

  it('tornar mantenedor: PUT maintainer com corpo {}, toast e a pessoa entra na lista; desabilita enquanto roda', async () => {
    let received: { path: string; body: unknown; headers: Headers } | undefined;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(`${API}/admin/team/people`, () =>
        HttpResponse.json({
          people: [{ userId: 'u-2', name: null, email: 'joao.souza@ufba.br', roles: team.members.some((m) => m.userId === 'u-2') ? ['maintainer'] : [] }],
        }),
      ),
      http.put(`${API}/admin/team/members/:userId/roles/:roleKey`, async ({ request }) => {
        received = { path: new URL(request.url).pathname, body: await request.json(), headers: request.headers };
        await gate;
        team = { ...team, members: [...team.members, { userId: 'u-2', name: null, email: 'joao.souza@ufba.br', roles: ['maintainer'] }] };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/memory/admin');
    await userEvent.type(await screen.findByLabelText('Buscar por nome ou e-mail'), 'joao');
    await userEvent.click(await screen.findByRole('button', { name: 'Tornar joao.souza@ufba.br mantenedor' }));
    await waitFor(() => expect(received?.path).toBe('/admin/team/members/u-2/roles/maintainer'));
    expect(received?.body).toEqual({});
    expect(received?.headers.get('x-ufba')).toBe('1');
    expect(screen.getByRole('button', { name: 'Retirar Marina Costa de mantenedor' })).toBeDisabled();
    release();
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('joao.souza@ufba.br agora é mantenedor.'));
    const list = within(await screen.findByRole('region', { name: 'Mantenedores' }));
    expect(await list.findByRole('heading', { name: 'joao.souza@ufba.br' })).toBeInTheDocument();
  });

  it('retirar: DELETE maintainer, toast e a pessoa sai da lista', async () => {
    let path = '';
    server.use(
      http.delete(`${API}/admin/team/members/:userId/roles/:roleKey`, ({ request }) => {
        path = new URL(request.url).pathname;
        team = { ...team, members: [] };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/memory/admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Retirar Marina Costa de mantenedor' }));
    await waitFor(() => expect(path).toBe('/admin/team/members/u-1/roles/maintainer'));
    expect(notify.success).toHaveBeenCalledWith('Marina Costa deixou de ser mantenedor.');
    expect(await screen.findByText('Nenhum mantenedor ainda. Busque alguém abaixo.')).toBeInTheDocument();
  });

  it('falha ao mudar o papel (404): toast com a mensagem da API', async () => {
    server.use(
      http.delete(`${API}/admin/team/members/:userId/roles/:roleKey`, () =>
        HttpResponse.json({ error: 'role_not_found', message: 'Esse papel não existe.' }, { status: 404 }),
      ),
    );
    renderApp('/memory/admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Retirar Marina Costa de mantenedor' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Esse papel não existe.'));
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('sincronização vazia: "Tudo sincronizado"', async () => {
    renderApp('/memory/admin');
    expect(await screen.findByText('Tudo sincronizado')).toBeInTheDocument();
  });

  it('sincronização com falhas e projetos desconhecidos', async () => {
    sync = adminMemorySyncFixture({
      failing: [
        { name: 'Marina Costa', email: 'marina.costa@ufba.br', attempts: 3, nextRunAt: '2026-11-14T15:30:00.000Z', lastError: 'unavailable' },
        { name: null, email: null, attempts: 1, nextRunAt: '2026-11-14T16:00:00.000Z', lastError: null },
      ],
      unknownProjects: [{ workspace: 'ufba', project: 'legado' }],
    });
    renderApp('/memory/admin');
    const section = within(await screen.findByRole('region', { name: 'Sincronização com a memória' }));
    expect(section.getByText('Marina Costa')).toBeInTheDocument();
    expect(section.getByText(/3 tentativas · Próxima tentativa:/)).toBeInTheDocument();
    expect(screen.getByText('Erro: unavailable')).toBeInTheDocument();
    expect(screen.getByText('Pessoa sem nome')).toBeInTheDocument();
    expect(screen.getByText('ufba/legado')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Existem no servidor de memória, mas a ufba.app não os conhece. Foram criados por escrita direta; adote ou apague no servidor.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Tudo sincronizado')).toBeNull();
  });

  it('não admin (403 not_admin): estado sem acesso, sem toast e sem Administração na navegação', async () => {
    isAdmin = false;
    renderApp('/memory/admin');
    expect(await screen.findByRole('heading', { name: 'Você não tem acesso a esta área' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(notify.error).not.toHaveBeenCalled();
    const tabs = screen.getByRole('navigation', { name: 'Seções da Memória' });
    expect(within(tabs).queryByRole('link', { name: 'Administração' })).toBeNull();
  });

  it('falha ao carregar: avisa e deixa tentar de novo', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/admin/team`, () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ error: 'internal_error', message: 'Erro nosso.' }, { status: 500 });
        return HttpResponse.json(team);
      }),
    );
    renderApp('/memory/admin');
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro nosso.');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'Marina Costa' })).toBeInTheDocument();
  });

  it('não tem violações de acessibilidade', async () => {
    const { container } = renderApp('/memory/admin');
    await screen.findByText('Tudo sincronizado');
    expect(await axe(container)).toHaveNoViolations();
  });
});
