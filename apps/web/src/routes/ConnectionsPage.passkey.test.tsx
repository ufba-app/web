import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { Me } from '../contract';
import { meFixture } from '../contract/fixtures';
import * as flows from '../lib/passkey/flows';
import { notify } from '../lib/notify';
import * as webauthn from '../lib/passkey/webauthn';
import { renderApp } from '../test/render';
import { API, server } from '../test/server';

vi.mock('../lib/passkey/webauthn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/passkey/webauthn')>()),
  looksLikePhone: vi.fn(),
  hasWebAuthn: vi.fn(),
}));
vi.mock('../lib/passkey/flows', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/passkey/flows')>()),
  activatePasskey: vi.fn(),
  unlockWithPasskey: vi.fn(),
}));

const mockedAuthn = vi.mocked(webauthn);
const mockedFlows = vi.mocked(flows);

let me: Me;

function withSigaa(sigaa: Partial<Me['connections']['sigaa']>): Me {
  const base = meFixture();
  return { ...base, connections: { ...base.connections, sigaa: { ...base.connections.sigaa, ...sigaa } } };
}

const PAIRING_ID = 'AAECAwQFBgcICQoLDA0ODw';

beforeEach(() => {
  me = meFixture();
  mockedAuthn.looksLikePhone.mockReturnValue(false);
  mockedAuthn.hasWebAuthn.mockReturnValue(true);
  server.use(
    http.get(`${API}/me`, () => HttpResponse.json(me)),
    // O QR do computador abre um pedido no correio e consulta enquanto espera.
    http.post(`${API}/pairings`, () =>
      HttpResponse.json({ id: PAIRING_ID, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() }, { status: 201 }),
    ),
    http.get(`${API}/pairings/${PAIRING_ID}`, () => HttpResponse.json({ status: 'pending' })),
  );
});

describe('/connections com o SIGAA trancado', () => {
  it('no computador: selo "Trancado", o QR do celular e, por baixo, "digite a senha do SIGAA"', async () => {
    me = withSigaa({ status: 'locked', login: '52998224725', passkey: { slots: 1 } });
    const { container } = renderApp('/connections');

    expect(await screen.findByText('Trancado')).toBeInTheDocument();
    expect(screen.getByText('Trancado neste navegador. Libere com o celular ou digite a senha.')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'QR para liberar o SIGAA com o celular' })).toBeInTheDocument();
    expect(screen.getByText('Abra a câmera do celular e leia o código. Use o celular que você ativou.')).toBeInTheDocument();
    expect(screen.getByText('Esperando o celular…')).toBeInTheDocument();
    expect(screen.getByText(/Vale por [45]:\d\d/)).toBeInTheDocument();
    // Trancado não é "Conectar": o único caminho é o QR ou a senha.
    expect(screen.queryByRole('button', { name: 'Conectar' })).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('"digite a senha do SIGAA" abre o formulário da senha', async () => {
    me = withSigaa({ status: 'locked', passkey: { slots: 1 } });
    renderApp('/connections');
    await userEvent.click(await screen.findByRole('button', { name: 'digite a senha do SIGAA' }));
    expect(await screen.findByRole('heading', { name: /conectar o sigaa/i })).toBeInTheDocument();
  });

  it('no celular: um botão só, "Desbloquear com a digital" (sem QR); liberou, o SIGAA volta a "Conectado"', async () => {
    mockedAuthn.looksLikePhone.mockReturnValue(true);
    me = withSigaa({ status: 'locked', passkey: { slots: 1 } });
    mockedFlows.unlockWithPasskey.mockImplementation(async () => {
      me = withSigaa({ status: 'connected', passkey: { slots: 1 } });
      return { ok: true };
    });
    renderApp('/connections');

    expect(await screen.findByText('Trancado neste aparelho.')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /QR/ })).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: /desbloquear com a digital/i }));

    expect(mockedFlows.unlockWithPasskey).toHaveBeenCalledWith({ userId: me.id });
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('SIGAA liberado.'));
    expect(await screen.findByText('3 de 3 conectadas')).toBeInTheDocument();
    expect(screen.queryByText('Trancado')).toBeNull();
  });

  it('no celular: cancelou a digital vira um aviso e a tela continua (sem abrir a senha)', async () => {
    mockedAuthn.looksLikePhone.mockReturnValue(true);
    me = withSigaa({ status: 'locked', passkey: { slots: 1 } });
    mockedFlows.unlockWithPasskey.mockResolvedValue({ ok: false, reason: 'cancelled' });
    renderApp('/connections');
    await userEvent.click(await screen.findByRole('button', { name: /desbloquear com a digital/i }));
    await waitFor(() => expect(notify.info).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: /conectar o sigaa/i })).toBeNull();
  });

  it.each([
    ['no_passkey', 'Este celular não tem a senha guardada. Digite a senha do SIGAA.'],
    ['unsupported', 'Não deu para usar a digital neste celular. Digite a senha do SIGAA.'],
    ['rejected', 'A chave não abriu a senha guardada. Digite a senha do SIGAA.'],
  ] as const)('no celular: falha (%s) cai direto no formulário da senha, com o aviso', async (reason, text) => {
    mockedAuthn.looksLikePhone.mockReturnValue(true);
    me = withSigaa({ status: 'locked', passkey: { slots: 1 } });
    mockedFlows.unlockWithPasskey.mockResolvedValue({ ok: false, reason });
    renderApp('/connections');
    await userEvent.click(await screen.findByRole('button', { name: /desbloquear com a digital/i }));
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith(text));
    expect(await screen.findByRole('heading', { name: /conectar o sigaa/i })).toBeInTheDocument();
  });

  it('no celular: falha de rede só avisa (não troca de caminho)', async () => {
    mockedAuthn.looksLikePhone.mockReturnValue(true);
    me = withSigaa({ status: 'locked', passkey: { slots: 1 } });
    mockedFlows.unlockWithPasskey.mockResolvedValue({ ok: false, reason: 'failed' });
    renderApp('/connections');
    await userEvent.click(await screen.findByRole('button', { name: /desbloquear com a digital/i }));
    await waitFor(() => expect(notify.error).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: /conectar o sigaa/i })).toBeNull();
  });
});

