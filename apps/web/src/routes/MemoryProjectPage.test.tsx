import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { MemoryProjectDetail } from '../contract';
import { memoryProjectDetailFixture, memoryProjectFixture } from '../contract/fixtures';
import { notify } from '../lib/notify';
import { meHandler, renderApp } from '../test/render';
import { API, server } from '../test/server';

let project: MemoryProjectDetail;

const ownerProject = () =>
  memoryProjectDetailFixture({
    membersCount: 4,
    members: [
      { email: 'joao.souza@ufba.br', name: 'João Souza', level: 'write', status: 'active' },
      { email: 'ana.lima@ufba.br', name: null, level: 'read', status: 'active' },
      { email: 'pedro.alves@ufba.br', name: null, level: 'write', status: 'pending' },
    ],
  });

beforeEach(() => {
  project = ownerProject();
  server.use(
    meHandler(),
    http.get(`${API}/memory/status`, () =>
      HttpResponse.json({ memoryAvailable: true, userReady: true, isAdmin: false, computers: [] }),
    ),
    http.get(`${API}/memory/projects`, () => HttpResponse.json({ projects: [memoryProjectFixture()] })),
    http.get(`${API}/memory/projects/:id`, () => HttpResponse.json(project)),
  );
});

const forbidden = (error: string, message: string, status = 403) =>
  HttpResponse.json({ error, message }, { status });

