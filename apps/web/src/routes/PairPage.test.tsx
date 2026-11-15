import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { Me, PairingInfo } from '../contract';
import { meFixture } from '../contract/fixtures';
import * as flows from '../lib/passkey/flows';
import { buildPairUrl, newEphemeral } from '../lib/passkey/pairing';
import { notify } from '../lib/notify';
import * as webauthn from '../lib/passkey/webauthn';
import { mockLocationAssign, renderApp, signedOutMeHandler } from '../test/render';
import { API, server } from '../test/server';

vi.mock('../lib/passkey/webauthn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/passkey/webauthn')>()),
  hasWebAuthn: vi.fn(),
}));
vi.mock('../lib/passkey/flows', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/passkey/flows')>()),
  approvePairing: vi.fn(),
}));

const mockedAuthn = vi.mocked(webauthn);
const mockedFlows = vi.mocked(flows);

const PAIR_ID = 'AAECAwQFBgcICQoLDA0ODw';
const STASH_KEY = 'ufba.pair.pending';

let me: Me;
let info: PairingInfo;
let infoStatus: number;
let computer: Awaited<ReturnType<typeof newEphemeral>>;

const meWithPasskey = (slots: number): Me => {
  const base = meFixture();
  return { ...base, connections: { ...base.connections, sigaa: { ...base.connections.sigaa, passkey: { slots } } } };
};

function openLink(label = 'Firefox no Windows') {
  const url = new URL(buildPairUrl('http://localhost:3001', PAIR_ID, computer.pub, label));
  window.history.pushState(null, '', `${url.pathname}${url.hash}`);
}

beforeEach(async () => {
  computer = await newEphemeral();
  me = meWithPasskey(1);
  infoStatus = 200;
  info = { label: 'Firefox no Windows', client: 'Claude', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 4 * 60_000).toISOString(), delivered: false };
  mockedAuthn.hasWebAuthn.mockReturnValue(true);
  server.use(
    http.get(`${API}/me`, () => HttpResponse.json(me)),
    http.get(`${API}/pairings/${PAIR_ID}/info`, () =>
      infoStatus === 200 ? HttpResponse.json(info) : HttpResponse.json({ error: 'pairing_not_found', message: 'Pedido não encontrado.' }, { status: infoStatus }),
    ),
    // O painel de Conexões (destino do "Cancelar") também busca isto.
    http.get(`${API}/sigaa/passkey`, () => HttpResponse.json({ passkeys: [] })),
  );
});

afterEach(() => {
  window.localStorage.clear();
});

