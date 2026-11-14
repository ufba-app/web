import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { MemoryProject } from '../contract';
import { memoryComputerFixture, memoryProjectDetailFixture, memoryProjectFixture } from '../contract/fixtures';
import { notify } from '../lib/notify';
import { meHandler, renderApp } from '../test/render';
import { API, server } from '../test/server';

let projects: MemoryProject[];
let isAdmin: boolean;

beforeEach(() => {
  isAdmin = false;
  projects = [
    memoryProjectFixture({ membersCount: 3 }),
    memoryProjectFixture({
      id: 'proj-2',
      project: 'redes',
      title: 'Redes de computadores',
      role: 'write',
      source: 'invite',
      membersCount: 2,
      sync: 'pending',
    }),
    memoryProjectFixture({
      id: 'proj-3',
      workspace: 'ufba',
      project: 'web',
      title: 'Front end',
      team: true,
      role: 'read',
      source: 'team',
      membersCount: 5,
    }),
  ];
  server.use(
    meHandler(),
    http.get(`${API}/memory/status`, () =>
      HttpResponse.json({ memoryAvailable: true, userReady: true, isAdmin, computers: [memoryComputerFixture()] }),
    ),
    http.get(`${API}/memory/projects`, () => HttpResponse.json({ projects })),
  );
});

describe('/memory/projects', () => {
  it('lista título, identificador, papel, origem, membros, sincronização e selo Time', async () => {
    renderApp('/memory/projects');
    expect(await screen.findByRole('heading', { name: 'Meus projetos', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('TCC')).toBeInTheDocument();
    expect(screen.getByText('marina-costa/tcc')).toBeInTheDocument();
    expect(screen.getByText('Dono · Criado por você · 3 membros')).toBeInTheDocument();
    expect(screen.getByText('Escrita · Convite · 2 membros')).toBeInTheDocument();
    expect(screen.getByText('Leitura · Time · 5 membros')).toBeInTheDocument();
    expect(screen.getAllByText('Sincronizando…')).toHaveLength(1);
    expect(screen.getAllByText('Time')).toHaveLength(1);
    expect(screen.getByText('3 projetos')).toBeInTheDocument();
  });

  it('navegação da área Memória: marca Meus projetos e esconde Administração para quem não é admin', async () => {
    renderApp('/memory/projects');
    await screen.findByText('TCC');
    const tabs = screen.getByRole('navigation', { name: 'Seções da Memória' });
    expect(within(tabs).getByRole('link', { name: 'Meus projetos' })).toHaveAttribute('aria-current', 'page');
    expect(within(tabs).getByRole('link', { name: 'Computadores conectados' })).not.toHaveAttribute('aria-current');
    expect(within(tabs).queryByRole('link', { name: 'Administração' })).toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(within(nav).getByRole('link', { name: 'Memória' })).toHaveAttribute('aria-current', 'page');
  });

  it('admin vê o link Administração na navegação', async () => {
    isAdmin = true;
    renderApp('/memory/projects');
    const tabs = await screen.findByRole('navigation', { name: 'Seções da Memória' });
    expect(await within(tabs).findByRole('link', { name: 'Administração' })).toHaveAttribute('href', '/memory/admin');
  });

  it('estado vazio explica o que é um projeto e que quem tem acesso lê tudo', async () => {
    projects = [];
    renderApp('/memory/projects');
    expect(await screen.findByRole('heading', { name: 'Nenhum projeto ainda' })).toBeInTheDocument();
    expect(screen.getByText(/lê TODAS as páginas dele/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Novo projeto' })).toHaveLength(1);
  });

  it('clicar num projeto abre o detalhe', async () => {
    server.use(
      http.get(`${API}/memory/projects/:id`, ({ params }) =>
        HttpResponse.json(memoryProjectDetailFixture({ id: String(params.id), title: 'Redes de computadores' })),
      ),
    );
    renderApp('/memory/projects');
    await userEvent.click(await screen.findByRole('link', { name: /Redes de computadores/ }));
    expect(await screen.findByRole('heading', { name: 'Redes de computadores', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Marcador do repositório')).toBeInTheDocument();
  });

  it('novo projeto: valida 1 a 60 caracteres, cria, avisa com toast e abre o detalhe', async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/memory/projects`, async ({ request }) => {
        body = await request.json();
        const created = memoryProjectFixture({ id: 'proj-9', project: 'novo', title: 'Novo' });
        projects = [...projects, created];
        return HttpResponse.json(created, { status: 201 });
      }),
      http.get(`${API}/memory/projects/proj-9`, () =>
        HttpResponse.json(memoryProjectDetailFixture({ id: 'proj-9', title: 'Novo' })),
      ),
    );
    renderApp('/memory/projects');
    await userEvent.click(await screen.findByRole('button', { name: 'Novo projeto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Novo projeto' });
    const input = within(dialog).getByLabelText('Nome do projeto');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar projeto' }));
    expect(await within(dialog).findByText('Digite um nome.')).toBeInTheDocument();
    await userEvent.type(input, 'x'.repeat(61));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar projeto' }));
    expect(await within(dialog).findByText('Use até 60 caracteres.')).toBeInTheDocument();
    expect(body).toBeUndefined();

    await userEvent.clear(input);
    await userEvent.type(input, '  Novo  ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar projeto' }));

    await waitFor(() => expect(body).toEqual({ name: 'Novo' }));
    expect(await screen.findByRole('heading', { name: 'Novo', level: 1 })).toBeInTheDocument();
    expect(notify.success).toHaveBeenCalledWith('Projeto Novo criado.');
  });

  it('nome repetido (409) e pedido inválido (400) aparecem no campo', async () => {
    let status = 409;
    server.use(
      http.post(`${API}/memory/projects`, () =>
        status === 409
          ? HttpResponse.json({ error: 'project_name_taken', message: 'Você já tem um projeto com esse nome.' }, { status: 409 })
          : HttpResponse.json({ error: 'invalid_request', message: 'Nome inválido.' }, { status: 400 }),
      ),
    );
    renderApp('/memory/projects');
    await userEvent.click(await screen.findByRole('button', { name: 'Novo projeto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Novo projeto' });
    await userEvent.type(within(dialog).getByLabelText('Nome do projeto'), 'TCC');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar projeto' }));
    expect(await within(dialog).findByText('Você já tem um projeto com esse nome.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Nome do projeto')).toHaveAttribute('aria-invalid', 'true');

    status = 400;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar projeto' }));
    expect(await within(dialog).findByText('Nome inválido.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('falha ao carregar: avisa e deixa tentar de novo', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/memory/projects`, () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ error: 'internal_error', message: 'Erro nosso.' }, { status: 500 });
        return HttpResponse.json({ projects });
      }),
    );
    renderApp('/memory/projects');
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro nosso.');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('TCC')).toBeInTheDocument();
  });

  it('não tem violações de acessibilidade', async () => {
    const { container } = renderApp('/memory/projects');
    await screen.findByText('TCC');
    expect(await axe(container)).toHaveNoViolations();
  });
});
