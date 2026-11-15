import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { Me } from '../contract';
import { meFixture } from '../contract/fixtures';
import { notify } from '../lib/notify';
import { renderApp } from '../test/render';
import { API, server } from '../test/server';

type Siasb = Me['connections']['siasb'];

const DAY = 24 * 60 * 60 * 1000;
/** Faltando exatamente `days` dias (menos 1 min, para o arredondamento para cima dar `days`). */
const inDays = (days: number) => new Date(Date.now() + days * DAY - 60_000).toISOString();

const withSiasb = (siasb: Siasb): Me => {
  const base = meFixture();
  return { ...base, connections: { ...base.connections, siasb } };
};

const offeredDisconnected: Siasb = { offered: true, status: 'disconnected', expiresAt: null };

let me: Me;
let posts: Array<{ body: unknown; csrf: string | null }>;
let deletes: number;
let academicStatus: 'NONE' | 'READY' | 'RUNNING';
let academicAvailable: boolean;

const academicState = () => ({
  available: academicAvailable,
  consent: academicStatus !== 'NONE',
  status: academicStatus,
  failure: null,
  verified: null,
  reader: null,
  importedAt: null,
  curriculumStatus: 'NONE',
  summary: null,
  draft: null,
});

beforeEach(() => {
  me = withSiasb(offeredDisconnected);
  posts = [];
  deletes = 0;
  academicStatus = 'READY';
  academicAvailable = true;
  vi.mocked(notify.success).mockClear();
  server.use(
    http.get(`${API}/me`, () => HttpResponse.json(me)),
    http.get(`${API}/me/academic`, () => HttpResponse.json(academicState())),
    // A lista de permissões acompanha a conexão do SIASB (available).
    http.get(`${API}/me/permissions`, () =>
      HttpResponse.json({
        items: [
          {
            key: 'siasb.schedule_write',
            source: 'siasb',
            title: 'Agendar e desmarcar sessões pelo Claude',
            description: 'Permite que o Claude marque e desmarque sessões da clínica no SIASB em seu nome.',
            risk: 'low',
            enabled: false,
            available: me.connections.siasb.status !== 'disconnected',
            unavailableReason: me.connections.siasb.status === 'disconnected' ? 'source_not_connected' : null,
          },
        ],
      }),
    ),
    http.post(`${API}/connections/siasb`, async ({ request }) => {
      posts.push({ body: await request.json(), csrf: request.headers.get('x-ufba') });
      me = withSiasb({ offered: true, status: 'connected', expiresAt: new Date('2026-12-15T15:00:00.000Z').toISOString() });
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(`${API}/connections/siasb`, () => {
      deletes += 1;
      me = withSiasb(offeredDisconnected);
      return new HttpResponse(null, { status: 204 });
    }),
  );
});

const openDialog = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'Conectar' }));
  return screen.findByRole('dialog', { name: 'Conectar o SIASB' });
};

describe('/connections · SIASB: quando aparece', () => {
  it('oferecido e desconectado: cartão com "Só leitura" e "Conectar", e conta no total', async () => {
    renderApp('/connections');
    const card = (await screen.findByRole('heading', { name: 'SIASB', level: 3 })).closest('article')!;
    expect(within(card).getByText('Só leitura')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Conectar' })).toBeInTheDocument();
    expect(screen.getByText('3 de 4 conectadas')).toBeInTheDocument();
  });

  it('não oferecido e a vida acadêmica ainda não confirmada: convida a importar primeiro', async () => {
    me = withSiasb({ offered: false, status: 'disconnected', expiresAt: null });
    academicStatus = 'NONE';
    renderApp('/connections');
    expect(await screen.findByText('Importe a sua vida acadêmica para liberar a conexão com o SIASB.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Importar vida acadêmica' }));
    expect(await screen.findByRole('heading', { name: 'Quer ver sua vida acadêmica aqui?' })).toBeInTheDocument();
  });

  it('não oferecido e a vida acadêmica já confirmada: o SIASB não é do curso, nada aparece e não conta', async () => {
    me = withSiasb({ offered: false, status: 'disconnected', expiresAt: null });
    academicStatus = 'READY';
    renderApp('/connections');
    expect(await screen.findByText('3 de 3 conectadas')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'SIASB', level: 3 })).toBeNull();
    expect(screen.queryByText(/Importe a sua vida acadêmica para liberar/)).toBeNull();
  });

  it('não oferecido e a importação indisponível: nada aparece', async () => {
    me = withSiasb({ offered: false, status: 'disconnected', expiresAt: null });
    academicStatus = 'NONE';
    academicAvailable = false;
    renderApp('/connections');
    expect(await screen.findByText('3 de 3 conectadas')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'SIASB', level: 3 })).toBeNull();
  });
});

