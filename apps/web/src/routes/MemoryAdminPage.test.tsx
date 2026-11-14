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
  it('admin: tabela somente leitura dos papéis com projetos e nível, e o aviso de que mudar é no código', async () => {
    renderApp('/memory/admin');
    expect(await screen.findByRole('heading', { name: 'Administração da memória', level: 1 })).toBeInTheDocument();
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1] as HTMLElement).getByText('dev')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('Desenvolvimento do ecossistema ufba.app')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('Front end (ufba/web) · Escrita')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('API (ufba/api) · Leitura')).toBeInTheDocument();
    expect(
      screen.getByText('Para mudar o que um papel concede é preciso uma alteração no código (revisão), não há edição aqui.'),
    ).toBeInTheDocument();
    const tabs = screen.getByRole('navigation', { name: 'Seções da Memória' });
    expect(await within(tabs).findByRole('link', { name: 'Administração' })).toHaveAttribute('aria-current', 'page');
  });

  it('pessoas: papéis como chips (nome ou e-mail) e "Sem papéis"', async () => {
    renderApp('/memory/admin');
    const marina = (await screen.findByRole('heading', { name: 'Marina Costa' })).closest('article') as HTMLElement;
    expect(within(marina).getByText('dev')).toBeInTheDocument();
    expect(within(marina).getByRole('button', { name: 'Retirar dev de Marina Costa' })).toBeInTheDocument();
    expect(within(marina).getByRole('button', { name: 'Atribuir maintainer a Marina Costa' })).toBeInTheDocument();
    const joao = screen.getByRole('heading', { name: 'joao.souza@ufba.br' }).closest('article') as HTMLElement;
    expect(within(joao).getByText('Sem papéis')).toBeInTheDocument();
  });

  it('atribuir papel: PUT com corpo {}, toast e lista atualizada; desabilita enquanto roda', async () => {
    let received: { path: string; body: unknown; headers: Headers } | undefined;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.put(`${API}/admin/team/members/:userId/roles/:roleKey`, async ({ request }) => {
        received = { path: new URL(request.url).pathname, body: await request.json(), headers: request.headers };
        await gate;
        team = { ...team, members: team.members.map((m) => (m.userId === 'u-2' ? { ...m, roles: ['maintainer'] } : m)) };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/memory/admin');
    const button = await screen.findByRole('button', { name: 'Atribuir maintainer a joao.souza@ufba.br' });
    await userEvent.click(button);
    await waitFor(() => expect(received?.path).toBe('/admin/team/members/u-2/roles/maintainer'));
    expect(received?.body).toEqual({});
    expect(received?.headers.get('x-ufba')).toBe('1');
    expect(screen.getByRole('button', { name: 'Atribuir dev a joao.souza@ufba.br' })).toBeDisabled();
    release();
    await waitFor(() =>
      expect(notify.success).toHaveBeenCalledWith('Papel maintainer atribuído a joao.souza@ufba.br.'),
    );
    expect(await screen.findByRole('button', { name: 'Retirar maintainer de joao.souza@ufba.br' })).toBeEnabled();
  });

  it('retirar papel: DELETE, toast e lista atualizada', async () => {
    let path = '';
    server.use(
      http.delete(`${API}/admin/team/members/:userId/roles/:roleKey`, ({ request }) => {
        path = new URL(request.url).pathname;
        team = { ...team, members: team.members.map((m) => (m.userId === 'u-1' ? { ...m, roles: [] } : m)) };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/memory/admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Retirar dev de Marina Costa' }));
    await waitFor(() => expect(path).toBe('/admin/team/members/u-1/roles/dev'));
    expect(notify.success).toHaveBeenCalledWith('Papel dev retirado de Marina Costa.');
    expect(await screen.findByRole('button', { name: 'Atribuir dev a Marina Costa' })).toBeInTheDocument();
  });

  it('papel inexistente (404): toast com a mensagem da API', async () => {
    server.use(
      http.put(`${API}/admin/team/members/:userId/roles/:roleKey`, () =>
        HttpResponse.json({ error: 'role_not_found', message: 'Esse papel não existe.' }, { status: 404 }),
      ),
    );
    renderApp('/memory/admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Atribuir maintainer a joao.souza@ufba.br' }));
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

  it('time sem pessoas: mensagem de lista vazia', async () => {
    team = adminTeamFixture({ members: [] });
    renderApp('/memory/admin');
    expect(await screen.findByText('Ninguém no time ainda.')).toBeInTheDocument();
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
