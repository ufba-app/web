import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { Me, PasskeyList } from '../contract';
import { authorizedAppFixture, meFixture } from '../contract/fixtures';
import * as flows from '../lib/passkey/flows';
import { notify } from '../lib/notify';
import { renderApp } from '../test/render';
import { API, server } from '../test/server';

vi.mock('../lib/passkey/flows', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/passkey/flows')>()),
  activatePasskey: vi.fn(),
}));

const mockedFlows = vi.mocked(flows);

let me: Me;
let passkeys: PasskeyList['passkeys'];
let deleted: string[];

const phone = (credentialId: string, label: string | null, lastUnlockedAt: string | null = null) => ({
  credentialId,
  prfSalt: 'c2FsdA',
  label,
  createdAt: '2026-11-04T15:00:00Z',
  lastUnlockedAt,
});

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

beforeEach(() => {
  me = meFixture();
  passkeys = [];
  deleted = [];
  server.use(
    http.get(`${API}/me`, () => HttpResponse.json(me)),
    http.get(`${API}/authorized-apps`, () => HttpResponse.json({ apps: [authorizedAppFixture()] })),
    http.get(`${API}/sigaa/passkey`, () => HttpResponse.json({ passkeys })),
    http.delete(`${API}/sigaa/passkey/:id`, ({ params }) => {
      deleted.push(String(params.id));
      passkeys = passkeys.filter((item) => item.credentialId !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
});

describe('/authorized-apps: celulares ativados', () => {
  it('lista cada celular com o nome, quando foi ativado e o último desbloqueio', async () => {
    passkeys = [phone('cred-1', 'iPhone de Marina', hoursAgo(2)), phone('cred-2', 'Galaxy S23'), phone('cred-3', null, hoursAgo(72))];
    const { container } = renderApp('/authorized-apps');

    expect(await screen.findByRole('heading', { name: 'Celulares ativados' })).toBeInTheDocument();
    const section = await screen.findByRole('region', { name: 'Celulares ativados' });
    const rows = await within(section).findAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0] as HTMLElement).getByText('iPhone de Marina')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText(/Ativado em 4 nov · último desbloqueio há 2 h/)).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText(/último desbloqueio nunca/)).toBeInTheDocument();
    // Sem nome guardado, um nome neutro.
    expect(within(rows[2] as HTMLElement).getByText('Celular')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText(/último desbloqueio há 3 dias/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('nenhum celular: estado vazio com o caminho para ativar', async () => {
    renderApp('/authorized-apps');
    expect(await screen.findByRole('heading', { name: 'Nenhum celular ativado' })).toBeInTheDocument();
    expect(screen.getByText(/Abra o ufba\.app no celular, conecte o SIGAA e toque em Ativar\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ativar mais um celular' })).toBeEnabled();
  });

  it('SIGAA fora do ar: o botão de ativar fica desligado e a tela diz o porquê', async () => {
    me = { ...me, connections: { ...me.connections, sigaa: { status: 'disconnected', login: null, passkey: { slots: 0 } } } };
    renderApp('/authorized-apps');
    expect(await screen.findByText('Conecte o SIGAA em Conexões para ativar um celular.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ativar mais um celular' })).toBeDisabled();
  });

  it('limite de 5: aviso e o botão de ativar desligado', async () => {
    passkeys = [1, 2, 3, 4, 5].map((n) => phone(`cred-${n}`, `Celular ${n}`));
    renderApp('/authorized-apps');
    expect(await screen.findByText(/Você chegou ao limite de 5 celulares\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ativar mais um celular' })).toBeDisabled();
  });

  it('remover pede confirmação, só apaga ao confirmar e some da lista (com aviso)', async () => {
    passkeys = [phone('cred-1', 'iPhone de Marina'), phone('cred-2', 'Galaxy S23')];
    renderApp('/authorized-apps');
    await userEvent.click(await screen.findByRole('button', { name: 'Remover Galaxy S23' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Remover Galaxy S23?' })).toBeInTheDocument();
    expect(within(dialog).getByText(/Esse celular deixa de liberar o SIGAA em outros aparelhos\. Dá para ativar de novo quando quiser\./)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(deleted).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Remover Galaxy S23' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Celular removido.'));
    expect(deleted).toEqual(['cred-2']);
    await waitFor(() => expect(screen.queryByText('Galaxy S23')).toBeNull());
    expect(screen.getByText('iPhone de Marina')).toBeInTheDocument();
  });

  it('o id da passkey vai codificado na URL do DELETE', async () => {
    passkeys = [phone('a/b+c', 'iPhone')];
    renderApp('/authorized-apps');
    await userEvent.click(await screen.findByRole('button', { name: 'Remover iPhone' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(deleted).toEqual(['a/b+c']));
  });

  it('erro ao remover: o texto da API aparece dentro do diálogo, que continua aberto', async () => {
    passkeys = [phone('cred-1', 'iPhone de Marina')];
    server.use(
      http.delete(`${API}/sigaa/passkey/:id`, () => HttpResponse.json({ error: 'passkey_not_found', message: 'Esse celular já foi removido.' }, { status: 404 })),
    );
    renderApp('/authorized-apps');
    await userEvent.click(await screen.findByRole('button', { name: 'Remover iPhone de Marina' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));
    expect(await within(dialog).findByText('Esse celular já foi removido.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('falha ao carregar a lista: aviso com "Tentar de novo", que recarrega', async () => {
    let fail = true;
    server.use(
      http.get(`${API}/sigaa/passkey`, () =>
        fail ? HttpResponse.json({ error: 'internal_error', message: 'Deu ruim.' }, { status: 500 }) : HttpResponse.json({ passkeys: [phone('cred-1', 'Pixel 8')] }),
      ),
    );
    renderApp('/authorized-apps');
    const alert = await screen.findByText('Deu ruim.');
    expect(alert).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Pixel 8')).toBeInTheDocument();
  });

  it('"Ativar mais um celular" abre a ativação aqui mesmo; "Agora não" fecha', async () => {
    renderApp('/authorized-apps');
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar mais um celular' }));
    expect(await screen.findByRole('heading', { name: 'Ativar este aparelho para liberar outros' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Ativar este aparelho para liberar outros' })).toBeNull());
  });

  it('ativou: a lista recarrega com o celular novo', async () => {
    mockedFlows.activatePasskey.mockImplementation(async () => {
      passkeys = [phone('cred-9', 'Safari no iPhone')];
      return { ok: true };
    });
    renderApp('/authorized-apps');
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar mais um celular' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Concluir' }));
    expect(await screen.findByText('Safari no iPhone')).toBeInTheDocument();
  });
});
