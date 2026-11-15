import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { Permission } from '../../api/permissions';
import type { Me } from '../../contract';
import { meFixture } from '../../contract/fixtures';
import { notify } from '../../lib/notify';
import { renderApp } from '../../test/render';
import { API, server } from '../../test/server';

/**
 * Dados fixos no formato combinado em handoffs/permissoes-por-fonte.md. O contrato real ainda não existe: nada daqui
 * vem do `openapi.json`. Os textos são os da spec (a tela não escreve nenhum).
 */
function permission(overrides: Partial<Permission> = {}): Permission {
  return {
    key: 'siasb.schedule_write',
    source: 'siasb',
    title: 'Agendar e desmarcar sessões pelo Claude',
    description:
      'Permite que o Claude marque e desmarque sessões da clínica no SIASB em seu nome. Cada ação pede a sua confirmação antes de ser feita.',
    risk: 'low',
    enabled: false,
    available: true,
    unavailableReason: null,
    ...overrides,
  };
}

const procedures = (overrides: Partial<Permission> = {}) =>
  permission({
    key: 'siasb.procedures_write',
    title: 'Lançar e excluir procedimentos pelo Claude',
    description:
      'Permite que o Claude inclua e exclua procedimentos previstos nos seus atendimentos do SIASB, que ficam no prontuário. Cada ação pede a sua confirmação. Procedimentos realizados continuam sendo feitos por você no site.',
    risk: 'high',
    ...overrides,
  });

let items: Permission[];
let me: Me;
let puts: Array<{ key: string; body: unknown; csrf: string | null }>;

beforeEach(() => {
  items = [permission(), procedures()];
  me = meFixture();
  puts = [];
  server.use(
    http.get(`${API}/me`, () => HttpResponse.json(me)),
    http.get(`${API}/me/permissions`, () => HttpResponse.json({ items })),
    http.put(`${API}/me/permissions/:key`, async ({ request, params }) => {
      const key = String(params.key);
      const body = (await request.json()) as { enabled: boolean };
      puts.push({ key, body, csrf: request.headers.get('x-ufba') });
      items = items.map((item) => (item.key === key ? { ...item, enabled: body.enabled } : item));
      return new HttpResponse(null, { status: 204 });
    }),
    // Pano de fundo de Conexões (pareamento do QR com o SIGAA fechado): não é o assunto aqui.
    http.post(`${API}/pairings`, () =>
      HttpResponse.json({ id: 'AAECAwQFBgcICQoLDA0ODw', expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() }, { status: 201 }),
    ),
    http.get(`${API}/pairings/AAECAwQFBgcICQoLDA0ODw`, () => HttpResponse.json({ status: 'pending' })),
  );
  vi.mocked(notify.error).mockClear();
});

const lowSwitch = () => screen.findByRole('switch', { name: 'Agendar e desmarcar sessões pelo Claude' });
const highSwitch = () => screen.findByRole('switch', { name: 'Lançar e excluir procedimentos pelo Claude' });

