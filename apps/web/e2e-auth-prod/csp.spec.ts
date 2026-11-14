import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { AUTH, authorizeRequest, me, mockApi, WEB } from '../e2e/support';

const caddyfile = readFileSync('Caddyfile.auth', 'utf8');

/** A CSP de produção vive no Caddyfile.auth; este teste a lê de lá para não haver duas cópias. */
function productionCsp(): string {
  const match = caddyfile.match(/Content-Security-Policy\s+"([^"]+)"/);
  if (!match?.[1]) throw new Error('Content-Security-Policy não encontrada no Caddyfile.auth');
  // Em localhost a API fica em :3000; em produção é https://api.ufba.app.
  return match[1].replaceAll('https://api.ufba.app', 'http://localhost:3000');
}

async function withCsp(page: Page, csp: string): Promise<string[]> {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /content security policy/i.test(message.text())) {
      violations.push(message.text().replace(/'data:[^']{40,}'/g, "'data:…'").slice(0, 200));
    }
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`Content Security Policy: ${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  await page.route(`${AUTH}/**`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
  });
  // O painel (outro app) não está de pé: o destino pós-login recebe uma página vazia.
  await page.route(`${WEB}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>painel</title>' }),
  );
  return violations;
}

const signedOut = { status: 401, body: { error: 'session_expired', message: 'Entre de novo.' } };

test('a política do Caddyfile.auth é estrita e só libera a API', () => {
  const csp = productionCsp();
  expect(csp).not.toContain("'unsafe-eval'");
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(csp).not.toMatch(/style-src[^;]*'unsafe-inline'/);
  expect(csp).toContain("script-src 'self';");
  expect(csp).toContain("connect-src 'self' http://localhost:3000;");
  expect(csp).toContain("img-src 'self' http://localhost:3000;");
  expect(csp).toContain("frame-ancestors 'none'");
  // Nada do painel: o auth não fala com mais ninguém.
  expect(csp.match(/https?:\/\/[^\s;]+/g) ?? []).toEqual(['http://localhost:3000', 'http://localhost:3000']);
  // Referrer: o code do login e o id do pedido nunca saem por Referer.
  expect(caddyfile).toMatch(/Referrer-Policy\s+"no-referrer"/);
  expect(caddyfile).toMatch(/@assets path \/assets\/\*\s+header @assets Cache-Control "public, max-age=31536000, immutable"/);
});

test('o login (sem sessão) e o retorno do login não violam a CSP', async ({ page }) => {
  const violations = await withCsp(page, productionCsp());
  await mockApi(page, { 'GET /me': () => signedOut }, AUTH);

  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible();

  await page.goto('/sign-in/callback?code=x&state=forjado');
  await expect(page.getByRole('alert')).toContainText(/não deu para confirmar o login/i);
  expect(violations).toEqual([]);
});

test('autorizar, recusar e as telas de erro não violam a CSP', async ({ page }) => {
  const violations = await withCsp(page, productionCsp());
  await mockApi(
    page,
    {
      'GET /me': () => ({ body: me }),
      'GET /authorize/requests/req-1': () => ({ body: authorizeRequest }),
      'GET /authorize/requests/req-2': () => ({ status: 410, body: { error: 'request_expired', message: 'Expirou.' } }),
    },
    AUTH,
  );

  await page.goto('/authorize?request=req-1');
  await expect(page.getByRole('button', { name: 'Autorizar' })).toBeVisible();

  await page.goto('/authorize?request=req-2');
  await expect(page.getByRole('heading', { name: 'Pedido expirado' })).toBeVisible();

  await page.goto('/authorize/error?error=invalid_redirect&message=Cliente%20desconhecido.');
  await expect(page.getByRole('heading', { name: 'Pedido inválido' })).toBeVisible();

  await page.goto('/rota-que-nao-existe');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  expect(violations).toEqual([]);
});

test('um toast de erro aparece (e anima) sem violar a CSP do auth', async ({ page }) => {
  // O ToastHost (React Aria) é carregado sob demanda e usa estilos próprios: é o que a CSP estrita poderia bloquear.
  const violations = await withCsp(page, productionCsp());
  await mockApi(
    page,
    {
      'GET /me': () => ({ body: me }),
      'GET /authorize/requests/req-1': () => ({ body: authorizeRequest }),
      'POST /authorize/requests/req-1/approve': () => ({
        status: 500,
        body: { error: 'internal_error', message: 'Não deu para responder agora.' },
      }),
    },
    AUTH,
  );

  await page.goto('/authorize?request=req-1');
  await page.getByRole('button', { name: 'Autorizar' }).click();

  await expect(page.getByText('Não deu para responder agora.')).toBeVisible();
  // É um toast (região própria), não uma caixa dentro da página.
  await expect(page.locator('main').getByText('Não deu para responder agora.')).toHaveCount(0);
  expect(violations).toEqual([]);
});

test('validar as respostas da API (zod/mini jitless) não usa eval', async ({ page }) => {
  // O auth valida respostas da API com zod/mini; se ele tentasse compilar com `new Function`, a CSP bloquearia
  // e a tela de autorização não apareceria.
  const violations = await withCsp(page, productionCsp());
  await mockApi(
    page,
    {
      'GET /me': () => ({ body: me }),
      'GET /authorize/requests/req-1': () => ({ body: authorizeRequest }),
    },
    AUTH,
  );
  await page.goto('/authorize?request=req-1');
  await expect(page.getByText('Claude', { exact: true })).toBeVisible();
  expect(violations.filter((v) => /script-src/.test(v))).toEqual([]);
});

test('antes do JavaScript: toda rota do auth mostra só o brasão (sem shell do painel), sem violar a CSP', async ({
  browser,
  baseURL,
}) => {
  // Sem JavaScript, o que se vê é só o HTML que o servidor devolveu (o Caddy devolve o auth.html em qualquer rota).
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  const violations = await withCsp(page, productionCsp());

  for (const path of ['/', '/sign-in', '/sign-in/callback', '/authorize?request=x', '/authorize/error', '/rota-que-nao-existe']) {
    await page.goto(path);
    await expect(page.locator('.boot__mark')).toBeVisible();
    await expect(page.locator('.ufba-shell')).toHaveCount(0);
    await expect(page.locator('.ufba-nav__brand')).toHaveCount(0);
    // O CSS já está aplicado antes do JS (link no <head>): fundo da página, #e3e8f6.
    await expect(page.locator('.boot')).toHaveCSS('background-color', 'rgb(227, 232, 246)');
  }

  expect(violations).toEqual([]);
  await context.close();
});

test('a CSP bloqueia de verdade: um script inline é recusado', async ({ page }) => {
  const violations = await withCsp(page, productionCsp());
  await mockApi(page, { 'GET /me': () => signedOut }, AUTH);
  await page.goto('/sign-in');
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.__injected = true';
    document.body.appendChild(script);
  });
  expect(await page.evaluate(() => (window as unknown as { __injected?: boolean }).__injected)).toBeUndefined();
  expect(violations.some((v) => /script-src/.test(v))).toBe(true);
});
