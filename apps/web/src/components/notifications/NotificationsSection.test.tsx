import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { Me, NotificationSetting, PushDevice } from '../../contract';
import { meFixture } from '../../contract/fixtures';
import { notify } from '../../lib/notify';
import { renderApp } from '../../test/render';
import { API, server } from '../../test/server';

/**
 * Dados fixos no formato de handoffs/notificacoes-genericas.md. O contrato real ainda não está no `openapi.json`: nada
 * daqui vem dele. Os textos dos tipos de aviso são os da spec (a tela não escreve nenhum).
 */
const SIASB_SETTING: NotificationSetting = {
  key: 'siasb.alerts',
  source: 'siasb',
  title: 'Avisos do SIASB',
  description: 'Avisar quando faltar paciente ou sessão marcada na clínica e quando o acesso ao SIASB estiver para vencer.',
  enabled: true,
};

const device = (overrides: Partial<PushDevice> = {}): PushDevice => ({
  id: 'dev-1',
  label: 'Chrome no Windows',
  createdAt: '2026-11-10T12:00:00.000Z',
  lastSuccessAt: null,
  ...overrides,
});

let settings: NotificationSetting[];
let devices: PushDevice[];
let me: Me;
let puts: Array<{ key: string; body: unknown; csrf: string | null }>;
let posts: unknown[];
let deletes: string[];
let tests: string[];

/** Navegador com Web Push: o que o jsdom não tem. `permission` é o que o navegador responde ao pedido. */
function fakePush(permission: NotificationPermission = 'granted') {
  const subscription = {
    endpoint: 'https://push.example/abc',
    toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'P256', auth: 'AUTH' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
  const subscribe = vi.fn().mockResolvedValue(subscription);
  const register = vi.fn().mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe } });
  const ready = Promise.resolve({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe } });
  const request = vi.fn().mockResolvedValue(permission);
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register, ready, getRegistration: vi.fn().mockResolvedValue(undefined) },
  });
  Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: Object.assign(class {}, { permission: 'default', requestPermission: request }),
  });
  return { register, subscribe, request, subscription };
}

function removeFakePush() {
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(window, 'PushManager');
  Reflect.deleteProperty(window, 'Notification');
}

