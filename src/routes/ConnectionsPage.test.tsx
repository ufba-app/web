import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { Me } from '../contract';
import { meFixture } from '../contract/fixtures';
import { mockLocationAssign, mockLocationReplace, renderApp, signedOutMeHandler } from '../test/render';
import { API, server } from '../test/server';

let me: Me;

function withConnections(patch: Partial<Me['connections']>): Me {
  const base = meFixture();
  return { ...base, connections: { ...base.connections, ...patch } };
}

beforeEach(() => {
  me = meFixture();
  server.use(http.get(`${API}/me`, () => HttpResponse.json(me)));
});

describe('/connections', () => {
  it('tudo conectado: contador, selos e a conta do Classroom', async () => {
    renderApp('/connections');
    expect(await screen.findByText('3 de 3 conectadas')).toBeInTheDocument();
    expect(screen.getAllByText('Conectado').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole('button', { name: 'Remover marina.costa@ufba.br' })).toBeInTheDocument();
    expect(screen.getByText(/Usuário marina\.costa · só leitura/)).toBeInTheDocument();
  });

  it('sem sessão manda para o login no app de auth, com o destino para voltar', async () => {
    server.use(signedOutMeHandler());
    const replace = mockLocationReplace();
    renderApp('/connections');
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('http://localhost:3002/sign-in?return=%2Fconnections'),
    );
    // O painel não mostra o login: ele vive no auth. A moldura fica até o navegador sair daqui.
    expect(screen.queryByRole('heading', { name: 'Entrar' })).toBeNull();
  });

  it('o destino do login é só caminho relativo: o auth recebe /connections, nunca uma origem', async () => {
    server.use(signedOutMeHandler());
    const replace = mockLocationReplace();
    renderApp('/connections?connected=classroom');
    await waitFor(() => expect(replace).toHaveBeenCalled());
    const target = new URL(replace.mock.calls[0]?.[0] as string);
    expect(target.origin).toBe('http://localhost:3002');
    expect(target.pathname).toBe('/sign-in');
    expect(target.searchParams.get('return')).toBe('/connections?connected=classroom');
  });

  it('SIGAA pedindo senha: "Sessão expirou" e botão para digitar', async () => {
    me = withConnections({ sigaa: { status: 'password_required', login: 'marina.costa' } });
    renderApp('/connections');
    expect(await screen.findByText('Sessão expirou')).toBeInTheDocument();
    expect(screen.getByText('2 de 3 conectadas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Digitar senha' })).toBeInTheDocument();
  });

  it('Classroom indisponível no servidor: o bloco some e o total é 2', async () => {
    const base = meFixture();
    me = withConnections({ classroom: { ...base.connections.classroom, available: false, accounts: [] } });
    renderApp('/connections');
    expect(await screen.findByText('2 de 2 conectadas')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Classroom' })).toBeNull();
  });

  it('não tem violações de acessibilidade', async () => {
    const { container } = renderApp('/connections');
    await screen.findByText('3 de 3 conectadas');
    expect(await axe(container)).toHaveNoViolations();
  });

  describe('SIGAA', () => {
    beforeEach(() => {
      me = withConnections({ sigaa: { status: 'disconnected', login: null } });
    });

    async function openDialog() {
      await userEvent.click(await screen.findByRole('button', { name: 'Conectar' }));
      return screen.findByRole('dialog', { name: 'Conectar o SIGAA' });
    }

    it('explica que a senha é cifrada e linka o código aberto', async () => {
      renderApp('/connections');
      const dialog = await openDialog();
      expect(within(dialog).getByText(/cifrada com uma chave que o servidor sozinho não consegue abrir/)).toBeInTheDocument();
      const link = within(dialog).getByRole('link', { name: 'veja no GitHub' });
      expect(link).toHaveAttribute('href', 'https://github.com/ufba-app/platform');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    });

    it('manda usuário e senha direto para a API e apaga a senha do campo assim que envia', async () => {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => (release = resolve));
      let body: unknown;
      let headers: Headers | undefined;
      server.use(
        http.post(`${API}/connections/sigaa`, async ({ request }) => {
          body = await request.json();
          headers = request.headers;
          await gate;
          me = meFixture();
          return new HttpResponse(null, { status: 204 });
        }),
      );
      renderApp('/connections');
      const dialog = await openDialog();
      const password = within(dialog).getByLabelText('Senha do SIGAA');
      expect(password).toHaveAttribute('type', 'password');
      expect(password).toHaveAttribute('autocomplete', 'current-password');

      await userEvent.type(within(dialog).getByLabelText(/Usuário do SIGAA/), ' marina.costa ');
      await userEvent.type(password, 's3nh4-secreta');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Conectar' }));

      // Com a requisição ainda no ar, o campo já está vazio.
      await waitFor(() => expect(password).toHaveValue(''));
      release();

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(body).toEqual({ login: 'marina.costa', password: 's3nh4-secreta' });
      expect(headers?.get('x-ufba')).toBe('1');
      expect(await screen.findByText('SIGAA conectado.')).toBeInTheDocument();
      expect(await screen.findByText('3 de 3 conectadas')).toBeInTheDocument();
    });

    it('senha errada: mostra a mensagem da API, mantém o usuário e deixa a senha vazia', async () => {
      server.use(
        http.post(`${API}/connections/sigaa`, () =>
          HttpResponse.json({ error: 'invalid_credentials', message: 'Usuário ou senha do SIGAA incorretos.' }, { status: 422 }),
        ),
      );
      renderApp('/connections');
      const dialog = await openDialog();
      await userEvent.type(within(dialog).getByLabelText(/Usuário do SIGAA/), 'marina.costa');
      await userEvent.type(within(dialog).getByLabelText('Senha do SIGAA'), 'errada');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Conectar' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Usuário ou senha do SIGAA incorretos.');
      expect(within(dialog).getByLabelText('Senha do SIGAA')).toHaveValue('');
      expect(within(dialog).getByLabelText(/Usuário do SIGAA/)).toHaveValue('marina.costa');
      // A senha digitada não aparece em nenhum lugar da página.
      expect(document.body.textContent).not.toContain('errada');
    });

    it('campos vazios: pede o preenchimento sem chamar a API', async () => {
      const spy = vi.fn();
      server.use(http.post(`${API}/connections/sigaa`, () => (spy(), new HttpResponse(null, { status: 204 }))));
      renderApp('/connections');
      const dialog = await openDialog();
      await userEvent.click(within(dialog).getByRole('button', { name: 'Conectar' }));
      expect(await within(dialog).findByText('Digite o usuário do SIGAA.')).toBeInTheDocument();
      expect(within(dialog).getByText('Digite a senha do SIGAA.')).toBeInTheDocument();
      expect(within(dialog).getByLabelText(/Usuário do SIGAA/)).toHaveAttribute('aria-invalid', 'true');
      expect(within(dialog).getByLabelText('Senha do SIGAA')).toHaveAccessibleDescription('Digite a senha do SIGAA.');
      expect(spy).not.toHaveBeenCalled();
    });

    it('usuário só com espaços conta como vazio; a mensagem some quando a pessoa corrige', async () => {
      const spy = vi.fn();
      server.use(http.post(`${API}/connections/sigaa`, () => (spy(), new HttpResponse(null, { status: 204 }))));
      renderApp('/connections');
      const dialog = await openDialog();
      await userEvent.type(within(dialog).getByLabelText(/Usuário do SIGAA/), '   ');
      await userEvent.type(within(dialog).getByLabelText('Senha do SIGAA'), 'x');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Conectar' }));
      expect(await within(dialog).findByText('Digite o usuário do SIGAA.')).toBeInTheDocument();
      expect(within(dialog).queryByText('Digite a senha do SIGAA.')).toBeNull();
      expect(spy).not.toHaveBeenCalled();

      await userEvent.type(within(dialog).getByLabelText(/Usuário do SIGAA/), 'marina.costa');
      await waitFor(() => expect(within(dialog).queryByText('Digite o usuário do SIGAA.')).toBeNull());
    });

    it('a senha vai exatamente como foi digitada: espaços nas pontas não são aparados', async () => {
      let body: unknown;
      server.use(
        http.post(`${API}/connections/sigaa`, async ({ request }) => {
          body = await request.json();
          me = meFixture();
          return new HttpResponse(null, { status: 204 });
        }),
      );
      renderApp('/connections');
      const dialog = await openDialog();
      await userEvent.type(within(dialog).getByLabelText(/Usuário do SIGAA/), 'marina.costa');
      await userEvent.type(within(dialog).getByLabelText('Senha do SIGAA'), ' a b ');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Conectar' }));
      await waitFor(() => expect(body).toEqual({ login: 'marina.costa', password: ' a b ' }));
    });

    it('limite de tentativas vira a mensagem da API', async () => {
      server.use(
        http.post(`${API}/connections/sigaa`, () =>
          HttpResponse.json({ error: 'too_many_attempts', message: 'Muitas tentativas. Espere um pouco.' }, { status: 429 }),
        ),
      );
      renderApp('/connections');
      const dialog = await openDialog();
      await userEvent.type(within(dialog).getByLabelText(/Usuário do SIGAA/), 'marina.costa');
      await userEvent.type(within(dialog).getByLabelText('Senha do SIGAA'), 'x');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Conectar' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Muitas tentativas. Espere um pouco.');
    });
  });

  describe('Classroom', () => {
    it('conectar vai para a API em página inteira, com o app certo', async () => {
      const assign = mockLocationAssign();
      renderApp('/connections');
      await userEvent.click(await screen.findByRole('button', { name: 'Conectar outra conta' }));
      expect(assign).toHaveBeenCalledWith(`${API}/connections/classroom/start?app=guest`);
      await userEvent.click(screen.getByRole('button', { name: 'Conectar conta @ufba.br' }));
      expect(assign).toHaveBeenCalledWith(`${API}/connections/classroom/start?app=ufba`);
    });

    it('remover uma conta chama DELETE com o e-mail codificado e atualiza a lista', async () => {
      let path = '';
      server.use(
        http.delete(`${API}/connections/classroom/:email`, ({ request }) => {
          path = new URL(request.url).pathname;
          const base = meFixture();
          me = withConnections({ classroom: { ...base.connections.classroom, accounts: [] } });
          return new HttpResponse(null, { status: 204 });
        }),
      );
      renderApp('/connections');
      await userEvent.click(await screen.findByRole('button', { name: 'Remover marina.costa@ufba.br' }));
      await waitFor(() => expect(path).toBe('/connections/classroom/marina.costa%40ufba.br'));
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Remover marina.costa@ufba.br' })).toBeNull(),
      );
    });

    it('conta que precisa reconectar aparece como "Acesso expirou"', async () => {
      const base = meFixture();
      me = withConnections({
        classroom: { ...base.connections.classroom, accounts: [{ email: 'a@gmail.com', status: 'reconnect_required' }] },
      });
      renderApp('/connections');
      expect(await screen.findByText('Acesso expirou')).toBeInTheDocument();
    });

    it('volta do Google com sucesso: avisa e limpa a barra de endereço', async () => {
      renderApp('/connections?connected=classroom');
      expect(await screen.findByText('Conta do Classroom conectada.')).toBeInTheDocument();
    });

    it('volta do Google com erro: mostra o texto da API como texto', async () => {
      renderApp(`/connections?error=access_denied&message=${encodeURIComponent('Essa conta não está liberada.')}`);
      expect(await screen.findByRole('alert')).toHaveTextContent('Essa conta não está liberada.');
    });
  });

  describe('desconectar SIGAA e Moodle', () => {
    it.each([
      ['sigaa', 'SIGAA'],
      ['moodle', 'Moodle'],
    ] as const)('%s: pede confirmação, chama DELETE sem corpo e atualiza a tela', async (source, label) => {
      let call: { ufba: string | null; type: string | null } | undefined;
      server.use(
        http.delete(`${API}/connections/${source}`, ({ request }) => {
          call = { ufba: request.headers.get('x-ufba'), type: request.headers.get('content-type') };
          me = withConnections(
            source === 'sigaa'
              ? { sigaa: { status: 'disconnected', login: null } }
              : { moodle: { status: 'disconnected', account: null } },
          );
          return new HttpResponse(null, { status: 204 });
        }),
      );
      renderApp('/connections');

      await userEvent.click(await screen.findByRole('button', { name: `Desconectar o ${label}` }));
      const dialog = await screen.findByRole('dialog', { name: `Desconectar o ${label}?` });
      expect(call).toBeUndefined(); // abrir o diálogo não desconecta nada

      await userEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(call).toEqual({ ufba: '1', type: null });
      expect(await screen.findByText(`${label} desconectado.`)).toBeInTheDocument();
      expect(await screen.findByText('2 de 3 conectadas')).toBeInTheDocument();
    });

    it('cancelar não desconecta', async () => {
      const spy = vi.fn();
      server.use(http.delete(`${API}/connections/sigaa`, () => (spy(), new HttpResponse(null, { status: 204 }))));
      renderApp('/connections');
      await userEvent.click(await screen.findByRole('button', { name: 'Desconectar o SIGAA' }));
      const dialog = await screen.findByRole('dialog', { name: 'Desconectar o SIGAA?' });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(spy).not.toHaveBeenCalled();
      expect(screen.getByText('3 de 3 conectadas')).toBeInTheDocument();
    });

    it('falha ao desconectar: mostra a mensagem da API e mantém o diálogo aberto', async () => {
      server.use(
        http.delete(`${API}/connections/moodle`, () =>
          HttpResponse.json({ error: 'internal_error', message: 'Erro nosso. Tente de novo.' }, { status: 500 }),
        ),
      );
      renderApp('/connections');
      await userEvent.click(await screen.findByRole('button', { name: 'Desconectar o Moodle' }));
      const dialog = await screen.findByRole('dialog', { name: 'Desconectar o Moodle?' });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Erro nosso. Tente de novo.');
    });

    it('fonte desconectada não mostra o botão Desconectar', async () => {
      me = withConnections({ sigaa: { status: 'disconnected', login: null } });
      renderApp('/connections');
      await screen.findByText('2 de 3 conectadas');
      expect(screen.queryByRole('button', { name: 'Desconectar o SIGAA' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Desconectar o Moodle' })).toBeInTheDocument();
    });
  });

  describe('Moodle', () => {
    beforeEach(() => {
      me = withConnections({ moodle: { status: 'disconnected', account: null } });
    });

    it('Permitir registra o esquema do Moodle; Abrir o Moodle chama start e abre o launchUrl', async () => {
      const register = vi.fn();
      Object.defineProperty(navigator, 'registerProtocolHandler', { configurable: true, value: register });
      const tab = { location: { href: '' }, opener: {} as unknown, close: vi.fn() };
      vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
      server.use(
        http.post(`${API}/connections/moodle/start`, () =>
          HttpResponse.json({ launchUrl: 'https://ava.ufba.br/admin/tool/mobile/launch.php?x=1', scheme: 'web+ufba' }),
        ),
      );
      renderApp('/connections');

      await userEvent.click(await screen.findAllByRole('button', { name: 'Conectar' }).then((b) => b[0] as HTMLElement));
      const dialog = await screen.findByRole('dialog', { name: 'Conectar o Moodle' });

      await userEvent.click(within(dialog).getByRole('button', { name: 'Permitir' }));
      expect(register).toHaveBeenCalledWith('web+ufba', 'http://localhost:3001/connections/moodle/capture?u=%s');

      await userEvent.click(within(dialog).getByRole('button', { name: 'Abrir o Moodle' }));
      expect(await within(dialog).findByRole('status')).toHaveTextContent('Esperando o Moodle…');
      expect(tab.location.href).toBe('https://ava.ufba.br/admin/tool/mobile/launch.php?x=1');
      expect(tab.opener).toBeNull();
      vi.restoreAllMocks();
    });

    it('espera a volta consultando /me e fecha quando o Moodle conecta', async () => {
      Object.defineProperty(navigator, 'registerProtocolHandler', { configurable: true, value: vi.fn() });
      vi.spyOn(window, 'open').mockReturnValue({ location: { href: '' }, opener: null, close: vi.fn() } as unknown as Window);
      server.use(
        http.post(`${API}/connections/moodle/start`, () =>
          HttpResponse.json({ launchUrl: 'https://ava.ufba.br/launch', scheme: 'web+ufba' }),
        ),
      );
      renderApp('/connections');
      await userEvent.click(await screen.findAllByRole('button', { name: 'Conectar' }).then((b) => b[0] as HTMLElement));
      const dialog = await screen.findByRole('dialog', { name: 'Conectar o Moodle' });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Abrir o Moodle' }));
      await within(dialog).findByRole('status');

      // A pessoa termina o login em outra aba; a API passa a dizer que o Moodle está conectado.
      me = meFixture();

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 6000 });
      expect(await screen.findByText('Moodle conectado.')).toBeInTheDocument();
      vi.restoreAllMocks();
    }, 15000);

    it('plano B: colar o link envia { link } à API', async () => {
      let body: unknown;
      Object.defineProperty(navigator, 'registerProtocolHandler', { configurable: true, value: vi.fn() });
      vi.spyOn(window, 'open').mockReturnValue({ location: { href: '' }, opener: null, close: vi.fn() } as unknown as Window);
      server.use(
        http.post(`${API}/connections/moodle/start`, () =>
          HttpResponse.json({ launchUrl: 'https://ava.ufba.br/launch', scheme: 'web+ufba' }),
        ),
        http.post(`${API}/connections/moodle`, async ({ request }) => {
          body = await request.json();
          me = meFixture();
          return new HttpResponse(null, { status: 204 });
        }),
      );
      renderApp('/connections');
      await userEvent.click(await screen.findAllByRole('button', { name: 'Conectar' }).then((b) => b[0] as HTMLElement));
      const dialog = await screen.findByRole('dialog', { name: 'Conectar o Moodle' });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Abrir o Moodle' }));
      const linkField = await within(dialog).findByLabelText(/cole o link/i);
      expect(within(dialog).getByRole('button', { name: 'Conectar com o link' })).toBeDisabled();
      await userEvent.type(linkField, ' web+ufba://token=abc '); // espaços nas pontas são aparados
      await userEvent.click(within(dialog).getByRole('button', { name: 'Conectar com o link' }));

      await waitFor(() => expect(body).toEqual({ link: 'web+ufba://token=abc' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      vi.restoreAllMocks();
    });
  });
});

describe('/connections/moodle/capture', () => {
  it('envia o link à API, tira o link da barra de endereço e avisa que conectou', async () => {
    let body: unknown;
    const replace = vi.spyOn(window.history, 'replaceState');
    server.use(
      http.post(`${API}/connections/moodle`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    window.history.pushState(null, '', `/connections/moodle/capture?u=${encodeURIComponent('web+ufba://token=abc')}`);

    renderApp('/connections/moodle/capture');

    expect(await screen.findByRole('heading', { name: 'Moodle conectado' })).toBeInTheDocument();
    expect(body).toEqual({ link: 'web+ufba://token=abc' });
    expect(replace).toHaveBeenCalledWith(null, '', '/connections/moodle/capture');
    replace.mockRestore();
  });

  it('link recusado pela API: mostra a mensagem dela', async () => {
    server.use(
      http.post(`${API}/connections/moodle`, () =>
        HttpResponse.json({ error: 'invalid_credentials', message: 'O link do Moodle não vale mais.' }, { status: 422 }),
      ),
    );
    window.history.pushState(null, '', `/connections/moodle/capture?u=${encodeURIComponent('web+ufba://token=velho')}`);
    renderApp('/connections/moodle/capture');
    expect(await screen.findByText('O link do Moodle não vale mais.')).toBeInTheDocument();
  });

  it('sem link na URL: avisa sem chamar a API', async () => {
    const spy = vi.fn();
    server.use(http.post(`${API}/connections/moodle`, () => (spy(), new HttpResponse(null, { status: 204 }))));
    window.history.pushState(null, '', '/connections/moodle/capture');
    renderApp('/connections/moodle/capture');
    expect(await screen.findByText(/o link do moodle não chegou/i)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });
});