describe('/connections: oferta de ativar o celular', () => {
  const offer = 'Usar este celular para liberar outros aparelhos';

  it('celular com o SIGAA conectado e nenhuma passkey: mostra a oferta com "Ativar" e "Agora não"', async () => {
    mockedAuthn.looksLikePhone.mockReturnValue(true);
    const { container } = renderApp('/connections');
    expect(await screen.findByRole('heading', { name: offer })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ativar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agora não' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('NUNCA no computador (nem a oferta, nem a nota de "sem suporte")', async () => {
    mockedAuthn.looksLikePhone.mockReturnValue(false);
    mockedAuthn.hasWebAuthn.mockReturnValue(false);
    renderApp('/connections');
    expect(await screen.findByText('3 de 3 conectadas')).toBeInTheDocument();
    expect(screen.queryByText(offer)).toBeNull();
    expect(screen.queryByText(/não suporta liberar outros aparelhos/)).toBeNull();
  });

  it('não oferece se já há passkey ou se o SIGAA não está conectado', async () => {
    mockedAuthn.looksLikePhone.mockReturnValue(true);
    me = withSigaa({ passkey: { slots: 1 } });
    const first = renderApp('/connections');
    expect(await screen.findByText('3 de 3 conectadas')).toBeInTheDocument();
    expect(screen.queryByText(offer)).toBeNull();
    first.unmount();

    me = withSigaa({ status: 'disconnected', login: null });
    renderApp('/connections');
    expect(await screen.findByText('2 de 3 conectadas')).toBeInTheDocument();
    expect(screen.queryByText(offer)).toBeNull();
  });

  it('celular sem WebAuthn: no lugar da oferta, a nota discreta (o SIGAA segue com a senha)', async () => {
    mockedAuthn.looksLikePhone.mockReturnValue(true);
    mockedAuthn.hasWebAuthn.mockReturnValue(false);
    renderApp('/connections');
    expect(await screen.findByText(/Este celular não suporta liberar outros aparelhos com a digital/)).toBeInTheDocument();
    expect(screen.queryByText(offer)).toBeNull();
  });

  it('"Agora não" esconde a oferta e é lembrado neste navegador (volta a aparecer só se o armazenamento for limpo)', async () => {
    mockedAuthn.looksLikePhone.mockReturnValue(true);
    const first = renderApp('/connections');
    await userEvent.click(await screen.findByRole('button', { name: 'Agora não' }));
    expect(screen.queryByText(offer)).toBeNull();
    expect(window.localStorage.getItem('ufba.passkey.offer.dismissed')).toBe('1');
    first.unmount();

    renderApp('/connections');
    expect(await screen.findByText('3 de 3 conectadas')).toBeInTheDocument();
    expect(screen.queryByText(offer)).toBeNull();

    window.localStorage.clear();
  });

  it('Ativar: confirme com a digital, conferindo, celular ativado, Concluir (e a oferta some quando há passkey)', async () => {
    mockedAuthn.looksLikePhone.mockReturnValue(true);
    let finish: (value: flows.ActivateResult) => void = () => undefined;
    let onChecking: (() => void) | undefined;
    mockedFlows.activatePasskey.mockImplementation(
      (input) =>
        new Promise((resolve) => {
          onChecking = input.onChecking;
          finish = resolve;
        }),
    );
    renderApp('/connections');
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar' }));

    expect(await screen.findByRole('heading', { name: 'Confirme com a digital' })).toBeInTheDocument();
    expect(screen.getByText('É só para ativar este celular. Nada sai dele.')).toBeInTheDocument();
    const call = mockedFlows.activatePasskey.mock.calls[0]?.[0];
    expect(call).toMatchObject({ userId: me.id, userName: 'marina.costa@ufba.br', displayName: 'Marina Costa' });

    onChecking?.();
    expect(await screen.findByRole('heading', { name: 'Conferindo…' })).toBeInTheDocument();

    me = withSigaa({ passkey: { slots: 1 } });
    finish({ ok: true });
    expect(await screen.findByRole('heading', { name: 'Celular ativado' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    await waitFor(() => expect(screen.queryByText('Celular ativado')).toBeNull());
    expect(screen.queryByText(offer)).toBeNull();
  });

  it('digital cancelada: aviso e "Tentar de novo"', async () => {
    mockedAuthn.looksLikePhone.mockReturnValue(true);
    mockedFlows.activatePasskey.mockResolvedValueOnce({ ok: false, reason: 'cancelled' });
    renderApp('/connections');
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar' }));
    expect(await screen.findByText('A digital foi cancelada. Nada foi ativado.')).toBeInTheDocument();
    mockedFlows.activatePasskey.mockResolvedValueOnce({ ok: true });
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'Celular ativado' })).toBeInTheDocument();
  });

  it('o aparelho não faz PRF: nota "este celular não suporta" no lugar da oferta', async () => {
    mockedAuthn.looksLikePhone.mockReturnValue(true);
    mockedFlows.activatePasskey.mockResolvedValue({ ok: false, reason: 'unsupported' });
    renderApp('/connections');
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar' }));
    expect(await screen.findByText(/Este celular não suporta liberar outros aparelhos com a digital/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ativar' })).toBeNull();
  });

  it('falha inesperada: erro e "Tentar de novo"; limite: aviso sem botão de ativar', async () => {
    mockedAuthn.looksLikePhone.mockReturnValue(true);
    mockedFlows.activatePasskey.mockResolvedValueOnce({ ok: false, reason: 'failed' });
    const first = renderApp('/connections');
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Não deu para ativar agora. Tente de novo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    first.unmount();

    mockedFlows.activatePasskey.mockResolvedValueOnce({ ok: false, reason: 'limit' });
    renderApp('/connections');
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar' }));
    expect(await screen.findByText(/Você chegou ao limite de 5 celulares/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ativar|tentar de novo/i })).toBeNull();
  });
});