beforeEach(() => {
  settings = [SIASB_SETTING];
  devices = [];
  me = meFixture();
  puts = [];
  posts = [];
  deletes = [];
  tests = [];
  localStorage.clear();
  server.use(
    http.get(`${API}/me`, () => HttpResponse.json(me)),
    http.get(`${API}/me/notification-settings`, () => HttpResponse.json({ items: settings })),
    http.put(`${API}/me/notification-settings/:key`, async ({ request, params }) => {
      const key = String(params.key);
      const body = (await request.json()) as { enabled: boolean };
      puts.push({ key, body, csrf: request.headers.get('x-ufba') });
      settings = settings.map((item) => (item.key === key ? { ...item, enabled: body.enabled } : item));
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(`${API}/me/push-devices`, () => HttpResponse.json({ items: devices })),
    http.get(`${API}/push/config`, () => HttpResponse.json({ publicKey: 'AQIDBA' })),
    http.post(`${API}/me/push-devices`, async ({ request }) => {
      posts.push(await request.json());
      devices = [device({ id: 'novo' })];
      return HttpResponse.json({ id: 'novo' }, { status: 201 });
    }),
    http.delete(`${API}/me/push-devices/:id`, ({ params }) => {
      deletes.push(String(params.id));
      devices = devices.filter((item) => item.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(`${API}/me/push-devices/:id/test`, ({ params }) => {
      tests.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
    // Pano de fundo de Conexões (pareamento do QR com o SIGAA fechado): não é o assunto aqui.
    http.post(`${API}/pairings`, () =>
      HttpResponse.json({ id: 'AAECAwQFBgcICQoLDA0ODw', expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() }, { status: 201 }),
    ),
    http.get(`${API}/pairings/AAECAwQFBgcICQoLDA0ODw`, () => HttpResponse.json({ status: 'pending' })),
  );
  vi.mocked(notify.error).mockClear();
  vi.mocked(notify.success).mockClear();
});

afterEach(() => {
  removeFakePush();
  vi.restoreAllMocks();
});

const devicesGroup = () => screen.findByRole('group', { name: 'Aparelhos' });

describe('/connections · Avisos', () => {
  it('lista os tipos de aviso com o texto da API e o interruptor no estado da API', async () => {
    fakePush();
    renderApp('/connections');
    const group = await screen.findByRole('group', { name: 'Avisos: SIASB' });
    expect(within(group).getByText(SIASB_SETTING.description)).toBeInTheDocument();
    expect(await screen.findByRole('switch', { name: 'Avisos do SIASB' })).toBeChecked();
  });

  it('desligar o interruptor faz o PUT com X-UFBA e o texto não é escrito pela tela', async () => {
    fakePush();
    renderApp('/connections');
    await userEvent.click(await screen.findByRole('switch', { name: 'Avisos do SIASB' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ key: 'siasb.alerts', body: { enabled: false }, csrf: '1' });
    await waitFor(async () => expect(await screen.findByRole('switch', { name: 'Avisos do SIASB' })).not.toBeChecked());
  });

  it('falha no PUT: o interruptor volta e avisa por toast', async () => {
    fakePush();
    server.use(
      http.put(`${API}/me/notification-settings/:key`, () =>
        HttpResponse.json({ error: 'internal_error', message: 'Não deu para salvar.' }, { status: 500 }),
      ),
    );
    renderApp('/connections');
    await userEvent.click(await screen.findByRole('switch', { name: 'Avisos do SIASB' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalled());
    await waitFor(async () => expect(await screen.findByRole('switch', { name: 'Avisos do SIASB' })).toBeChecked());
  });

  it('sem aparelho: diz que a pessoa não vai receber avisos e oferece ativar neste aparelho', async () => {
    fakePush();
    renderApp('/connections');
    const group = await devicesGroup();
    expect(await within(group).findByText(/Você não vai receber avisos/)).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Ativar avisos neste aparelho' })).toBeInTheDocument();
  });

  it('ativar: pede a permissão, pega a chave, assina com ela e manda a assinatura para a API', async () => {
    const push = fakePush();
    renderApp('/connections');
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar avisos neste aparelho' }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(push.request).toHaveBeenCalledTimes(1);
    expect(push.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    const options = push.subscribe.mock.calls[0]?.[0] as { userVisibleOnly: boolean; applicationServerKey: Uint8Array };
    expect(options.userVisibleOnly).toBe(true);
    expect(options.applicationServerKey).toBeInstanceOf(Uint8Array);
    expect(posts[0]).toEqual({ subscription: { endpoint: 'https://push.example/abc', keys: { p256dh: 'P256', auth: 'AUTH' } } });
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Avisos ativados neste aparelho.'));
    expect(localStorage.getItem('ufba.push.deviceId')).toBe('novo');
    // Agora o aparelho aparece na lista, marcado, e o botão de ativar some.
    const group = await devicesGroup();
    expect(await within(group).findByText('Este aparelho')).toBeInTheDocument();
    expect(within(group).queryByRole('button', { name: 'Ativar avisos neste aparelho' })).toBeNull();
  });

  it('permissão negada no pedido: avisa, não assina e não chama a API de aparelhos', async () => {
    const push = fakePush('denied');
    renderApp('/connections');
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar avisos neste aparelho' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith(expect.stringContaining('bloqueadas neste navegador')));
    expect(push.request).toHaveBeenCalledTimes(1);
    expect(push.subscribe).not.toHaveBeenCalled();
    expect(push.register).not.toHaveBeenCalled();
    expect(posts).toEqual([]);
  });

  it('canal desligado no ambiente (503 push_unavailable): mensagem clara, sem pedir permissão', async () => {
    const push = fakePush();
    server.use(http.get(`${API}/push/config`, () => HttpResponse.json({ error: 'push_unavailable', message: 'Indisponível.' }, { status: 503 })));
    renderApp('/connections');
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar avisos neste aparelho' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Os avisos estão indisponíveis agora. Tente de novo mais tarde.'));
    expect(push.request).not.toHaveBeenCalled();
  });

  it('lista de aparelhos: nome, último aviso, "Enviar teste" e "Remover" (sem endpoint na tela)', async () => {
    fakePush();
    devices = [device({ lastSuccessAt: '2026-11-14T15:30:00.000Z' }), device({ id: 'dev-2', label: null })];
    renderApp('/connections');
    const group = await devicesGroup();
    expect(await within(group).findByText('Chrome no Windows')).toBeInTheDocument();
    expect(within(group).getByText('Aparelho sem nome')).toBeInTheDocument();
    expect(within(group).getByText('Ainda sem aviso entregue')).toBeInTheDocument();
    expect(within(group).getByText(/Último aviso entregue em/)).toBeInTheDocument();
    expect(within(group).queryByText(/push\.example/)).toBeNull();

    await userEvent.click(within(group).getByRole('button', { name: 'Enviar teste para Chrome no Windows' }));
    await waitFor(() => expect(tests).toEqual(['dev-1']));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith(expect.stringContaining('Aviso de teste enviado')));
  });

  it('remover: DELETE do aparelho, some da lista e avisa; remover o deste aparelho cancela a assinatura local', async () => {
    fakePush();
    localStorage.setItem('ufba.push.deviceId', 'dev-1');
    devices = [device()];
    renderApp('/connections');
    const group = await devicesGroup();
    await userEvent.click(await within(group).findByRole('button', { name: 'Remover Chrome no Windows' }));
    await waitFor(() => expect(deletes).toEqual(['dev-1']));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Aparelho removido.'));
    await waitFor(() => expect(screen.queryByText('Chrome no Windows')).toBeNull());
    expect(localStorage.getItem('ufba.push.deviceId')).toBeNull();
    expect(await screen.findByText(/Você não vai receber avisos/)).toBeInTheDocument();
  });

  it('teste de um aparelho que a API já removeu (409 push_device_gone): explica e relê a lista', async () => {
    fakePush();
    devices = [device()];
    server.use(
      http.post(`${API}/me/push-devices/:id/test`, () => {
        devices = [];
        return HttpResponse.json({ error: 'push_device_gone', message: 'Aparelho removido.' }, { status: 409 });
      }),
    );
    renderApp('/connections');
    const group = await devicesGroup();
    await userEvent.click(await within(group).findByRole('button', { name: 'Enviar teste para Chrome no Windows' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith(expect.stringContaining('não recebe mais avisos')));
    await waitFor(() => expect(screen.queryByText('Chrome no Windows')).toBeNull());
  });

  it('muitos testes seguidos (429): mostra a mensagem da API', async () => {
    fakePush();
    devices = [device()];
    server.use(
      http.post(`${API}/me/push-devices/:id/test`, () =>
        HttpResponse.json({ error: 'too_many_attempts', message: 'Muitos testes. Espere alguns minutos.' }, { status: 429 }),
      ),
    );
    renderApp('/connections');
    const group = await devicesGroup();
    await userEvent.click(await within(group).findByRole('button', { name: 'Enviar teste para Chrome no Windows' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Muitos testes. Espere alguns minutos.'));
  });

  it('iPhone fora da tela inicial: sem Web Push, mostra a nota de instalar o painel (iOS 16.4+) e nenhum botão de ativar', async () => {
    removeFakePush();
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    renderApp('/connections');
    const group = await devicesGroup();
    expect(await within(group).findByText(/tela inicial/)).toBeInTheDocument();
    expect(within(group).getByText(/iOS 16\.4/)).toBeInTheDocument();
    expect(within(group).queryByRole('button', { name: 'Ativar avisos neste aparelho' })).toBeNull();
  });

  it('navegador sem Web Push (fora do iPhone): diz que não recebe avisos', async () => {
    removeFakePush();
    renderApp('/connections');
    expect(await screen.findByText(/Este navegador não recebe avisos/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ativar avisos neste aparelho' })).toBeNull();
  });

  it('API sem avisos (404) ou lista vazia: a seção some, sem erro em Conexões', async () => {
    fakePush();
    server.use(http.get(`${API}/me/notification-settings`, () => HttpResponse.json({ error: 'not_found', message: 'x' }, { status: 404 })));
    renderApp('/connections');
    expect(await screen.findByText('3 de 3 conectadas')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Avisos' })).toBeNull();
  });

  it('não tem problemas de acessibilidade (axe)', async () => {
    fakePush();
    devices = [device()];
    const { container } = renderApp('/connections');
    await devicesGroup();
    await screen.findByText('Chrome no Windows');
    expect(await axe(container)).toHaveNoViolations();
  });
});