describe('/memory/projects/:id', () => {
  it('cabeçalho, aviso fixo e marcador com explicação', async () => {
    renderApp('/memory/projects/proj-1');
    expect(await screen.findByRole('heading', { name: 'TCC', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('marina-costa/tcc')).toBeInTheDocument();
    expect(screen.getByText('Dono')).toBeInTheDocument();
    expect(
      screen.getByText(/Quem tem acesso lê todas as páginas do projeto \(não há permissão por página\)\. Não grave senhas, tokens nem dados pessoais de outras pessoas\./),
    ).toBeInTheDocument();
    expect(screen.getByText('Marcador do repositório')).toBeInTheDocument();
    expect(screen.getByLabelText('Conteúdo do marcador')).toHaveTextContent('workspace = "marina-costa"');
    expect(screen.getByText(/na raiz do repositório\. Sem esse arquivo nada é capturado\./)).toBeInTheDocument();
  });

  it('indicador Sincronizando… quando sync é pending', async () => {
    project = { ...ownerProject(), sync: 'pending' };
    renderApp('/memory/projects/proj-1');
    expect(await screen.findByText('Sincronizando…')).toBeInTheDocument();
  });

  it('copiar o marcador: usa a área de transferência e avisa com toast', async () => {
    const user = userEvent.setup();
    renderApp('/memory/projects/proj-1');
    await user.click(await screen.findByRole('button', { name: 'Copiar' }));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Copiado'));
    expect(await navigator.clipboard.readText()).toBe(project.marker);
  });

  it('dono: lista membros, convite pendente e só habilita Transferir para ativo com escrita', async () => {
    renderApp('/memory/projects/proj-1');
    expect(await screen.findByText('João Souza')).toBeInTheDocument();
    expect(screen.getByText('joao.souza@ufba.br · Escrita')).toBeInTheDocument();
    expect(screen.getByText('ana.lima@ufba.br')).toBeInTheDocument();
    expect(screen.getAllByText('Convite pendente')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Transferir posse para João Souza' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Transferir posse para ana.lima@ufba.br' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Transferir posse para pedro.alves@ufba.br' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Sair do projeto' })).toBeNull();
  });

  it('convidar: valida o domínio no formulário e envia e-mail codificado com o nível', async () => {
    let received: { path: string; body: unknown; headers: Headers } | undefined;
    server.use(
      http.put(`${API}/memory/projects/:id/members/:email`, async ({ request }) => {
        received = { path: new URL(request.url).pathname, body: await request.json(), headers: request.headers };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/memory/projects/proj-1');
    const form = await screen.findByRole('form', { name: 'Convidar pessoa' });
    const input = within(form).getByLabelText(/E-mail da pessoa/);

    await userEvent.click(within(form).getByRole('button', { name: 'Convidar' }));
    expect(await within(form).findByText('Digite o e-mail da pessoa.')).toBeInTheDocument();
    await userEvent.type(input, 'fulano@gmail.com');
    await userEvent.click(within(form).getByRole('button', { name: 'Convidar' }));
    expect(await within(form).findByText('Use um e-mail @ufba.br.')).toBeInTheDocument();
    expect(received).toBeUndefined();

    await userEvent.clear(input);
    await userEvent.type(input, 'Maria+x@UFBA.br');
    await userEvent.selectOptions(within(form).getByLabelText('Nível de acesso'), 'write');
    await userEvent.click(within(form).getByRole('button', { name: 'Convidar' }));

    await waitFor(() => expect(received?.path).toBe('/memory/projects/proj-1/members/maria%2Bx%40ufba.br'));
    expect(received?.body).toEqual({ level: 'write' });
    expect(received?.headers.get('x-ufba')).toBe('1');
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Convite enviado para maria+x@ufba.br.'));
    expect(input).toHaveValue('');
  });

  it('invalid_email_domain da API aparece no campo; outros erros viram toast', async () => {
    let code = 'invalid_email_domain';
    server.use(
      http.put(`${API}/memory/projects/:id/members/:email`, () =>
        code === 'invalid_email_domain'
          ? forbidden('invalid_email_domain', 'Só e-mails @ufba.br podem ser convidados.', 400)
          : forbidden('not_project_owner', 'Só o dono pode convidar.'),
      ),
    );
    renderApp('/memory/projects/proj-1');
    const form = await screen.findByRole('form', { name: 'Convidar pessoa' });
    await userEvent.type(within(form).getByLabelText(/E-mail da pessoa/), 'ana@ufba.br');
    await userEvent.click(within(form).getByRole('button', { name: 'Convidar' }));
    expect(await within(form).findByText('Só e-mails @ufba.br podem ser convidados.')).toBeInTheDocument();
    expect(notify.error).not.toHaveBeenCalled();

    code = 'not_project_owner';
    await userEvent.click(within(form).getByRole('button', { name: 'Convidar' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Só o dono pode convidar.'));
  });

  it('mudar nível e remover membro: chamam a API, avisam e recarregam', async () => {
    const calls: string[] = [];
    server.use(
      http.put(`${API}/memory/projects/:id/members/:email`, async ({ request }) => {
        calls.push(`PUT ${new URL(request.url).pathname} ${JSON.stringify(await request.json())}`);
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(`${API}/memory/projects/:id/members/:email`, ({ request }) => {
        calls.push(`DELETE ${new URL(request.url).pathname}`);
        project = { ...project, members: project.members.filter((m) => m.email !== 'ana.lima@ufba.br') };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/memory/projects/proj-1');
    await userEvent.click(await screen.findByRole('button', { name: 'Mudar ana.lima@ufba.br para escrita' }));
    await waitFor(() =>
      expect(calls).toContain('PUT /memory/projects/proj-1/members/ana.lima%40ufba.br {"level":"write"}'),
    );
    expect(notify.success).toHaveBeenCalledWith('ana.lima@ufba.br agora tem escrita.');

    await userEvent.click(screen.getByRole('button', { name: 'Remover ana.lima@ufba.br' }));
    await waitFor(() => expect(calls).toContain('DELETE /memory/projects/proj-1/members/ana.lima%40ufba.br'));
    await waitFor(() => expect(screen.queryByText('ana.lima@ufba.br')).toBeNull());
  });

  it('transferir posse: confirma no diálogo, chama POST com o e-mail e recarrega como escrita', async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/memory/projects/:id/transfer`, async ({ request }) => {
        body = await request.json();
        project = { ...ownerProject(), role: 'write', source: 'invite', members: [] };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/memory/projects/proj-1');
    await userEvent.click(await screen.findByRole('button', { name: 'Transferir posse para João Souza' }));
    const dialog = await screen.findByRole('dialog', { name: 'Transferir a posse?' });
    expect(within(dialog).getByText(/Você continua com escrita/)).toBeInTheDocument();
    expect(body).toBeUndefined();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Transferir posse' }));

    await waitFor(() => expect(body).toEqual({ email: 'joao.souza@ufba.br' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(notify.success).toHaveBeenCalledWith('A posse foi para João Souza. Você continua com escrita.');
    expect(await screen.findByRole('button', { name: 'Sair do projeto' })).toBeInTheDocument();
  });

  it('transferir com erro 403: toast e o diálogo fecha', async () => {
    server.use(
      http.post(`${API}/memory/projects/:id/transfer`, () =>
        forbidden('not_project_owner', 'Só o dono pode transferir.'),
      ),
    );
    renderApp('/memory/projects/proj-1');
    await userEvent.click(await screen.findByRole('button', { name: 'Transferir posse para João Souza' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Transferir posse' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Só o dono pode transferir.'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('apagar: o botão só habilita com o título certo, avisa que não dá para desfazer e volta para a lista', async () => {
    let deleted = false;
    server.use(
      http.delete(`${API}/memory/projects/proj-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/memory/projects/proj-1');
    await userEvent.click(await screen.findByRole('button', { name: 'Apagar projeto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Apagar projeto?' });
    expect(within(dialog).getByText(/também todo o conteúdo dele no memory/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Não dá para desfazer/)).toBeInTheDocument();
    const confirmButton = within(dialog).getByRole('button', { name: 'Apagar projeto' });
    expect(confirmButton).toBeDisabled();

    const input = within(dialog).getByLabelText(/digite o título do projeto/);
    await userEvent.type(input, 'TC');
    expect(confirmButton).toBeDisabled();
    await userEvent.type(input, 'C');
    await waitFor(() => expect(confirmButton).toBeEnabled());
    await userEvent.click(confirmButton);

    await waitFor(() => expect(deleted).toBe(true));
    expect(notify.success).toHaveBeenCalledWith('Projeto TCC apagado.');
    expect(await screen.findByRole('heading', { name: 'Meus projetos', level: 1 })).toBeInTheDocument();
  });

  it('membro não dono: sem gestão, com "Sair do projeto" que usa o próprio e-mail', async () => {
    project = memoryProjectDetailFixture({ role: 'write', source: 'invite', members: [] });
    let path = '';
    server.use(
      http.delete(`${API}/memory/projects/:id/members/:email`, ({ request }) => {
        path = new URL(request.url).pathname;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/memory/projects/proj-1');
    await screen.findByRole('heading', { name: 'TCC', level: 1 });
    expect(screen.queryByRole('form', { name: 'Convidar pessoa' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apagar projeto' })).toBeNull();
    expect(screen.getByLabelText('Conteúdo do marcador')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sair do projeto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sair do projeto?' });
    expect(path).toBe('');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sair do projeto' }));

    await waitFor(() => expect(path).toBe('/memory/projects/proj-1/members/marina.costa%40ufba.br'));
    expect(notify.success).toHaveBeenCalledWith('Você saiu de TCC.');
    expect(await screen.findByRole('heading', { name: 'Meus projetos', level: 1 })).toBeInTheDocument();
  });

  it('projeto do time: somente leitura, sem ações', async () => {
    project = memoryProjectDetailFixture({ team: true, role: 'read', source: 'team', members: [] });
    renderApp('/memory/projects/proj-1');
    await screen.findByRole('heading', { name: 'TCC', level: 1 });
    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByText(/só leitura, sem ações/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sair do projeto' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apagar projeto' })).toBeNull();
    expect(screen.queryByRole('form', { name: 'Convidar pessoa' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeInTheDocument();
  });

  it('projeto inexistente (404): estado próprio com volta para a lista', async () => {
    server.use(
      http.get(`${API}/memory/projects/:id`, () =>
        forbidden('project_not_found', 'Esse projeto não existe ou você não tem acesso.', 404),
      ),
    );
    renderApp('/memory/projects/nada');
    expect(await screen.findByRole('heading', { name: 'Projeto não encontrado' })).toBeInTheDocument();
    expect(screen.getByText('Esse projeto não existe ou você não tem acesso.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Voltar para Meus projetos' }).length).toBeGreaterThan(0);
  });

  it('falha ao carregar: avisa e deixa tentar de novo', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/memory/projects/:id`, () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ error: 'internal_error', message: 'Erro nosso.' }, { status: 500 });
        return HttpResponse.json(project);
      }),
    );
    renderApp('/memory/projects/proj-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro nosso.');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'TCC', level: 1 })).toBeInTheDocument();
  });

  it('não tem violações de acessibilidade', async () => {
    const { container } = renderApp('/memory/projects/proj-1');
    await screen.findByText('João Souza');
    expect(await axe(container)).toHaveNoViolations();
  });
});
