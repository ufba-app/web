import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { AuthorizedApp } from '../contract';
import { authorizedAppFixture, moodleForumPermissionFixture, offeredPermissionsFixture } from '../contract/fixtures';
import { notify } from '../lib/notify';
import { meHandler, renderApp } from '../test/render';
import { API, server } from '../test/server';

/**
 * Apps autorizados com as permissões de cada app (api#57; canvas, seção 4: "Autorizado com:"). Cada permissão que a
 * pessoa liberou para o app dá para retirar sem revogar o app (DELETE /authorized-apps/{clientId}/permissions/{key}).
 */
const granted = () =>
  offeredPermissionsFixture().map(({ key, source, title, description, risk }) => ({ key, source, title, description, risk }));

let apps: AuthorizedApp[];
let deletes: Array<{ path: string; csrf: string | null }>;

beforeEach(() => {
  deletes = [];
  apps = [
    authorizedAppFixture({ permissions: granted() }),
    authorizedAppFixture({ clientId: 'client-2', domain: 'estudos.exemplo.com', name: 'Assistente de Estudos', verified: false }),
  ];
  vi.mocked(notify.success).mockClear();
  vi.mocked(notify.error).mockClear();
  server.use(
    meHandler(),
    http.get(`${API}/authorized-apps`, () => HttpResponse.json({ apps })),
    http.get(`${API}/sigaa/passkey`, () => HttpResponse.json({ passkeys: [] })),
    http.delete(`${API}/authorized-apps/:clientId/permissions/:key`, ({ request, params }) => {
      deletes.push({ path: `${params.clientId}/${params.key}`, csrf: request.headers.get('x-ufba') });
      apps = apps.map((app) =>
        app.clientId === params.clientId ? { ...app, permissions: app.permissions.filter((permission) => permission.key !== params.key) } : app,
      );
      return new HttpResponse(null, { status: 204 });
    }),
  );
});

describe('/authorized-apps · permissões de cada app', () => {
  it('mostra "Autorizado com: Leitura" e cada permissão liberada, com o texto da API', async () => {
    renderApp('/authorized-apps');
    const list = await screen.findByRole('list', { name: 'Permissões liberadas para Claude' });
    expect(within(list).getByText('Agendar e desmarcar sessões pelo app')).toBeInTheDocument();
    expect(within(list).getByText(/Permite que o app inclua e exclua procedimentos/)).toBeInTheDocument();
    expect(screen.getAllByText('Leitura')).toHaveLength(2); // um por app
  });

  it('a permissão do Moodle (postar em fóruns) aparece e se retira como as do SIASB: o componente é genérico por fonte', async () => {
    const { key, source, title, description, risk } = moodleForumPermissionFixture();
    apps = [authorizedAppFixture({ permissions: [...granted(), { key, source, title, description, risk }] })];
    renderApp('/authorized-apps');
    const list = await screen.findByRole('list', { name: 'Permissões liberadas para Claude' });
    expect(within(list).getByText('Postar em fóruns do AVA pelo app')).toBeInTheDocument();
    expect(within(list).getByText(/Permite que o app publique mensagens em fóruns do AVA/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retirar: Postar em fóruns do AVA pelo app, de Claude' }));
    await waitFor(() => expect(deletes).toEqual([{ path: 'client-1/moodle.forum_write', csrf: '1' }]));
    await waitFor(() => expect(screen.queryByText('Postar em fóruns do AVA pelo app')).toBeNull());
    // As do SIASB continuam.
    expect(screen.getByText('Agendar e desmarcar sessões pelo app')).toBeInTheDocument();
  });

  it('um app sem permissões mostra só "Leitura", sem lista', async () => {
    renderApp('/authorized-apps');
    await screen.findByText('Assistente de Estudos');
    expect(screen.queryByRole('list', { name: 'Permissões liberadas para Assistente de Estudos' })).toBeNull();
  });

  it('Retirar tira só aquela permissão (DELETE com X-UFBA), mantém o app, avisa e relê a lista', async () => {
    renderApp('/authorized-apps');
    await userEvent.click(await screen.findByRole('button', { name: 'Retirar: Lançar e excluir procedimentos pelo app, de Claude' }));

    await waitFor(() => expect(deletes).toEqual([{ path: 'client-1/siasb.procedures_write', csrf: '1' }]));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Permissão retirada.'));
    await waitFor(() => expect(screen.queryByText(/Lançar e excluir procedimentos pelo app/)).toBeNull());
    // A outra permissão e o app continuam; nenhum diálogo de revogar abriu.
    expect(screen.getByText('Agendar e desmarcar sessões pelo app')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revogar Claude' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('404 (o app já não tinha a permissão): mostra a mensagem da API e relê a lista', async () => {
    server.use(
      http.delete(`${API}/authorized-apps/:clientId/permissions/:key`, () => {
        apps = apps.map((app) => ({ ...app, permissions: [] }));
        return HttpResponse.json({ error: 'not_found', message: 'Esse app não tem essa permissão.' }, { status: 404 });
      }),
    );
    renderApp('/authorized-apps');
    await userEvent.click(await screen.findByRole('button', { name: 'Retirar: Agendar e desmarcar sessões pelo app, de Claude' }));

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Esse app não tem essa permissão.'));
    await waitFor(() => expect(screen.queryByText('Agendar e desmarcar sessões pelo app')).toBeNull());
  });

  it('falha de rede ao retirar: mensagem genérica e a permissão continua na lista', async () => {
    server.use(http.delete(`${API}/authorized-apps/:clientId/permissions/:key`, () => HttpResponse.error()));
    renderApp('/authorized-apps');
    await userEvent.click(await screen.findByRole('button', { name: 'Retirar: Agendar e desmarcar sessões pelo app, de Claude' }));

    await waitFor(() => expect(notify.error).toHaveBeenCalled());
    expect(screen.getByText('Agendar e desmarcar sessões pelo app')).toBeInTheDocument();
  });

  it('não tem violações de acessibilidade (axe)', async () => {
    const { container } = renderApp('/authorized-apps');
    await screen.findByRole('list', { name: 'Permissões liberadas para Claude' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
