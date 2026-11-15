import { expect, test } from '@playwright/test';
import { me, mockApi } from './support';

/** Telas pós-login com a API simulada (a sessão real depende do Google). */
test.describe('telas pós-login (API simulada)', () => {
  test('Conexões: contador e sem rolagem horizontal, também no celular', async ({ page }) => {
    await mockApi(page, { 'GET /me': () => ({ body: me }) });
    await page.goto('/connections');

    await expect(page.getByText('3 de 3 conectadas')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'SIGAA' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('no celular o menu vira botão; no desktop é a lateral', async ({ page, isMobile }) => {
    await mockApi(page, { 'GET /me': () => ({ body: me }) });
    await page.goto('/connections');
    await expect(page.getByRole('heading', { name: 'Conexões' })).toBeVisible();

    const menuButton = page.getByRole('button', { name: /abrir menu/i });
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 820) {
      await expect(menuButton).toBeVisible();
      await menuButton.click();
      await expect(page.getByRole('link', { name: 'Apps autorizados' })).toBeVisible();
    } else {
      await expect(menuButton).toBeHidden();
      await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
    }
    void isMobile;
  });

  test('SIGAA: a senha vai direto para a API, o campo é apagado e ela nunca aparece na URL', async ({ page }) => {
    let sent: { login?: string; password?: string } = {};
    let sigaa = 'disconnected';
    await mockApi(page, {
      'GET /me': () => ({ body: { ...me, connections: { ...me.connections, sigaa: { status: sigaa, login: null, passkey: { slots: 0 } } } } }),
      'POST /connections/sigaa': async (request) => {
        sent = request.postDataJSON();
        expect(request.headers()['x-ufba']).toBe('1');
        sigaa = 'connected';
        return { status: 204 };
      },
      // Sem conexão, o computador mostra o QR do celular (abre um pedido no correio) e a senha por baixo.
      'POST /pairings': () => ({ status: 201, body: { id: 'AAECAwQFBgcICQoLDA0ODw', expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() } }),
      'GET /pairings/AAECAwQFBgcICQoLDA0ODw': () => ({ body: { status: 'pending' } }),
      // Conectado, a pessoa vai direto para a vida acadêmica.
      'GET /me/academic': () => ({
        body: { available: true, consent: false, status: 'NONE', failure: null, verified: null, reader: null, importedAt: null, curriculumStatus: 'NONE', summary: null, draft: null },
      }),
    });
    await page.goto('/connections');

    await expect(page.getByRole('img', { name: 'QR para liberar o SIGAA com o celular' })).toBeVisible();
    await page.getByRole('button', { name: 'digite a senha do SIGAA' }).click();
    const dialog = page.getByRole('dialog', { name: 'Conectar o SIGAA' });
    await dialog.getByLabel('CPF', { exact: true }).fill('52998224725');
    await dialog.getByLabel('Senha do SIGAA').fill('s3nh4-secreta');
    await dialog.getByRole('button', { name: 'Conectar' }).click();

    await expect(page.getByText('SIGAA conectado.')).toBeVisible();
    await expect(page).toHaveURL(/\/academic$/);
    await expect(page.getByRole('heading', { name: 'Quer ver sua vida acadêmica aqui?' })).toBeVisible();
    expect(sent).toEqual({ login: '52998224725', password: 's3nh4-secreta' });
    expect(page.url()).not.toContain('s3nh4');
    expect(await page.content()).not.toContain('s3nh4-secreta');
  });

  test('sem sessão, o painel manda para o login no auth e o destino é só um caminho', async ({ page }) => {
    await mockApi(page, {
      'GET /me': () => ({ status: 401, body: { error: 'session_expired', message: 'Entre de novo.' } }),
    });
    await page.route('http://localhost:3002/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>auth</title>' }),
    );
    await page.goto('/connections');

    await expect(page).toHaveURL('http://localhost:3002/sign-in?return=%2Fconnections');
  });

  test('Apps autorizados: revogar com confirmação', async ({ page }) => {
    let apps = [
      {
        clientId: 'client-1',
        domain: 'claude.ai',
        name: 'Claude',
        logoUrl: null,
        verified: true,
        authorizedAt: '2026-11-04T12:00:00.000Z',
        lastUsedAt: null,
        sigaa: true,
      },
    ];
    await mockApi(page, {
      'GET /me': () => ({ body: me }),
      'GET /authorized-apps': () => ({ body: { apps } }),
      'DELETE /authorized-apps/client-1': () => {
        apps = [];
        return { status: 204 };
      },
    });
    await page.goto('/authorized-apps');

    await page.getByRole('button', { name: 'Revogar Claude' }).click();
    await page.getByRole('dialog', { name: 'Revogar o Claude?' }).getByRole('button', { name: 'Revogar acesso' }).click();
    await expect(page.getByRole('heading', { name: 'Nenhum app autorizado' })).toBeVisible();
  });

  test('sessão que expira no meio de uma ação manda para o login com o destino', async ({ page }) => {
    await mockApi(page, {
      'GET /me': () => ({ body: me }),
      'GET /authorized-apps': () => ({
        body: {
          apps: [
            { clientId: 'c', domain: 'claude.ai', name: 'Claude', logoUrl: null, verified: true, authorizedAt: '2026-11-04T12:00:00.000Z', lastUsedAt: null, sigaa: true },
          ],
        },
      }),
      'DELETE /authorized-apps/c': () => ({ status: 401, body: { error: 'session_expired', message: 'Entre de novo.' } }),
    });
    // O login é outro app (auth, porta 3002). Aqui só importa para onde o painel manda a pessoa.
    await page.route('http://localhost:3002/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>auth</title>' }),
    );
    await page.goto('/authorized-apps');
    await page.getByRole('button', { name: 'Revogar Claude' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Revogar acesso' }).click();

    await expect(page).toHaveURL('http://localhost:3002/sign-in?return=%2Fauthorized-apps');
  });

  test('Conectar computador: código do link some da URL, mostra quem pediu e aprova', async ({ page }) => {
    const bodies: unknown[] = [];
    await mockApi(page, {
      'GET /me': () => ({ body: me }),
      'POST /device/lookup': async (request) => {
        bodies.push(request.postDataJSON());
        return {
          body: {
            clientName: 'Instalador ufba.app',
            computerName: 'Notebook da Marina',
            os: 'windows',
            requestedAt: '2026-11-14T15:30:00.000Z',
            approxLocation: 'Salvador, BA',
            ipDiffers: true,
          },
        };
      },
      'POST /device/decision': async (request) => {
        bodies.push(request.postDataJSON());
        return { status: 204 };
      },
    });
    await page.goto('/device?user_code=abcd1234');

    await expect(page.getByRole('heading', { name: 'Quem pediu' })).toBeVisible();
    await expect(page).toHaveURL('http://localhost:3001/device');
    await expect(page.getByText('Se não foi você, negue.')).toBeVisible();
    await page.getByRole('button', { name: 'Aprovar' }).click();

    await expect(page.getByRole('heading', { name: 'Computador conectado' })).toBeVisible();
    expect(bodies).toEqual([
      { userCode: 'ABCD-1234' },
      { userCode: 'ABCD-1234', decision: 'approve' },
    ]);
  });

  test('Conectar computador: sem sessão, volta para /device sem o código', async ({ page }) => {
    await mockApi(page, {
      'GET /me': () => ({ status: 401, body: { error: 'session_expired', message: 'Entre de novo.' } }),
    });
    await page.route('http://localhost:3002/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>auth</title>' }),
    );
    await page.goto('/device?user_code=ABCD-1234');

    await expect(page).toHaveURL('http://localhost:3002/sign-in?return=%2Fdevice');
  });

  test('Computadores conectados: renomear e desconectar', async ({ page }) => {
    let computers = [
      {
        id: 'pc-1',
        name: 'Notebook da Marina',
        os: 'windows',
        agents: ['claude-code'],
        installMode: 'fresh',
        createdAt: '2026-11-04T12:00:00.000Z',
        lastSeenAt: null,
        revokedAt: null as string | null,
      },
    ];
    await mockApi(page, {
      'GET /me': () => ({ body: me }),
      'GET /memory/status': () => ({ body: { memoryAvailable: true, userReady: true, isAdmin: false, computers } }),
      'GET /memory/computers': () => ({ body: { computers } }),
      'PATCH /memory/computers/pc-1': (request) => {
        const { name } = request.postDataJSON() as { name: string };
        computers = computers.map((c) => ({ ...c, name }));
        return { status: 204 };
      },
      'DELETE /memory/computers/pc-1': () => {
        computers = computers.map((c) => ({ ...c, revokedAt: '2026-11-14T12:00:00.000Z' }));
        return { status: 204 };
      },
    });
    await page.goto('/memory/computers');

    await page.getByRole('button', { name: 'Renomear Notebook da Marina' }).click();
    const rename = page.getByRole('dialog', { name: 'Renomear computador' });
    await rename.getByLabel('Nome do computador').fill('PC do laboratório');
    await rename.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('PC do laboratório', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Desconectar PC do laboratório' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Desconectar' }).click();
    await expect(page.getByText('Desconectado', { exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('Meus projetos: criar projeto e convidar uma pessoa', async ({ page }) => {
    const base = { workspace: 'marina-costa', team: false, role: 'owner', source: 'owner', membersCount: 1, sync: 'ok' };
    let projects: Array<Record<string, unknown>> = [];
    let members: Array<Record<string, unknown>> = [];
    const invites: unknown[] = [];
    await mockApi(page, {
      'GET /me': () => ({ body: me }),
      'GET /memory/status': () => ({ body: { memoryAvailable: true, userReady: true, isAdmin: false, computers: [] } }),
      'GET /memory/projects': () => ({ body: { projects } }),
      'POST /memory/projects': (request) => {
        const { name } = request.postDataJSON() as { name: string };
        const created = { ...base, id: 'proj-1', project: 'tcc', title: name };
        projects = [created];
        return { status: 201, body: created };
      },
      'GET /memory/projects/proj-1': () => ({
        body: { ...projects[0], members, marker: 'workspace = "marina-costa"\nproject = "tcc"' },
      }),
      'PUT /memory/projects/proj-1/members/ana.lima%40ufba.br': (request) => {
        invites.push(request.postDataJSON());
        members = [{ email: 'ana.lima@ufba.br', name: null, level: 'write', status: 'pending' }];
        return { status: 204 };
      },
    });
    await page.goto('/memory/projects');

    await expect(page.getByRole('heading', { name: 'Nenhum projeto ainda' })).toBeVisible();
    await page.getByRole('button', { name: 'Novo projeto' }).click();
    const dialog = page.getByRole('dialog', { name: 'Novo projeto' });
    await dialog.getByLabel('Nome do projeto').fill('TCC');
    await dialog.getByRole('button', { name: 'Criar projeto' }).click();

    await expect(page.getByRole('heading', { name: 'TCC', level: 1 })).toBeVisible();
    await expect(page.getByText('Marcador do repositório')).toBeVisible();
    const form = page.getByRole('form', { name: 'Convidar pessoa' });
    await form.getByLabel(/E-mail da pessoa/).fill('ana.lima@ufba.br');
    await form.getByLabel('Nível de acesso').selectOption('write');
    await form.getByRole('button', { name: 'Convidar' }).click();

    await expect(page.getByText('Convite pendente')).toBeVisible();
    expect(invites).toEqual([{ level: 'write' }]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