describe('/connections · Permissões', () => {
  it('lista os itens agrupados pela fonte, com o texto da API, todos desligados', async () => {
    renderApp('/connections');
    const group = await screen.findByRole('group', { name: 'SIASB' });
    expect(within(group).getByRole('heading', { name: 'SIASB' })).toBeInTheDocument();
    expect(within(group).getByText(items[0]!.description)).toBeInTheDocument();
    expect(within(group).getByText(items[1]!.description)).toBeInTheDocument();
    expect(await lowSwitch()).not.toBeChecked();
    expect(await highSwitch()).not.toBeChecked();
  });

  it('agrupa por fonte: duas fontes, dois grupos', async () => {
    items = [permission(), permission({ key: 'moodle.algo', source: 'moodle', title: 'Algo do Moodle', description: 'Texto do Moodle.' })];
    renderApp('/connections');
    expect(await screen.findByRole('group', { name: 'SIASB' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Moodle' })).toBeInTheDocument();
  });

  it('risco baixo: liga direto, sem confirmação, com X-UFBA', async () => {
    renderApp('/connections');
    await userEvent.click(await lowSwitch());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ key: 'siasb.schedule_write', body: { enabled: true }, csrf: '1' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(async () => expect(await lowSwitch()).toBeChecked());
  });

  it('risco alto: ligar abre a confirmação com a descrição; Cancelar não liga nem chama a API', async () => {
    renderApp('/connections');
    await userEvent.click(await highSwitch());
    const dialog = await screen.findByRole('dialog', { name: 'Lançar e excluir procedimentos pelo Claude' });
    expect(within(dialog).getByText(items[1]!.description)).toBeInTheDocument();
    expect(puts).toEqual([]);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(puts).toEqual([]);
    expect(await highSwitch()).not.toBeChecked();
  });

  it('risco alto: "Ligar" na confirmação liga e chama o PUT', async () => {
    renderApp('/connections');
    await userEvent.click(await highSwitch());
    const dialog = await screen.findByRole('dialog', { name: 'Lançar e excluir procedimentos pelo Claude' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ligar' }));
    await waitFor(() => expect(puts).toEqual([{ key: 'siasb.procedures_write', body: { enabled: true }, csrf: '1' }]));
    await waitFor(async () => expect(await highSwitch()).toBeChecked());
  });

  it('desligar um item de risco alto não pede confirmação', async () => {
    items = [permission(), procedures({ enabled: true })];
    renderApp('/connections');
    const toggle = await highSwitch();
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    await waitFor(() => expect(puts).toEqual([{ key: 'siasb.procedures_write', body: { enabled: false }, csrf: '1' }]));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('fonte sem conexão (available=false): interruptor desativado e a nota com o nome da fonte', async () => {
    items = [permission({ available: false, unavailableReason: 'source_not_connected' })];
    renderApp('/connections');
    expect(await lowSwitch()).toBeDisabled();
    expect(screen.getByText('Conecte o SIASB para liberar')).toBeInTheDocument();
    expect(puts).toEqual([]);
  });

  it('atualização otimista: muda na hora e volta ao estado anterior se o PUT falhar, avisando por toast', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.put(`${API}/me/permissions/:key`, async () => {
        await gate;
        return HttpResponse.json({ error: 'internal_error', message: 'Não deu para salvar.' }, { status: 500 });
      }),
    );
    renderApp('/connections');
    const toggle = await lowSwitch();
    await userEvent.click(toggle);

    // Com o PUT ainda no ar, o interruptor já está ligado.
    await waitFor(() => expect(toggle).toBeChecked());
    release();
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(notify.error).toHaveBeenCalledWith('Não deu para salvar.');
  });

  it('409 permission_unavailable: volta e diz para conectar a fonte', async () => {
    server.use(
      http.put(`${API}/me/permissions/:key`, () =>
        HttpResponse.json({ error: 'permission_unavailable', message: 'x' }, { status: 409 }),
      ),
    );
    renderApp('/connections');
    const toggle = await lowSwitch();
    await userEvent.click(toggle);
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Conecte a fonte antes de ligar.'));
    await waitFor(() => expect(toggle).not.toBeChecked());
  });

  it('falha de rede: mensagem genérica das conexões e volta', async () => {
    server.use(http.put(`${API}/me/permissions/:key`, () => HttpResponse.error()));
    renderApp('/connections');
    const toggle = await lowSwitch();
    await userEvent.click(toggle);
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Algo deu errado. Tente de novo em instantes.'));
    await waitFor(() => expect(toggle).not.toBeChecked());
  });

  it('recarrega a lista depois de desconectar uma fonte (o available muda)', async () => {
    me = meFixture();
    items = [permission({ key: 'moodle.algo', source: 'moodle', title: 'Algo do Moodle', description: 'Texto do Moodle.' })];
    server.use(
      http.delete(`${API}/connections/moodle`, () => {
        me = { ...me, connections: { ...me.connections, moodle: { status: 'disconnected', account: null } } };
        items = items.map((item) => ({ ...item, available: false, unavailableReason: 'source_not_connected' as const }));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/connections');
    expect(await screen.findByRole('switch', { name: 'Algo do Moodle' })).toBeEnabled();

    await userEvent.click(await screen.findByRole('button', { name: 'Desconectar o Moodle' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desconectar o Moodle?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));

    await waitFor(async () => expect(await screen.findByRole('switch', { name: 'Algo do Moodle' })).toBeDisabled());
    expect(screen.getByText('Conecte o Moodle para liberar')).toBeInTheDocument();
  });

  it('sem nenhuma permissão na lista, a seção não aparece', async () => {
    items = [];
    renderApp('/connections');
    await screen.findByRole('heading', { name: 'SIGAA' });
    // Nem durante o carregamento aparece um título vazio.
    expect(screen.queryByRole('heading', { name: 'Permissões' })).toBeNull();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Permissões' })).toBeNull());
  });

  it('API ainda sem a rota (404): a seção some e Conexões não mostra erro', async () => {
    server.use(http.get(`${API}/me/permissions`, () => HttpResponse.json({ error: 'not_found', message: 'x' }, { status: 404 })));
    renderApp('/connections');
    await screen.findByRole('heading', { name: 'SIGAA' });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Permissões' })).toBeNull());
    expect(screen.queryByText(/Não deu para carregar as permissões/)).toBeNull();
  });

  it('falha ao carregar (500): mostra o erro e deixa tentar de novo', async () => {
    let fail = true;
    server.use(
      http.get(`${API}/me/permissions`, () =>
        fail ? HttpResponse.json({ error: 'internal_error', message: 'Falhou.' }, { status: 500 }) : HttpResponse.json({ items }),
      ),
    );
    renderApp('/connections');
    expect(await screen.findByText(/Falhou\./)).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await lowSwitch()).toBeInTheDocument();
  });

  it('não tem violações de acessibilidade', async () => {
    items = [permission(), procedures({ enabled: true }), permission({ key: 'moodle.algo', source: 'moodle', title: 'Algo do Moodle', description: 'x', available: false, unavailableReason: 'source_not_connected' })];
    const { container } = renderApp('/connections');
    await lowSwitch();
    expect(await axe(container)).toHaveNoViolations();
  });
});