describe('/pair (a página que o celular abre pelo QR)', () => {
  it('sem fragmento e sem pedido guardado: "Pedido vencido ou já respondido"', async () => {
    window.history.pushState(null, '', '/pair');
    renderApp('/pair');
    expect(await screen.findByRole('heading', { name: 'Pedido vencido ou já respondido' })).toBeInTheDocument();
    expect(screen.getByText('Cada pedido vale 5 minutos e só pode ser usado uma vez. Gere um QR novo no computador.')).toBeInTheDocument();
  });

  it('o fragmento sai da barra de endereço e o pedido fica guardado neste navegador (só a chave PÚBLICA)', async () => {
    openLink();
    renderApp('/pair');
    await screen.findByRole('heading', { name: /Liberar/ });
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/pair');
    const stored = JSON.parse(window.localStorage.getItem(STASH_KEY) ?? '{}') as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(['at', 'pairId', 'pub']);
    expect(stored.pairId).toBe(PAIR_ID);
  });

  it('não logado: pede o Google @ufba.br e leva ao login do auth voltando para /pair', async () => {
    server.use(signedOutMeHandler());
    openLink();
    const assign = mockLocationAssign();
    renderApp('/pair');
    expect(await screen.findByRole('heading', { name: 'Entre para liberar o SIGAA' })).toBeInTheDocument();
    expect(screen.getByText('Use a mesma conta Google @ufba.br que você usa no computador.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Entrar com Google' }));
    expect(assign).toHaveBeenCalledWith('http://localhost:3002/sign-in?return=%2Fpair');
    // O pedido sobrevive à ida ao Google: volta sem fragmento, mas guardado.
    expect(window.localStorage.getItem(STASH_KEY)).not.toBeNull();
  });

  it('de volta do login, sem fragmento, retoma o pedido guardado', async () => {
    openLink();
    const first = renderApp('/pair');
    await screen.findByRole('heading', { name: /Liberar/ });
    first.unmount();
    // Mesma aba, outra carga: a URL já não tem o fragmento.
    expect(window.location.hash).toBe('');
    renderApp('/pair');
    expect(await screen.findByRole('heading', { name: 'Liberar Firefox no Windows?' })).toBeInTheDocument();
  });

  it('pedido guardado há mais de 5 minutos não vale', async () => {
    openLink();
    const first = renderApp('/pair');
    await screen.findByRole('heading', { name: /Liberar/ });
    first.unmount();
    const stored = JSON.parse(window.localStorage.getItem(STASH_KEY) ?? '{}') as { at: number };
    window.localStorage.setItem(STASH_KEY, JSON.stringify({ ...stored, at: stored.at - 6 * 60_000 }));
    renderApp('/pair');
    expect(await screen.findByRole('heading', { name: 'Pedido vencido ou já respondido' })).toBeInTheDocument();
    expect(window.localStorage.getItem(STASH_KEY)).toBeNull();
  });

  it('fragmento inválido (chave que não é P-256) é recusado como pedido vencido', async () => {
    window.history.pushState(null, '', `/pair#${PAIR_ID}.${'A'.repeat(87)}`);
    renderApp('/pair');
    expect(await screen.findByRole('heading', { name: 'Pedido vencido ou já respondido' })).toBeInTheDocument();
  });

  it('pedido de outra conta (404): mensagem clara, a conta com que está logado e "Trocar de conta"', async () => {
    infoStatus = 404;
    const signOut = vi.fn();
    server.use(http.delete(`${API}/session`, () => (signOut(), new HttpResponse(null, { status: 204 }))));
    openLink();
    const assign = mockLocationAssign();
    renderApp('/pair');
    expect(await screen.findByRole('heading', { name: 'Este pedido não é desta conta' })).toBeInTheDocument();
    expect(screen.getByText('marina.costa@ufba.br')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Trocar de conta' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('http://localhost:3002/sign-in?return=%2Fpair'));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('confirmação: mostra aparelho, cliente e horário vindos do SERVIDOR (o nome do link é ignorado) e o aviso contra golpe', async () => {
    openLink('Golpe no Windows');
    const { container } = renderApp('/pair');
    expect(await screen.findByRole('heading', { name: 'Liberar Firefox no Windows?' })).toBeInTheDocument();
    expect(screen.queryByText(/Golpe/)).toBeNull();
    expect(screen.getByText('O SIGAA passa a funcionar nesse aparelho.')).toBeInTheDocument();
    expect(screen.getByText('Pedido por')).toBeInTheDocument();
    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(screen.getByText(/^Hoje, \d\d:\d\d$/)).toBeInTheDocument();
    expect(screen.getByText('marina.costa@ufba.br')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Só confirme se você acabou de pedir isso.');
    expect(screen.getByRole('button', { name: 'Liberar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('sem cliente no pedido, a linha "Pedido por" some', async () => {
    info = { ...info, client: null };
    openLink();
    renderApp('/pair');
    await screen.findByRole('heading', { name: /Liberar/ });
    expect(screen.queryByText('Pedido por')).toBeNull();
  });

  it('Liberar: confirme com a digital, e então "Pronto. Volte ao computador." (o pedido guardado é apagado)', async () => {
    let finish: (value: flows.ApproveResult) => void = () => undefined;
    mockedFlows.approvePairing.mockImplementation(() => new Promise((resolve) => void (finish = resolve)));
    openLink();
    renderApp('/pair');
    await userEvent.click(await screen.findByRole('button', { name: 'Liberar' }));

    expect(await screen.findByRole('heading', { name: 'Confirme com a digital' })).toBeInTheDocument();
    expect(screen.getByText(/Liberando/)).toHaveTextContent('Liberando Firefox no Windows.');
    const call = mockedFlows.approvePairing.mock.calls[0]?.[0];
    expect(call?.userId).toBe(me.id);
    expect(call?.pairId).toBe(PAIR_ID);
    expect([...(call?.computerPub ?? [])]).toEqual([...computer.pub]);

    finish({ ok: true });
    expect(await screen.findByRole('heading', { name: 'Pronto' })).toBeInTheDocument();
    expect(screen.getByText(/Volte ao computador/)).toHaveTextContent('O SIGAA foi liberado no Firefox no Windows. Volte ao computador.');
    expect(window.localStorage.getItem(STASH_KEY)).toBeNull();
  });

  it('cancelou a digital: "Tentar de novo" refaz a liberação', async () => {
    mockedFlows.approvePairing.mockResolvedValueOnce({ ok: false, reason: 'cancelled' });
    openLink();
    renderApp('/pair');
    await userEvent.click(await screen.findByRole('button', { name: 'Liberar' }));
    expect(await screen.findByRole('heading', { name: 'A digital foi cancelada' })).toBeInTheDocument();
    expect(screen.getByText('Nada foi liberado. Dá para tentar de novo agora.')).toBeInTheDocument();
    mockedFlows.approvePairing.mockResolvedValueOnce({ ok: true });
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'Pronto' })).toBeInTheDocument();
    expect(mockedFlows.approvePairing).toHaveBeenCalledTimes(2);
  });

  it('este celular não tem passkey (nenhuma guardada): "Este celular não tem a senha guardada", sem pedir a digital', async () => {
    me = meWithPasskey(0);
    openLink();
    renderApp('/pair');
    expect(await screen.findByRole('heading', { name: 'Este celular não tem a senha guardada' })).toBeInTheDocument();
    expect(screen.getByText('Ative este celular primeiro, ou digite a senha do SIGAA direto no computador.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ativar este celular' })).toBeInTheDocument();
    expect(mockedFlows.approvePairing).not.toHaveBeenCalled();
  });

  it('a passkey existe mas não é a deste aparelho (no_passkey no meio do fluxo): mesma tela', async () => {
    mockedFlows.approvePairing.mockResolvedValue({ ok: false, reason: 'no_passkey' });
    openLink();
    renderApp('/pair');
    await userEvent.click(await screen.findByRole('button', { name: 'Liberar' }));
    expect(await screen.findByRole('heading', { name: 'Este celular não tem a senha guardada' })).toBeInTheDocument();
  });

  it('"Ativar este celular" leva às Conexões, onde está a oferta', async () => {
    me = meWithPasskey(0);
    openLink();
    renderApp('/pair');
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar este celular' }));
    expect(await screen.findByRole('heading', { name: 'Conexões' })).toBeInTheDocument();
  });

  it('navegador sem passkey: "abra no Chrome ou no Safari" e "Copiar o link" (com o pedido no fragmento)', async () => {
    mockedAuthn.hasWebAuthn.mockReturnValue(false);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    openLink();
    renderApp('/pair');
    expect(await screen.findByRole('heading', { name: 'Este navegador não libera com a digital' })).toBeInTheDocument();
    expect(screen.getByText('Abra este link no Chrome ou no Safari.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copiar o link' }));
    const copied = new URL(writeText.mock.calls[0]?.[0] as string);
    expect(copied.pathname).toBe('/pair');
    expect(copied.hash.startsWith(`#${PAIR_ID}.`)).toBe(true);
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Link copiado.'));
  });

  it.each([
    ['já respondido', () => (info = { ...info, delivered: true })],
    ['vencido', () => (info = { ...info, expiresAt: new Date(Date.now() - 1000).toISOString() })],
  ])('pedido %s: "Pedido vencido ou já respondido"', async (_name, arrange) => {
    arrange();
    openLink();
    renderApp('/pair');
    expect(await screen.findByRole('heading', { name: 'Pedido vencido ou já respondido' })).toBeInTheDocument();
    expect(mockedFlows.approvePairing).not.toHaveBeenCalled();
  });

  it('vence no meio da liberação (404/409 na entrega): mesma tela de vencido, e o pedido guardado é apagado', async () => {
    mockedFlows.approvePairing.mockResolvedValue({ ok: false, reason: 'expired' });
    openLink();
    renderApp('/pair');
    await userEvent.click(await screen.findByRole('button', { name: 'Liberar' }));
    expect(await screen.findByRole('heading', { name: 'Pedido vencido ou já respondido' })).toBeInTheDocument();
    expect(window.localStorage.getItem(STASH_KEY)).toBeNull();
  });

  it('falha inesperada: "Não deu para liberar" com "Tentar de novo" e a saída da senha no computador', async () => {
    mockedFlows.approvePairing.mockResolvedValue({ ok: false, reason: 'unsupported' });
    openLink();
    renderApp('/pair');
    await userEvent.click(await screen.findByRole('button', { name: 'Liberar' }));
    expect(await screen.findByRole('heading', { name: 'Não deu para liberar' })).toBeInTheDocument();
    expect(screen.getByText(/digite a senha do SIGAA direto no computador/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('"Cancelar" na confirmação: não libera nada, apaga o pedido guardado e volta às Conexões', async () => {
    openLink();
    renderApp('/pair');
    const card = (await screen.findByRole('heading', { name: /Liberar/ })).closest('section') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByRole('heading', { name: 'Conexões' })).toBeInTheDocument();
    expect(mockedFlows.approvePairing).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(STASH_KEY)).toBeNull();
  });

  it('erro ao buscar o pedido (que não é 404): erro com "Tentar de novo"', async () => {
    infoStatus = 500;
    openLink();
    renderApp('/pair');
    expect(await screen.findByRole('heading', { name: 'Algo deu errado' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