describe('/connections · SIASB: conectar', () => {
  it('o diálogo pede só a senha: sem campo de matrícula', async () => {
    renderApp('/connections');
    const dialog = await openDialog();
    expect(within(dialog).getByText('A matrícula vem do seu perfil. Falta só a senha.')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/matrícula/i)).toBeNull();
    const password = within(dialog).getByLabelText('Senha do SIASB');
    expect(password).toHaveAttribute('type', 'password');
    expect(within(dialog).getByText(/usada uma vez para entrar no SIASB e não fica guardada/)).toBeInTheDocument();
    expect(within(dialog).getByText(/O acesso vale por 30 dias/)).toBeInTheDocument();
  });

  it('manda só a senha, com X-UFBA; o campo esvazia ao enviar; no fim mostra até quando vale e o cartão atualiza', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.post(`${API}/connections/siasb`, async ({ request }) => {
        posts.push({ body: await request.json(), csrf: request.headers.get('x-ufba') });
        await gate;
        me = withSiasb({ offered: true, status: 'connected', expiresAt: new Date('2026-12-15T15:00:00.000Z').toISOString() });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/connections');
    const dialog = await openDialog();
    const password = within(dialog).getByLabelText('Senha do SIASB');
    await userEvent.type(password, 's3nh4-do-siasb');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Conectar' }));

    // Com a requisição ainda no ar: campo vazio, "Entrando…" e a senha em lugar nenhum da página nem da URL.
    await waitFor(() => expect(password).toHaveValue(''));
    expect(await within(dialog).findByRole('status')).toHaveTextContent('Entrando no SIASB…');
    expect(document.body.innerHTML).not.toContain('s3nh4-do-siasb');
    expect(window.location.href).not.toContain('s3nh4');
    release();

    const done = await screen.findByRole('dialog', { name: 'SIASB conectado' });
    expect(within(done).getByText('Acesso válido por 30 dias, até 15 dez.')).toBeInTheDocument();
    expect(posts).toEqual([{ body: { password: 's3nh4-do-siasb' }, csrf: '1' }]);
    expect(notify.success).toHaveBeenCalledWith('SIASB conectado.');
    expect(document.body.innerHTML).not.toContain('s3nh4-do-siasb');

    await userEvent.click(within(done).getByRole('button', { name: 'Concluir' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Acesso até 15 dez · só leitura')).toBeInTheDocument();
    expect(screen.getByText('4 de 4 conectadas')).toBeInTheDocument();
  });

  it('depois de conectar, a lista de permissões recarrega e o interruptor da fonte destrava', async () => {
    renderApp('/connections');
    const toggle = await screen.findByRole('switch', { name: 'Agendar e desmarcar sessões pelo Claude' });
    expect(toggle).toBeDisabled();
    expect(screen.getByText('Conecte o SIASB para liberar')).toBeInTheDocument();

    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText('Senha do SIASB'), 'qualquer');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Conectar' }));
    // Com o diálogo modal aberto, o resto da página fica oculto para leitor de tela: a pessoa fecha ("Concluir") e vê.
    const done = await screen.findByRole('dialog', { name: 'SIASB conectado' });
    await userEvent.click(within(done).getByRole('button', { name: 'Concluir' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await waitFor(() => expect(screen.getByRole('switch', { name: 'Agendar e desmarcar sessões pelo Claude' })).toBeEnabled());
    expect(screen.queryByText('Conecte o SIASB para liberar')).toBeNull();
  });

  it('senha vazia: erro no campo e nada é enviado', async () => {
    renderApp('/connections');
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Conectar' }));
    expect(await within(dialog).findByText('Digite a senha do SIASB.')).toBeInTheDocument();
    expect(posts).toEqual([]);
  });

  describe.each([
    ['422 siasb_credentials_rejected', 422, 'siasb_credentials_rejected', 'Senha incorreta. Confira e tente de novo.', 'Conectar'],
    [
      '422 siasb_password_migration_required',
      422,
      'siasb_password_migration_required',
      'Sua senha ainda é a antiga do SIASB. Entre uma vez no SIASB para atualizar a senha e volte aqui.',
      'Tentar de novo',
    ],
    ['503 siasb_unavailable', 503, 'siasb_unavailable', 'O SIASB está fora do ar. Tente de novo em alguns minutos.', 'Tentar de novo'],
    ['429 too_many_attempts', 429, 'too_many_attempts', 'Muitas tentativas. Espere alguns minutos e tente de novo.', 'Conectar'],
  ] as const)('%s', (_label, status, code, text, button) => {
    it('mostra o texto, limpa a senha, mantém o diálogo aberto e não avisa de sucesso', async () => {
      server.use(
        http.post(`${API}/connections/siasb`, () => HttpResponse.json({ error: code, message: 'texto da API' }, { status })),
      );
      renderApp('/connections');
      const dialog = await openDialog();
      const password = within(dialog).getByLabelText('Senha do SIASB');
      await userEvent.type(password, 'senha-errada-123');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Conectar' }));

      expect(await within(dialog).findByText(text, { exact: false })).toBeInTheDocument();
      expect(password).toHaveValue('');
      expect(within(dialog).getByRole('button', { name: button })).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Conectar o SIASB' })).toBeInTheDocument();
      expect(notify.success).not.toHaveBeenCalled();
      // A senha digitada nunca aparece em mensagem de erro nem na página.
      expect(document.body.innerHTML).not.toContain('senha-errada-123');
    });
  });

  it('senha antiga: oferece abrir o SIASB (link externo seguro)', async () => {
    server.use(
      http.post(`${API}/connections/siasb`, () =>
        HttpResponse.json({ error: 'siasb_password_migration_required', message: 'x' }, { status: 422 }),
      ),
    );
    renderApp('/connections');
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText('Senha do SIASB'), 'antiga');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Conectar' }));
    const link = await within(dialog).findByRole('link', { name: 'Abrir o SIASB' });
    expect(link).toHaveAttribute('href', 'https://www.siasb.ufba.br');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('erro desconhecido da API: mostra a mensagem dela', async () => {
    server.use(http.post(`${API}/connections/siasb`, () => HttpResponse.json({ error: 'internal_error', message: 'Deu ruim.' }, { status: 500 })));
    renderApp('/connections');
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText('Senha do SIASB'), 'x');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Conectar' }));
    expect(await within(dialog).findByText('Deu ruim.')).toBeInTheDocument();
  });
});

describe('/connections · SIASB: estados do cartão', () => {
  it('conectado com folga: selo "Conectado", acesso até a data e só Desconectar', async () => {
    me = withSiasb({ offered: true, status: 'connected', expiresAt: inDays(20) });
    renderApp('/connections');
    const card = (await screen.findByRole('heading', { name: 'SIASB', level: 3 })).closest('article')!;
    expect(within(card).getByText('Conectado')).toBeInTheDocument();
    expect(within(card).getByText(/^Acesso até .+ · só leitura$/)).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Desconectar o SIASB' })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Reconectar' })).toBeNull();
    expect(screen.getByText('4 de 4 conectadas')).toBeInTheDocument();
  });

  it.each([
    [7, 'Vence em 7 dias', 'Seu acesso ao SIASB vence em 7 dias.'],
    [3, 'Vence em 3 dias', 'Seu acesso ao SIASB vence em 3 dias.'],
    [1, 'Vence em 1 dia', 'Seu acesso ao SIASB vence em 1 dia.'],
  ])('faltando %s dia(s): faixa de vencimento com o botão Reconectar (a partir de 7 dias)', async (days, chip, line) => {
    me = withSiasb({ offered: true, status: 'connected', expiresAt: inDays(days) });
    renderApp('/connections');
    const card = (await screen.findByRole('heading', { name: 'SIASB', level: 3 })).closest('article')!;
    expect(within(card).getByText(chip)).toBeInTheDocument();
    expect(within(card).getByText(line, { exact: false })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Reconectar' })).toBeInTheDocument();
    expect(within(card).queryByText('Conectado')).toBeNull();
    // Ainda conectado: conta no total.
    expect(screen.getByText('4 de 4 conectadas')).toBeInTheDocument();
  });

  it('faltando 8 dias ainda não avisa', async () => {
    me = withSiasb({ offered: true, status: 'connected', expiresAt: inDays(8) });
    renderApp('/connections');
    const card = (await screen.findByRole('heading', { name: 'SIASB', level: 3 })).closest('article')!;
    expect(within(card).getByText('Conectado')).toBeInTheDocument();
    expect(within(card).queryByText(/Vence/)).toBeNull();
  });

  it('data estimada já passou mas o status ainda é connected: "Vence hoje" (a data é só estimativa)', async () => {
    me = withSiasb({ offered: true, status: 'connected', expiresAt: new Date(Date.now() - DAY).toISOString() });
    renderApp('/connections');
    const card = (await screen.findByRole('heading', { name: 'SIASB', level: 3 })).closest('article')!;
    expect(within(card).getByText('Vence hoje')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Reconectar' })).toBeInTheDocument();
  });

  it('reconnect_required manda mais que a data: "Acesso expirou" mesmo com 20 dias de folga, e não conta como conectado', async () => {
    me = withSiasb({ offered: true, status: 'reconnect_required', expiresAt: inDays(20) });
    renderApp('/connections');
    const card = (await screen.findByRole('heading', { name: 'SIASB', level: 3 })).closest('article')!;
    expect(within(card).getByText('Acesso expirou')).toBeInTheDocument();
    expect(within(card).getByText(/Reconecte o SIASB: digite a senha de novo/)).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Reconectar' })).toBeInTheDocument();
    expect(within(card).queryByText(/Vence/)).toBeNull();
    expect(screen.getByText('3 de 4 conectadas')).toBeInTheDocument();
  });

  it('Reconectar abre o mesmo diálogo de conectar', async () => {
    me = withSiasb({ offered: true, status: 'reconnect_required', expiresAt: null });
    renderApp('/connections');
    await userEvent.click(await screen.findByRole('button', { name: 'Reconectar' }));
    expect(await screen.findByRole('dialog', { name: 'Conectar o SIASB' })).toBeInTheDocument();
  });
});

describe('/connections · SIASB: desconectar', () => {
  it('pede confirmação, chama DELETE e o cartão volta a oferecer "Conectar"', async () => {
    me = withSiasb({ offered: true, status: 'connected', expiresAt: inDays(20) });
    renderApp('/connections');
    await userEvent.click(await screen.findByRole('button', { name: 'Desconectar o SIASB' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desconectar o SIASB?' });
    expect(deletes).toBe(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));

    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('SIASB desconectado.'));
    expect(deletes).toBe(1);
    expect(await screen.findByRole('button', { name: 'Conectar' })).toBeInTheDocument();
    expect(screen.getByText('3 de 4 conectadas')).toBeInTheDocument();
  });

  it('depois de desconectar, o interruptor de permissão volta a ficar desativado', async () => {
    me = withSiasb({ offered: true, status: 'connected', expiresAt: inDays(20) });
    renderApp('/connections');
    expect(await screen.findByRole('switch', { name: 'Agendar e desmarcar sessões pelo Claude' })).toBeEnabled();
    await userEvent.click(await screen.findByRole('button', { name: 'Desconectar o SIASB' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desconectar o SIASB?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Agendar e desmarcar sessões pelo Claude' })).toBeDisabled());
  });
});

describe('/connections · SIASB: acessibilidade', () => {
  it('cartão e diálogo sem violações', async () => {
    me = withSiasb({ offered: true, status: 'connected', expiresAt: inDays(3) });
    const { container } = renderApp('/connections');
    await screen.findByRole('heading', { name: 'SIASB', level: 3 });
    expect(await axe(container)).toHaveNoViolations();

    await userEvent.click(await screen.findByRole('button', { name: 'Reconectar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Conectar o SIASB' });
    expect(await axe(dialog)).toHaveNoViolations();
  });
});
