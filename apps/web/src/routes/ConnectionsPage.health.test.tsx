import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { Health, Me } from '../contract';
import { meFixture, OK_HEALTH } from '../contract/fixtures';
import { mockLocationAssign, renderApp } from '../test/render';
import { API, server } from '../test/server';

/** Saúde das conexões (api#79) nos cartões de Conexões: selo, a frase da API e o botão da ação. */
let me: Me;
let meReads: number;

const health = (overrides: Partial<NonNullable<Health>>): NonNullable<Health> => ({
  state: 'degraded',
  reason: 'source_unavailable',
  message: 'O SIGAA está fora do ar agora.',
  action: 'retry',
  since: '2026-11-16T12:00:00.000Z',
  ...overrides,
});

function withConnections(patch: Partial<Me['connections']>): Me {
  const base = meFixture();
  return { ...base, connections: { ...base.connections, ...patch } };
}

const ready = (title: string) => screen.findByRole('heading', { name: title });
const card = (title: string) => within(screen.getByRole('heading', { name: title }).closest('article')!);

beforeEach(() => {
  meReads = 0;
  me = meFixture();
  server.use(
    http.get(`${API}/me`, () => {
      meReads += 1;
      return HttpResponse.json(me);
    }),
  );
});

describe('/connections · saúde das conexões', () => {
  it('cada conexão com saúde mostra o selo e a frase da API (SIGAA, Moodle e cada conta do Classroom)', async () => {
    renderApp('/connections');
    await ready('SIGAA');
    for (const title of ['SIGAA', 'Moodle', 'Classroom']) {
      expect(card(title).getByText('Funcionando')).toBeInTheDocument();
      expect(card(title).getByText('Conexão funcionando.')).toBeInTheDocument();
    }
    // Saúde ok não traz botão: só os do cartão.
    expect(card('SIGAA').queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
  });

  it('sem conexão (health null): nenhum selo de saúde', async () => {
    me = withConnections({ moodle: { status: 'disconnected', account: null, health: null } });
    renderApp('/connections');
    await ready('Moodle');
    expect(card('Moodle').queryByText(/Funcionando|Com problema|Precisa de você|Sem leitura/)).toBeNull();
  });

  it('degradado com "retry": selo de alerta, a frase e "Tentar de novo", que relê o /me (um clique, sem polling)', async () => {
    const base = meFixture();
    me = withConnections({ sigaa: { ...base.connections.sigaa, health: health({}) } });
    renderApp('/connections');
    await ready('SIGAA');
    expect(card('SIGAA').getByText('Com problema')).toBeInTheDocument();
    expect(card('SIGAA').getByText('O SIGAA está fora do ar agora.')).toBeInTheDocument();
    await waitFor(() => expect(meReads).toBeGreaterThanOrEqual(1));
    const before = meReads;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(meReads).toBe(before); // nada lê sozinho

    await userEvent.click(card('SIGAA').getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(meReads).toBeGreaterThan(before));
  });

  it('"reconnect" no Moodle conectado abre o fluxo de conectar do Moodle', async () => {
    const base = meFixture();
    me = withConnections({
      moodle: { ...base.connections.moodle, health: health({ state: 'action_required', reason: 'token_revoked', message: 'O Moodle recusou o acesso. Reconecte.', action: 'reconnect' }) },
    });
    renderApp('/connections');
    await ready('Moodle');
    expect(card('Moodle').getByText('Precisa de você')).toBeInTheDocument();
    expect(card('Moodle').getByText('O Moodle recusou o acesso. Reconecte.')).toBeInTheDocument();
    await userEvent.click(card('Moodle').getByRole('button', { name: 'Reconectar' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('sem botão repetido: o Moodle que já pede "Reconectar" no cartão não ganha um segundo', async () => {
    me = withConnections({
      moodle: { status: 'reconnect_required', account: 'ava.ufba.br:marina.costa', health: health({ state: 'action_required', reason: 'token_revoked', message: 'Sessão do Moodle expirou.', action: 'reconnect' }) },
    });
    renderApp('/connections');
    await ready('Moodle');
    expect(card('Moodle').getByText('Sessão do Moodle expirou.')).toBeInTheDocument();
    expect(card('Moodle').getAllByRole('button', { name: 'Reconectar' })).toHaveLength(1);
  });

  it('"unknown": selo cinza com a frase e sem botão', async () => {
    const base = meFixture();
    me = withConnections({
      moodle: { ...base.connections.moodle, health: health({ state: 'unknown', reason: 'never_read', message: 'Ainda não lemos o Moodle.', action: null }) },
    });
    renderApp('/connections');
    await ready('Moodle');
    expect(card('Moodle').getByText('Sem leitura ainda')).toBeInTheDocument();
    expect(card('Moodle').getByText('Ainda não lemos o Moodle.')).toBeInTheDocument();
    expect(card('Moodle').queryByRole('button', { name: /Reconectar|Tentar de novo|Desbloquear/ })).toBeNull();
  });

  it('SIGAA trancado: mostra a frase e o bloco de liberar do cartão resolve (a saúde não repete o botão)', async () => {
    const base = meFixture();
    me = withConnections({
      sigaa: { ...base.connections.sigaa, status: 'locked', health: health({ state: 'action_required', reason: 'locked', message: 'Libere o SIGAA neste navegador.', action: 'unlock' }) },
    });
    renderApp('/connections');
    await ready('SIGAA');
    expect(card('SIGAA').getByText('Libere o SIGAA neste navegador.')).toBeInTheDocument();
    expect(card('SIGAA').queryByRole('button', { name: 'Desbloquear' })).toBeNull();
  });

  it('conta do Classroom que precisa reconectar: o botão leva ao login do Google do app certo (@ufba.br ou outra conta)', async () => {
    const base = meFixture();
    const assign = mockLocationAssign();
    me = withConnections({
      classroom: {
        ...base.connections.classroom,
        accounts: [
          { email: 'a@gmail.com', status: 'reconnect_required', health: health({ state: 'action_required', reason: 'token_expired', message: 'O Google pede que você entre de novo.', action: 'reconnect' }) },
        ],
      },
    });
    renderApp('/connections');
    expect(await screen.findByText('O Google pede que você entre de novo.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reconectar' }));
    expect(assign).toHaveBeenCalledTimes(1);
    expect(String(assign.mock.calls[0]?.[0])).toContain('app=guest');
  });

  it('SIASB: selo e frase; reconectar usa o fluxo do SIASB e "retry" relê o /me', async () => {
    me = withConnections({
      siasb: { offered: true, status: 'connected', expiresAt: null, syncedAt: null, health: health({ reason: 'stale_copy', message: 'A cópia do SIASB está desatualizada.', action: 'retry' }) },
    });
    renderApp('/connections');
    await ready('SIASB');
    expect(card('SIASB').getByText('A cópia do SIASB está desatualizada.')).toBeInTheDocument();
    await waitFor(() => expect(meReads).toBeGreaterThanOrEqual(1));
    const before = meReads;
    await userEvent.click(card('SIASB').getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(meReads).toBeGreaterThan(before));
  });

  it('não tem violações de acessibilidade (axe) com selos de cada estado', async () => {
    const base = meFixture();
    me = withConnections({
      sigaa: { ...base.connections.sigaa, health: health({}) },
      moodle: { ...base.connections.moodle, health: health({ state: 'action_required', message: 'Reconecte o Moodle.', action: 'reconnect' }) },
      classroom: { ...base.connections.classroom, accounts: [{ email: 'a@ufba.br', status: 'connected', health: OK_HEALTH }] },
    });
    const { container } = renderApp('/connections');
    await screen.findByText('Reconecte o Moodle.');
    expect(await axe(container)).toHaveNoViolations();
  });
});
