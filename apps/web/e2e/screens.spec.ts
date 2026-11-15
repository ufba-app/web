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
    });
    await page.goto('/connections');

    await page.getByRole('button', { name: 'Conectar' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Conectar o SIGAA' });
    await dialog.getByLabel('CPF', { exact: true }).fill('52998224725');
    await dialog.getByLabel('Senha do SIGAA').fill('s3nh4-secreta');
    await dialog.getByRole('button', { name: 'Conectar' }).click();

    await expect(page.getByText('SIGAA conectado.')).toBeVisible();
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
});
