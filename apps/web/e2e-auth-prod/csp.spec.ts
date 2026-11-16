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

test('autorizar com permissões do SIASB: grupo, interruptores, confirmação de risco alto e ícone, sob a CSP de produção', async ({ page }, testInfo) => {
  const violations = await withCsp(page, productionCsp());
  const offered = (available: boolean) => [
    {
      key: 'siasb.schedule_write',
      source: 'siasb',
      title: 'Agendar e desmarcar sessões pelo Claude',
      description: 'Permite que o Claude marque e desmarque sessões da clínica no SIASB em seu nome. Cada ação pede a sua confirmação antes de ser feita.',
      risk: 'low',
      available,
      unavailableReason: available ? null : 'source_not_connected',
    },
    {
      key: 'siasb.procedures_write',
      source: 'siasb',
      title: 'Lançar e excluir procedimentos pelo Claude',
      description: 'Permite que o Claude inclua e exclua procedimentos previstos nos seus atendimentos do SIASB, que ficam no prontuário.',
      risk: 'high',
      available,
      unavailableReason: available ? null : 'source_not_connected',
    },
  ];
  let connected = true;
  let approved: unknown;
  await mockApi(
    page,
    {
      'GET /me': () => ({ body: me }),
      'GET /authorize/requests/req-1': () => ({
        body: {
          ...authorizeRequest,
          sources: [...authorizeRequest.sources, { source: 'siasb', status: connected ? 'connected' : 'disconnected' }],
          permissions: offered(connected),
        },
      }),
      'POST /authorize/requests/req-1/approve': (request) => {
        approved = request.postDataJSON();
        return { body: { redirectTo: `${WEB}/landed?code=abc&state=xyz` } };
      },
    },
    AUTH,
  );

  await page.goto('/authorize?request=req-1');
  const group = page.getByRole('group', { name: 'Permissões do SIASB' });
  await expect(group).toBeVisible();
  // O ícone do SIASB é um arquivo do próprio auth (img-src 'self', sem data:): se a CSP o bloqueasse, acusaria aqui.
  const icon = page.getByRole('listitem', { name: /SIASB: Conectado/ }).locator('img');
  await expect(icon).toBeVisible();
  expect(await icon.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('autorizar-permissoes.png'), fullPage: true });

  await group.getByRole('switch', { name: 'Agendar e desmarcar sessões pelo Claude' }).click({ force: true });
  await expect(page.getByText(/Este app poderá agir em seu nome no SIASB/)).toBeVisible();
  await group.getByRole('switch', { name: 'Lançar e excluir procedimentos pelo Claude' }).click({ force: true });
  const confirm = page.getByRole('group', { name: /Confirmar: Lançar e excluir/ });
  await expect(confirm).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('autorizar-confirmar.png'), fullPage: true });
  await confirm.getByRole('button', { name: 'Ligar' }).click();
  await expect(group.getByRole('switch', { name: 'Lançar e excluir procedimentos pelo Claude' })).toBeChecked();

  // Celular (390 px): o mesmo, sem rolagem horizontal.
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('autorizar-permissoes-celular.png'), fullPage: true });

  await page.getByRole('button', { name: 'Autorizar' }).click();
  await page.waitForURL(`${WEB}/landed?code=abc&state=xyz`);
  expect((approved as { permissions: string[] }).permissions.sort()).toEqual(['siasb.procedures_write', 'siasb.schedule_write']);

  // SIASB não conectado: só a nota e o caminho para conectar.
  connected = false;
  await page.goto('/authorize?request=req-1');
  await expect(page.getByText(/Conecte o SIASB para o app poder usar estas permissões/)).toBeVisible();
  await expect(page.getByRole('switch')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('autorizar-siasb-desconectado.png'), fullPage: true });

  expect(violations).toEqual([]);
});
