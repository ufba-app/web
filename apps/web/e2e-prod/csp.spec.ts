import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { me, mockApi } from '../e2e/support';
import { buildPairUrl, newEphemeral } from '../src/lib/passkey/pairing';

/** A CSP de produção vive no Caddyfile; este teste a lê de lá para não haver duas cópias. */
function productionCsp(): string {
  const caddyfile = readFileSync('Caddyfile', 'utf8');
  const match = caddyfile.match(/Content-Security-Policy\s+"([^"]+)"/);
  if (!match?.[1]) throw new Error('Content-Security-Policy não encontrada no Caddyfile');
  // Em localhost a API fica em :3000; em produção é https://api.ufba.app.
  return match[1].replaceAll('https://api.ufba.app', 'http://localhost:3000');
}

async function withCsp(page: Page, csp: string): Promise<string[]> {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /content security policy/i.test(message.text())) {
      // As fontes embutidas chegam em base64 gigante; só o começo e a diretiva importam.
      violations.push(message.text().replace(/'data:[^']{40,}'/g, "'data:…'").slice(0, 200));
    }
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`Content Security Policy: ${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  await page.route('http://localhost:3001/**', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
  });
  return violations;
}

const apps = [
  { clientId: 'a', domain: 'claude.ai', name: 'Claude', logoUrl: null, verified: true, authorizedAt: '2026-11-04T12:00:00.000Z', lastUsedAt: null, sigaa: true },
];

test('as telas principais não violam a CSP de produção', async ({ page }) => {
  const violations = await withCsp(page, productionCsp());
  await mockApi(page, {
    'GET /me': () => ({ body: me }),
    'GET /authorized-apps': () => ({ body: { apps } }),
  });

  await page.goto('/connections');
  await expect(page.getByText('3 de 3 conectadas')).toBeVisible();
  await page.getByRole('button', { name: 'Abrir menu' }).isVisible();

  await page.goto('/authorized-apps');
  await page.getByRole('button', { name: 'Revogar Claude' }).click();
  await expect(page.getByRole('dialog', { name: 'Revogar o Claude?' })).toBeVisible();

  expect(violations).toEqual([]);
});

test('validar um formulário (react-hook-form + zod) não usa eval e não viola a CSP', async ({ page }) => {
  const violations = await withCsp(page, productionCsp());
  await mockApi(page, {
    'GET /me': () => ({ body: { ...me, connections: { ...me.connections, sigaa: { status: 'disconnected', login: null, passkey: { slots: 0 } } } } }),
  });

  await page.goto('/connections');
  await page.getByRole('button', { name: 'Conectar' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Conectar o SIGAA' });
  await dialog.getByRole('button', { name: 'Conectar' }).click();

  // As mensagens vêm do schema: se o zod tentasse compilar com `new Function`, a CSP bloquearia e nada apareceria.
  await expect(dialog.getByText('Digite o CPF.')).toBeVisible();
  await expect(dialog.getByText('Digite a senha do SIGAA.')).toBeVisible();
  expect(violations).toEqual([]);
});

test('um toast de aviso aparece (e anima) sem violar a CSP de produção', async ({ page }) => {
  const violations = await withCsp(page, productionCsp());
  let connected = false;
  await mockApi(page, {
    'GET /me': () => ({
      body: {
        ...me,
        connections: { ...me.connections, sigaa: connected ? { status: 'connected', login: '52998224725', passkey: { slots: 0 } } : { status: 'disconnected', login: null, passkey: { slots: 0 } } },
      },
    }),
    'POST /connections/sigaa': () => {
      connected = true;
      return { status: 204 };
    },
  });

  await page.goto('/connections');
  await page.getByRole('button', { name: 'Conectar' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Conectar o SIGAA' });
  await dialog.getByLabel('CPF', { exact: true }).fill('52998224725');
  await dialog.getByLabel('Senha do SIGAA').fill('s3nh4-secreta');
  await dialog.getByRole('button', { name: 'Conectar' }).click();

  // O aviso é um toast (região própria), não uma caixa dentro da página.
  await expect(page.getByText('SIGAA conectado.')).toBeVisible();
  await expect(page.locator('main').getByText('SIGAA conectado.')).toHaveCount(0);
  expect(violations).toEqual([]);
});

test('sem sessão, o painel manda para o login no auth sem violar a CSP', async ({ page }) => {
  const violations = await withCsp(page, productionCsp());
  await mockApi(page, { 'GET /me': () => ({ status: 401, body: { error: 'session_expired', message: 'Entre de novo.' } }) });
  // O login é outro app, com a própria CSP (testada em e2e-auth-prod). Aqui só vale o destino.
  await page.route('http://localhost:3002/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>auth</title>' }),
  );
  await page.goto('/connections');
  await expect(page).toHaveURL('http://localhost:3002/sign-in?return=%2Fconnections');
  expect(violations).toEqual([]);
});

test('antes do JavaScript: o painel mostra a sidebar em skeleton, o resto mostra o brasão, sem violar a CSP', async ({
  browser,
  baseURL,
}) => {
  // Sem JavaScript, o que se vê é só o HTML que o servidor devolveu (o Caddy faz esta escolha em produção).
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  const violations = await withCsp(page, productionCsp());

  for (const path of ['/', '/connections', '/connections/moodle/capture', '/authorized-apps']) {
    await page.goto(path);
    await expect(page.locator('.ufba-nav__brand')).toBeVisible();
    await expect(page.locator('.web-sk--nav')).toHaveCount(4);
    await expect(page.locator('.web-sk--title')).toBeVisible();
    // O CSS já está aplicado antes do JS (link no <head>). Sem isto o HTML apareceria cru, sem barras nem moldura.
    await expect(page.locator('.web-sk--nav').first()).toHaveCSS('height', '44px');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(227, 232, 246)'); // fundo da página, #e3e8f6
    await expect(page.locator('.ufba-shell__nav')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    // Genérico: nenhum texto de menu.
    await expect(page.getByRole('link')).toHaveCount(0);
  }

  for (const path of ['/error', '/rota-que-nao-existe']) {
    await page.goto(path);
    await expect(page.locator('.boot__mark')).toBeVisible();
    await expect(page.locator('.ufba-shell')).toHaveCount(0);
  }

  expect(violations).toEqual([]);
  await context.close();
});

test('a CSP bloqueia de verdade: um script inline é recusado', async ({ page }) => {
  const violations = await withCsp(page, productionCsp());
  await mockApi(page, { 'GET /me': () => ({ status: 401, body: { error: 'session_expired', message: 'x' } }) });
  await page.goto('/error');
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.__injected = true';
    document.body.appendChild(script);
  });
  expect(await page.evaluate(() => (window as unknown as { __injected?: boolean }).__injected)).toBeUndefined();
  expect(violations.some((v) => /script-src/.test(v))).toBe(true);
});

test('SIGAA trancado no computador: o QR em SVG, a lista de celulares e a remoção não violam a CSP', async ({ page }, testInfo) => {
  const violations = await withCsp(page, productionCsp());
  const locked = { ...me, connections: { ...me.connections, sigaa: { status: 'locked', login: 'marina.costa', passkey: { slots: 2 } } } };
  const phones = [
    { credentialId: 'cred-1', prfSalt: 'c2FsdA', label: 'iPhone de Marina', createdAt: '2026-11-04T15:00:00.000Z', lastUnlockedAt: null },
    { credentialId: 'cred-2', prfSalt: 'c2FsdA', label: 'Galaxy S23', createdAt: '2026-11-08T15:00:00.000Z', lastUnlockedAt: null },
  ];
  await mockApi(page, {
    'GET /me': () => ({ body: locked }),
    'GET /authorized-apps': () => ({ body: { apps } }),
    'GET /sigaa/passkey': () => ({ body: { passkeys: phones } }),
    'POST /pairings': () => ({ status: 201, body: { id: 'AAECAwQFBgcICQoLDA0ODw', expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() } }),
    'GET /pairings/AAECAwQFBgcICQoLDA0ODw': () => ({ body: { status: 'pending' } }),
  });

  await page.goto('/connections');
  await expect(page.getByRole('img', { name: 'QR para liberar o SIGAA com o celular' })).toBeVisible();
  await expect(page.getByText('Esperando o celular…')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('qr-computador.png'), fullPage: true });

  await page.goto('/authorized-apps');
  await expect(page.getByRole('heading', { name: 'Celulares ativados' })).toBeVisible();
  await page.getByRole('button', { name: 'Remover Galaxy S23' }).click();
  await expect(page.getByRole('dialog', { name: 'Remover Galaxy S23?' })).toBeVisible();
  // Espera a animação do diálogo terminar para a captura mostrar o contraste final.
  await page.waitForTimeout(600);
  await page.screenshot({ path: testInfo.outputPath('lista-celulares.png'), fullPage: true });

  expect(violations).toEqual([]);
});

test('a página /pair (celular) abre pelo fragmento do QR e não viola a CSP', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const violations = await withCsp(page, productionCsp());
  const computer = await newEphemeral();
  const link = new URL(buildPairUrl('http://localhost:3001', 'AAECAwQFBgcICQoLDA0ODw', computer.pub, 'Firefox no Windows'));
  await mockApi(page, {
    'GET /me': () => ({ body: { ...me, connections: { ...me.connections, sigaa: { ...me.connections.sigaa, passkey: { slots: 1 } } } } }),
    'GET /pairings/AAECAwQFBgcICQoLDA0ODw/info': () => ({
      body: { label: 'Firefox no Windows', client: 'Claude', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 4 * 60_000).toISOString(), delivered: false },
    }),
  });

  await page.goto(`${link.pathname}${link.hash}`);
  await expect(page.getByRole('heading', { name: 'Liberar Firefox no Windows?' })).toBeVisible();
  await expect(page.getByText('Só confirme se você acabou de pedir isso.')).toBeVisible();
  // O fragmento (id e chave pública) sai da barra de endereço.
  expect(new URL(page.url()).hash).toBe('');
  await page.screenshot({ path: testInfo.outputPath('pair-confirmar.png'), fullPage: true });

  expect(violations).toEqual([]);
});
