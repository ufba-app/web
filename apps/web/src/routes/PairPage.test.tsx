import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { Me, PairingInfo } from '../contract';
import { meFixture } from '../contract/fixtures';
import * as flows from '../lib/passkey/flows';
import { buildPairUrl, newEphemeral } from '../lib/passkey/pairing';
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
  approvePairingWithSession: vi.fn(),
  activatePasskey: vi.fn(),
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
  info = { label: 'Notebook da Marina', client: 'Claude', seenBrowser: 'Firefox', seenOs: 'Windows', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 4 * 60_000).toISOString(), delivered: false };
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
    expect(await screen.findByRole('heading', { name: 'Liberar o SIGAA no computador?' })).toBeInTheDocument();
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

  it('confirmação: a identificação confiável é o navegador e o sistema lidos pela API mais a hora; label e cliente aparecem só como "o computador diz"', async () => {
    openLink('Golpe no Windows');
    const { container } = renderApp('/pair');
    expect(await screen.findByRole('heading', { name: 'Liberar o SIGAA no computador?' })).toBeInTheDocument();
    expect(screen.queryByText(/Golpe/)).toBeNull();
    expect(screen.getByText('O SIGAA passa a funcionar nesse computador.')).toBeInTheDocument();
    expect(screen.getByText('Navegador do computador')).toBeInTheDocument();
    expect(screen.getByText('Firefox no Windows')).toBeInTheDocument();
    expect(screen.getByText('Horário do pedido')).toBeInTheDocument();
    expect(screen.getByText(/^Hoje, \d\d:\d\d$/)).toBeInTheDocument();
    const claimed = screen.getByText(/^O computador diz:/);
    expect(claimed).toHaveTextContent('O computador diz: Notebook da Marina · Claude. Esse texto vem do computador e não prova quem é.');
    expect(claimed.closest('li')).toBeNull();
    expect(screen.queryByRole('heading', { name: /Notebook da Marina/ })).toBeNull();
    expect(screen.getByText('marina.costa@ufba.br')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Só confirme se você acabou de pedir isso.');
    expect(screen.getByRole('button', { name: 'Liberar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('sem o que o computador diz, a linha "O computador diz" some', async () => {
    info = { ...info, label: null, client: null };
    openLink();
    renderApp('/pair');
    await screen.findByRole('heading', { name: /Liberar/ });
    expect(screen.queryByText(/O computador diz/)).toBeNull();
  });

  it('sem navegador nem sistema lidos pela API, diz que não deu para identificar (e não usa o label no lugar)', async () => {
    info = { ...info, seenBrowser: null, seenOs: null };
    openLink();
    renderApp('/pair');
    await screen.findByRole('heading', { name: /Liberar/ });
    expect(screen.getByText('Não deu para identificar')).toBeInTheDocument();
  });

  it('Liberar: confirme com a digital, e então "Pronto. Volte ao computador." (o pedido guardado é apagado)', async () => {
    let finish: (value: flows.ApproveResult) => void = () => undefined;
    mockedFlows.approvePairing.mockImplementation(() => new Promise((resolve) => void (finish = resolve)));
    openLink();
    renderApp('/pair');
    await userEvent.click(await screen.findByRole('button', { name: 'Liberar' }));

    expect(await screen.findByRole('heading', { name: 'Confirme com a digital' })).toBeInTheDocument();
    expect(screen.getByText(/Liberando/)).toHaveTextContent('Liberando o SIGAA no computador (Firefox no Windows).');
    const call = mockedFlows.approvePairing.mock.calls[0]?.[0];
    expect(call?.userId).toBe(me.id);
    expect(call?.pairId).toBe(PAIR_ID);
    expect([...(call?.computerPub ?? [])]).toEqual([...computer.pub]);

    finish({ ok: true });
    expect(await screen.findByRole('heading', { name: 'Pronto' })).toBeInTheDocument();
    expect(screen.getByText(/Volte a ele/)).toHaveTextContent('O SIGAA foi liberado no computador. Volte a ele.');
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

  describe('sem a digital deste celular (primeira vez, ou aparelho sem PRF)', () => {
    const connected = (slots: number): Me => meWithPasskey(slots);

    it('SIGAA aberto neste celular e sem passkey: ativa a digital e libera com a DK da sessão', async () => {
      me = connected(0);
      mockedFlows.activatePasskey.mockResolvedValue({ ok: true });
      mockedFlows.approvePairingWithSession.mockResolvedValue({ ok: true });
      openLink();
      renderApp('/pair');
      await userEvent.click(await screen.findByRole('button', { name: 'Liberar' }));

      expect(await screen.findByRole('heading', { name: 'Pronto' })).toBeInTheDocument();
      expect(screen.getByText('Este celular também ficou ativado: da próxima vez basta a digital.')).toBeInTheDocument();
      expect(mockedFlows.activatePasskey).toHaveBeenCalledOnce();
      expect(mockedFlows.approvePairing).not.toHaveBeenCalled();
      const call = mockedFlows.approvePairingWithSession.mock.calls[0]?.[0];
      expect(call?.pairId).toBe(PAIR_ID);
      expect([...(call?.computerPub ?? [])]).toEqual([...computer.pub]);
      expect(window.localStorage.getItem(STASH_KEY)).toBeNull();
    });

    it('aparelho sem PRF (a ativação falha): libera mesmo assim e diz que só o computador foi liberado', async () => {
      me = connected(0);
      mockedFlows.activatePasskey.mockResolvedValue({ ok: false, reason: 'unsupported' });
      mockedFlows.approvePairingWithSession.mockResolvedValue({ ok: true });
      openLink();
      renderApp('/pair');
      await userEvent.click(await screen.findByRole('button', { name: 'Liberar' }));

      expect(await screen.findByRole('heading', { name: 'Pronto' })).toBeInTheDocument();
      expect(screen.getByText('Este celular não guarda a chave com a digital, então liberei só o computador.')).toBeInTheDocument();
      expect(mockedFlows.approvePairingWithSession).toHaveBeenCalledOnce();
    });

    it('navegador sem WebAuthn: nem tenta ativar, libera com a DK da sessão', async () => {
      me = connected(0);
      mockedAuthn.hasWebAuthn.mockReturnValue(false);
      mockedFlows.approvePairingWithSession.mockResolvedValue({ ok: true });
      openLink();
      renderApp('/pair');
      await userEvent.click(await screen.findByRole('button', { name: 'Liberar' }));

      expect(await screen.findByRole('heading', { name: 'Pronto' })).toBeInTheDocument();
      expect(mockedFlows.activatePasskey).not.toHaveBeenCalled();
      expect(mockedFlows.approvePairingWithSession).toHaveBeenCalledOnce();
    });

    it('digital cancelada na ativação: pergunta, e "Liberar sem a digital" libera sem ativar', async () => {
      me = connected(0);
      mockedFlows.activatePasskey.mockResolvedValue({ ok: false, reason: 'cancelled' });
      mockedFlows.approvePairingWithSession.mockResolvedValue({ ok: true });
      openLink();
      renderApp('/pair');
      await userEvent.click(await screen.findByRole('button', { name: 'Liberar' }));

      expect(await screen.findByRole('heading', { name: 'A digital foi cancelada' })).toBeInTheDocument();
      expect(mockedFlows.approvePairingWithSession).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole('button', { name: 'Liberar sem a digital' }));
      expect(await screen.findByRole('heading', { name: 'Pronto' })).toBeInTheDocument();
      expect(mockedFlows.activatePasskey).toHaveBeenCalledOnce();
      expect(mockedFlows.approvePairingWithSession).toHaveBeenCalledOnce();
    });

    it('a passkey existe mas não é a deste aparelho (no_passkey): volta à revisão e "Liberar" usa a DK da sessão', async () => {
      mockedFlows.approvePairing.mockResolvedValue({ ok: false, reason: 'no_passkey' });
      mockedFlows.approvePairingWithSession.mockResolvedValue({ ok: true });
      openLink();
      renderApp('/pair');
      await userEvent.click(await screen.findByRole('button', { name: 'Liberar' }));
      // Já há outra cópia (slots 1): não oferece ativar de novo, só libera.
      await userEvent.click(await screen.findByRole('button', { name: 'Liberar' }));

      expect(await screen.findByRole('heading', { name: 'Pronto' })).toBeInTheDocument();
      expect(mockedFlows.activatePasskey).not.toHaveBeenCalled();
      expect(mockedFlows.approvePairingWithSession).toHaveBeenCalledOnce();
    });

    it('SIGAA ainda sem cofre neste celular: mostra quem pede ANTES, e "Liberar" abre o formulário da senha; digitada, ativa e libera', async () => {
      const base = meFixture();
      me = { ...base, connections: { ...base.connections, sigaa: { status: 'disconnected', login: null, passkey: { slots: 0 } } } };
      let posted: unknown = null;
      server.use(
        http.post(`${API}/connections/sigaa`, async ({ request }) => {
          posted = await request.json();
          me = meWithPasskey(0);
          return new HttpResponse(null, { status: 204 });
        }),
      );
      mockedFlows.activatePasskey.mockResolvedValue({ ok: true });
      mockedFlows.approvePairingWithSession.mockResolvedValue({ ok: true });
      openLink();
      renderApp('/pair');

      // A identificação aparece antes de qualquer senha.
      expect(await screen.findByText('Firefox no Windows')).toBeInTheDocument();
      expect(screen.getByText('O celular vai pedir a senha do SIGAA, uma vez só.')).toBeInTheDocument();
      expect(screen.queryByText(/Como já havia uma senha guardada/)).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Liberar' }));

      const dialog = await screen.findByRole('dialog', { name: 'Conectar o SIGAA' });
      await userEvent.type(within(dialog).getByLabelText('CPF', { exact: true }), '52998224725');
      await userEvent.type(within(dialog).getByLabelText('Senha do SIGAA'), 's3nh4-secreta');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Conectar' }));

      expect(await screen.findByRole('heading', { name: 'Pronto' })).toBeInTheDocument();
      expect(posted).toEqual({ login: '52998224725', password: 's3nh4-secreta' });
      expect(mockedFlows.activatePasskey).toHaveBeenCalledOnce();
      expect(mockedFlows.approvePairingWithSession).toHaveBeenCalledOnce();
    });

    it('já havia cofre mas esta sessão não o abre (password_required): avisa que digitar de novo desativa a digital dos outros', async () => {
      const base = meFixture();
      me = { ...base, connections: { ...base.connections, sigaa: { status: 'password_required', login: 'marina.costa', passkey: { slots: 0 } } } };
      openLink();
      renderApp('/pair');
      expect(await screen.findByText(/Como já havia uma senha guardada, digitar de novo desativa a digital dos outros celulares e dos apps\./)).toBeInTheDocument();
    });
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
