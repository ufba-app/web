import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { me, mockApi } from '../e2e/support';
import { adminMemorySyncFixture, adminTeamFixture, memoryProjectDetailFixture } from '../src/contract/fixtures';
import { myCalendarFixture } from '../src/contract/panelFixture';
import { trajectoryCurriculumFixture } from '../src/contract/trajectoryFixture';
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

/** Quem tem acesso ao SIASB (`offered`): só essa pessoa vê avisos do SIASB. */
const meWithSiasb = { ...me, connections: { ...me.connections, siasb: { ...me.connections.siasb, offered: true } } };

const apps = [
  { clientId: 'a', domain: 'claude.ai', name: 'Claude', logoUrl: null, verified: true, authorizedAt: '2026-11-04T12:00:00.000Z', lastUsedAt: null, sigaa: true, permissions: [] },
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
    'POST /pairings': () => ({ status: 201, body: { id: 'AAECAwQFBgcICQoLDA0ODw', expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() } }),
    'GET /pairings/AAECAwQFBgcICQoLDA0ODw': () => ({ body: { status: 'pending' } }),
  });

  await page.goto('/connections');
  await page.getByRole('button', { name: 'digite a senha do SIGAA' }).click();
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
    // Conectado, a pessoa vai direto para a vida acadêmica.
    'GET /me/academic': () => ({
      body: { available: true, consent: false, status: 'NONE', failure: null, verified: null, reader: null, importedAt: null, curriculumStatus: 'NONE', registration: null, summary: null, draft: null },
    }),
    'POST /pairings': () => ({ status: 201, body: { id: 'AAECAwQFBgcICQoLDA0ODw', expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() } }),
    'GET /pairings/AAECAwQFBgcICQoLDA0ODw': () => ({ body: { status: 'pending' } }),
  });

  await page.goto('/connections');
  await page.getByRole('button', { name: 'digite a senha do SIGAA' }).click();
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
      body: { label: 'Notebook da Marina', client: 'Claude', seenBrowser: 'Firefox', seenOs: 'Windows', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 4 * 60_000).toISOString(), delivered: false },
    }),
  });

  await page.goto(`${link.pathname}${link.hash}`);
  await expect(page.getByRole('heading', { name: 'Liberar o SIGAA no computador?' })).toBeVisible();
  await expect(page.getByText('Firefox no Windows')).toBeVisible();
  await expect(page.getByText('Só confirme se você acabou de pedir isso.')).toBeVisible();
  // O fragmento (id e chave pública) sai da barra de endereço.
  expect(new URL(page.url()).hash).toBe('');
  await page.screenshot({ path: testInfo.outputPath('pair-confirmar.png'), fullPage: true });

  expect(violations).toEqual([]);
});

/**
 * Altura de campo de uma linha (alvo de toque de 44 px). Os testes de unidade rodam em jsdom, que NÃO calcula layout:
 * foi assim que a busca da Administração passou a medir 240 px em produção sem nenhum teste acusar. Aqui o navegador é de
 * verdade e o CSS é o do build de produção, então a altura é medida.
 */
async function expectOneLineField(field: Locator): Promise<void> {
  await expect(field).toBeVisible();
  const box = await field.boundingBox();
  expect(box, 'campo sem caixa na tela').not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(40);
  expect(box!.height).toBeLessThanOrEqual(64);
}

test('Administração da memória: o campo de busca tem a altura de uma linha (não estica) e a tela não viola a CSP', async ({ page }, testInfo) => {
  const violations = await withCsp(page, productionCsp());
  await mockApi(page, {
    'GET /me': () => ({ body: me }),
    'GET /memory/status': () => ({ body: { memoryAvailable: true, userReady: true, isAdmin: true, computers: [] } }),
    'GET /admin/team': () => ({ body: adminTeamFixture() }),
    'GET /admin/memory/sync': () => ({ body: adminMemorySyncFixture() }),
  });

  await page.goto('/memory/admin');
  await expect(page.getByRole('heading', { name: 'Adicionar mantenedor' })).toBeVisible();
  const search = page.getByLabel('Buscar por nome ou e-mail');
  await expectOneLineField(search);
  // A dica fica logo abaixo do campo, sem um buraco no meio (o defeito empurrava a dica 200 px para baixo).
  const box = (await search.boundingBox())!;
  const hint = (await page.getByText('Digite ao menos 2 letras.').boundingBox())!;
  expect(hint.y - (box.y + box.height)).toBeLessThan(40);
  await page.screenshot({ path: testInfo.outputPath('admin-busca.png'), fullPage: true });

  expect(violations).toEqual([]);
});

test('SIASB: o cartão, o diálogo de senha, a conexão e o ícone não violam a CSP de produção', async ({ page }, testInfo) => {
  const violations = await withCsp(page, productionCsp());
  let siasb: Record<string, unknown> = { offered: true, status: 'disconnected', expiresAt: null, syncedAt: null };
  const posts: unknown[] = [];
  await mockApi(page, {
    'GET /me': () => ({ body: { ...me, connections: { ...me.connections, siasb } } }),
    'POST /connections/siasb': (request) => {
      posts.push(request.postDataJSON());
      siasb = { offered: true, status: 'connected', expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), syncedAt: null };
      return { status: 204 };
    },
  });

  await page.goto('/connections');
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'SIASB', level: 3 }) });
  await expect(card).toBeVisible();
  // O ícone é um arquivo do próprio painel (img-src 'self'): se a CSP o bloqueasse, o teste acusaria a violação.
  await expect(card.locator('img')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('siasb-cartao.png'), fullPage: true });

  await card.getByRole('button', { name: 'Conectar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Conectar o SIASB' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Senha do SIASB').fill('s3nh4-do-siasb');
  await page.waitForTimeout(600);
  await page.screenshot({ path: testInfo.outputPath('siasb-dialogo.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Conectar' }).click();

  await expect(page.getByRole('dialog', { name: 'SIASB conectado' })).toBeVisible();
  expect(posts).toEqual([{ password: 's3nh4-do-siasb' }]);
  expect(await page.content()).not.toContain('s3nh4-do-siasb');
  await page.getByRole('button', { name: 'Concluir' }).click();
  // Faltando 5 dias: a faixa de vencimento (a partir de 7). O selo e a descrição dizem "vence em 5 dias": `exact`
  // pega só o selo (sem ele a busca, que ignora maiúsculas, casa com os dois).
  await expect(card.getByText('Vence em 5 dias', { exact: true })).toBeVisible();
  await expect(card.getByText('Seu acesso ao SIASB vence em 5 dias.', { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('siasb-vence.png'), fullPage: true });

  expect(violations).toEqual([]);
});

test('Apagar projeto: o campo de confirmar tem a altura de uma linha (não estica)', async ({ page }, testInfo) => {
  const violations = await withCsp(page, productionCsp());
  await mockApi(page, {
    'GET /me': () => ({ body: me }),
    'GET /memory/projects/proj-1': () => ({ body: memoryProjectDetailFixture({ id: 'proj-1', title: 'TCC', role: 'owner' }) }),
  });

  await page.goto('/memory/projects/proj-1');
  await page.getByRole('button', { name: 'Apagar projeto' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Apagar projeto?' });
  await expect(dialog).toBeVisible();
  await expectOneLineField(dialog.getByLabel(/Para confirmar, digite o título do projeto/));
  await page.waitForTimeout(600);
  await page.screenshot({ path: testInfo.outputPath('apagar-projeto.png'), fullPage: true });

  expect(violations).toEqual([]);
});

const hoursOf = (required: number, completed: number) => ({ required, completed, pending: required - completed });
const needOf = (needed: number, completed: number) => ({ needed, completed, remaining: needed - completed, source: 'estimate' });
const component = (code: string, name: string, state: string, extra: Record<string, unknown> = {}) => ({
  code,
  name,
  hours: 68,
  nature: 'REQUIRED',
  term: 4,
  state,
  via: [],
  missingPrerequisites: [],
  prerequisiteUnverifiable: false,
  prerequisiteExpr: null,
  corequisiteExpr: null,
  equivalenceExpr: null,
  responsibleUnit: null,
  late: false,
  lastAttempt: null,
  toRedo: false,
  ...extra,
});

test('vida acadêmica: convite, resumo, grade e configurações não violam a CSP (desktop e celular)', async ({ page }, testInfo) => {
  const violations = await withCsp(page, productionCsp());
  let state: Record<string, unknown> = {
    available: true,
    consent: false,
    status: 'NONE',
    failure: null,
    verified: null,
    reader: null,
    importedAt: null,
    curriculumStatus: 'NONE',
    registration: null,
    summary: null,
    draft: null,
  };
  await mockApi(page, {
    'GET /me': () => ({ body: me }),
    'GET /me/academic': () => ({ body: state }),
    'GET /me/academic/curriculum': () => ({
      body: {
        curriculumCode: '2019.1',
        sameCurriculum: true,
        estimate: true,
        required: [
          component('ODO101', 'Anatomia Geral', 'DONE', { term: 1 }),
          component('ODO402', 'Dentística II', 'BLOCKED', { missingPrerequisites: ['Materiais Dentários'], prerequisiteExpr: 'Dentística I e Materiais Dentários' }),
          component('ODO503', 'Cirurgia Oral I', 'AVAILABLE', { term: 5 }),
        ],
        electives: [component('OPT110', 'Odontologia do Esporte', 'AVAILABLE', { hours: 34, nature: 'ELECTIVE', term: null })],
        complementary: [component('COMP1', 'Monitoria de Anatomia', 'DONE', { hours: 60, nature: 'COMPLEMENTARY', term: null })],
        hours: { required: needOf(2800, 1700), elective: needOf(300, 120), complementary: needOf(200, 80), total: needOf(3300, 1900) },
        percentComplete: 58,
        requiredHoursToTake: 1100,
        currentTerm: 6,
        terms: { min: 10, avg: 11, max: 15 },
        prerequisiteEdges: [],
        divergences: { obsoletePending: [], substitutedPending: [], satisfiedByAdequation: [], newInCurriculum: [] },
      },
    }),
  });

  // Convite e consentimento (ainda sem importar).
  await page.goto('/academic');
  await expect(page.getByRole('heading', { name: 'Quer ver sua vida acadêmica aqui?' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('va-convite.png'), fullPage: true });

  // Depois de importar: resumo, grade e configurações.
  state = {
    ...state,
    consent: true,
    status: 'READY',
    verified: true,
    reader: 'ai',
    importedAt: '2026-11-12T17:32:00.000Z',
    curriculumStatus: 'READY',
    registration: '222115043',
    summary: {
      programName: 'Odontologia',
      curriculum: '2019.1',
      currentTerm: 6,
      completionDeadline: { standard: '10 semestres', maximum: '15 semestres' },
      indices: { cr: 7.8, iap: 0.81 },
      hours: { mandatory: hoursOf(2800, 1700), elective: hoursOf(300, 120), complementary: hoursOf(200, 80), total: hoursOf(3300, 1900) },
    },
  };
  await page.goto('/academic');
  await expect(page.getByRole('heading', { name: 'Odontologia' })).toBeVisible();
  await expect(page.getByText('58%')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('va-resumo.png'), fullPage: true });

  await page.goto('/academic/curriculum?view=list');
  await expect(page.getByRole('heading', { name: 'Optativas' })).toBeVisible();
  await page.getByRole('button', { name: /ODO402/ }).click();
  await expect(page.getByRole('dialog', { name: /Dentística II/ })).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: testInfo.outputPath('va-grade-detalhe.png'), fullPage: true });

  await page.goto('/academic/settings');
  await expect(page.getByRole('heading', { name: 'Sua importação' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('va-config.png'), fullPage: true });

  // Celular (390 px): o mesmo conteúdo, sem rolagem horizontal.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/academic');
  await expect(page.getByRole('heading', { name: 'Odontologia' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('va-resumo-celular.png'), fullPage: true });
  await page.goto('/academic/curriculum?view=list');
  await expect(page.getByRole('heading', { name: 'Optativas' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('va-grade-celular.png'), fullPage: true });

  expect(violations).toEqual([]);
});

test('o service worker de avisos registra sob a CSP de produção e não intercepta nem cacheia nada', async ({ page }) => {
  const violations = await withCsp(page, productionCsp());
  await mockApi(page, { 'GET /me': () => ({ body: me }) });
  await page.goto('/connections');
  await expect(page.getByText('3 de 3 conectadas')).toBeVisible();
  // Antes de ativar os avisos o worker NÃO existe: o painel nunca o registra sozinho.
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);

  const result = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    const ready = await navigator.serviceWorker.ready;
    return { scope: registration.scope, scriptURL: ready.active?.scriptURL ?? null };
  });
  expect(result.scope).toBe('http://localhost:3001/');
  expect(result.scriptURL).toBe('http://localhost:3001/sw.js');

  // O arquivo é servido sem cache (o navegador precisa ver a versão nova) e como JavaScript.
  const response = await page.request.get('/sw.js');
  expect(response.headers()['cache-control']).toBe('no-cache');
  expect(response.headers()['content-type']).toMatch(/javascript/);
  // O ícone do aviso (PNG, o sistema não aceita SVG) é servido.
  const icon = await page.request.get('/icons/icon-192.png');
  expect(icon.status()).toBe(200);
  expect(icon.headers()['content-type']).toMatch(/image\/png/);

  // Sem handler de fetch: a navegação e a API seguem pelo navegador, e nada vai para o Cache Storage.
  await page.reload();
  await expect(page.getByText('3 de 3 conectadas')).toBeVisible();
  expect(await page.evaluate(async () => (await caches.keys()).length)).toBe(0);
  expect(violations).toEqual([]);
});

test('avisos: tipos com interruptor, aparelhos com Enviar teste e Remover, sem rolagem horizontal e sem violar a CSP', async ({ page }, testInfo) => {
  const violations = await withCsp(page, productionCsp());
  let settings = [
    {
      key: 'siasb.alerts',
      source: 'siasb',
      title: 'Avisos do SIASB',
      description: 'Avisar quando faltar paciente ou sessão marcada na clínica e quando o acesso ao SIASB estiver para vencer.',
      enabled: true,
    },
  ];
  let devices = [
    { id: 'dev-1', label: 'Chrome no Windows', createdAt: '2026-11-10T12:00:00.000Z', lastSuccessAt: '2026-11-14T15:30:00.000Z' },
    { id: 'dev-2', label: null, createdAt: '2026-11-11T12:00:00.000Z', lastSuccessAt: null },
  ];
  const calls: string[] = [];
  await mockApi(page, {
    'GET /me': () => ({ body: meWithSiasb }),
    'GET /me/notification-settings': () => ({ body: { items: settings } }),
    'PUT /me/notification-settings/siasb.alerts': (request) => {
      calls.push(`PUT ${JSON.stringify(request.postDataJSON())}`);
      settings = settings.map((item) => ({ ...item, enabled: (request.postDataJSON() as { enabled: boolean }).enabled }));
      return { status: 204 };
    },
    'GET /me/push-devices': () => ({ body: { items: devices } }),
    'POST /me/push-devices/dev-1/test': () => {
      calls.push('TEST dev-1');
      return { status: 204 };
    },
    'DELETE /me/push-devices/dev-2': () => {
      calls.push('DELETE dev-2');
      devices = devices.filter((device) => device.id !== 'dev-2');
      return { status: 204 };
    },
  });

  await page.goto('/connections');
  await expect(page.getByRole('heading', { name: 'Avisos' })).toBeVisible();
  const switchAvisos = page.getByRole('switch', { name: 'Avisos do SIASB' });
  await expect(switchAvisos).toBeChecked();
  await expect(page.getByText('Chrome no Windows')).toBeVisible();
  await expect(page.getByText('Aparelho sem nome')).toBeVisible();
  // Nenhum aparelho é "este": o botão de ativar aparece quando o navegador deixa (aqui o headless nega a permissão).
  await page.screenshot({ path: testInfo.outputPath('avisos.png'), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole('button', { name: 'Enviar teste para Chrome no Windows' }).click();
  await page.getByRole('button', { name: 'Remover o aparelho sem nome' }).click();
  await expect(page.getByText('Aparelho sem nome')).toBeHidden();
  await switchAvisos.click({ force: true });
  await expect(switchAvisos).not.toBeChecked();
  expect(calls).toEqual(['TEST dev-1', 'DELETE dev-2', 'PUT {"enabled":false}']);

  expect(violations).toEqual([]);
});

test('a aba do "Abrir o SIGAA já logado" (/opening.html) mostra o brasão piscando enquanto pede o link, sem violar a CSP', async ({ page }) => {
  const violations = await withCsp(page, productionCsp());
  // A API demora de propósito: dá tempo de ver o brasão piscando (a página já roda JavaScript, e o script é uma
  // entrada do Vite servida de 'self': sem inline, sem afrouxar a CSP).
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  await mockApi(page, {
    'POST /connections/sigaa/launch': async () => {
      await gate;
      return { status: 409, body: { error: 'source_not_connected', message: 'x' } };
    },
  });
  const response = await page.goto('/opening.html');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Abrindo o SIGAA');
  await expect(page.getByRole('status')).toContainText('Abrindo o SIGAA');
  const mark = page.locator('.boot__mark');
  await expect(mark).toBeVisible();
  expect(await mark.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  expect(await mark.evaluate((img) => getComputedStyle(img).animationName)).toBe('boot-pulse');

  release();
  // O erro aparece NA aba, com os botões de voltar e de fechar, e o brasão sai.
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Libere o SIGAA neste navegador antes de abri-lo.');
  await expect(alert.getByRole('button', { name: 'Voltar ao painel' })).toBeVisible();
  await expect(alert.getByRole('button', { name: 'Fechar esta aba' })).toBeVisible();
  await expect(mark).toHaveCount(0);
  expect(violations).toEqual([]);
});

test('a aba do "Abrir o SIGAA já logado" segue para a URL da API como NAVEGAÇÃO (document), nunca por fetch, sob a CSP de produção', async ({ page }) => {
  const violations = await withCsp(page, productionCsp());
  const launchUrl = 'http://localhost:3000/sigaa/launch?t=token-de-uso-unico';
  let posts = 0;
  await mockApi(page, {
    'POST /connections/sigaa/launch': (request) => {
      posts += 1;
      expect(request.headers()['x-ufba']).toBe('1');
      return { body: { launchUrl } };
    },
  });
  // A página da API (o SIGAA de verdade não é tocado). Registrada DEPOIS do mockApi para valer no lugar dele.
  await page.route('http://localhost:3000/sigaa/launch**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>SIGAA</title><p>aberto</p>' }),
  );
  const kinds: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/sigaa/launch') kinds.push(request.resourceType());
  });

  await page.goto('/opening.html');
  await page.waitForURL(launchUrl);
  expect(posts).toBe(1);
  expect(kinds.length).toBeGreaterThan(0);
  expect(kinds.every((kind) => kind === 'document')).toBe(true);
  expect(violations).toEqual([]);
});

test('Trajetória: o mapa (cartões, linhas, caminho completo, rolagem no celular) com a CSP de produção', async ({ page }, testInfo) => {
  const violations = await withCsp(page, productionCsp());
  const state = {
    available: true,
    consent: true,
    status: 'READY',
    failure: null,
    verified: true,
    reader: 'ai',
    importedAt: '2026-11-12T17:32:00.000Z',
    curriculumStatus: 'READY',
    registration: null,
    summary: {
      programName: 'Engenharia de Computação',
      curriculum: '2017.1',
      currentTerm: 5,
      completionDeadline: { standard: '10 semestres', maximum: '15 semestres' },
      indices: { cr: 7.8, iap: 0.81 },
      hours: {
        mandatory: { required: 2800, completed: 1700, pending: 1100 },
        elective: { required: 300, completed: 120, pending: 180 },
        complementary: { required: 200, completed: 80, pending: 120 },
        total: { required: 3300, completed: 1900, pending: 1400 },
      },
    },
    draft: null,
  };
  await mockApi(page, {
    'GET /me': () => ({ body: me }),
    'GET /me/academic': () => ({ body: state }),
    'GET /me/academic/curriculum': () => ({ body: trajectoryCurriculumFixture() }),
  });

  await page.goto('/academic/curriculum');
  await expect(page.getByRole('link', { name: 'Trajetória' })).toBeVisible();
  const map = page.getByRole('region', { name: 'Mapa de disciplinas por semestre' });
  await expect(map).toBeVisible();
  // Os cartões têm o tamanho do desenho (140 × 64): as posições vêm de `style` (CSSOM), que a CSP estrita permite.
  const so = page.getByRole('button', { name: /^MATA58,/ });
  const box = await so.boundingBox();
  expect(Math.round(box!.width)).toBe(140);
  expect(Math.round(box!.height)).toBe(64);
  // Semestres mais novos ficam mais à direita.
  const before = await page.getByRole('button', { name: /^ENGC50,/ }).boundingBox();
  expect(box!.x).toBeGreaterThan(before!.x);
  // Sem escolher nada: ligações claras do semestre atual.
  expect(await page.locator('.tj-ln--soft').count()).toBeGreaterThan(0);
  expect(await page.locator('.tj-ln--strong').count()).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('mapa-inicio.png'), fullPage: true });

  // Escolher uma disciplina: caminho completo, o resto apagado.
  await so.click();
  await expect(so).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.tj-ln--strong').count()).toBeGreaterThan(0);
  expect(await page.locator('.tj-ln--soft').count()).toBe(0);
  const dimmed = await page.getByRole('button', { name: /^ENGC32,/ }).evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(dimmed)).toBeCloseTo(0.42, 2);
  await expect(page.getByRole('heading', { name: 'Sistemas Operacionais' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mapa-escolhida.png'), fullPage: true });

  // Reprovada/trancada: "a refazer", em vermelho (cor de erro), nunca como livre.
  await page.getByRole('button', { name: /^ENGC24,/ }).click();
  await expect(page.getByText('Última tentativa: trancado em 2025.1.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mapa-refazer.png'), fullPage: true });

  // Celular (390 px): o mapa mantém a largura e rola para os lados; a página não.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/academic/curriculum');
  await expect(map).toBeVisible();
  await expect(page.getByText('Arraste o mapa para os lados')).toBeVisible();
  const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(pageOverflow).toBeLessThanOrEqual(0);
  const scroll = await map.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(scroll.scrollWidth).toBeGreaterThan(scroll.clientWidth);
  await page.screenshot({ path: testInfo.outputPath('mapa-celular.png'), fullPage: true });
  await map.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await page.getByRole('button', { name: /^MATA59,/ }).click();
  await expect(page.getByRole('heading', { name: 'Sistemas Distribuídos' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mapa-celular-escolhida.png'), fullPage: true });

  // Lista: a outra visão.
  await page.getByRole('link', { name: 'Lista' }).click();
  await expect(page.getByRole('heading', { name: 'Optativas' })).toBeVisible();

  expect(violations).toEqual([]);
});

test('quem não tem acesso ao SIASB não vê os avisos do SIASB em Conexões, mesmo com a API listando', async ({ page }) => {
  const violations = await withCsp(page, productionCsp());
  await mockApi(page, {
    'GET /me': () => ({ body: me }), // siasb.offered = false
    'GET /me/notification-settings': () => ({
      body: { items: [{ key: 'siasb.alerts', source: 'siasb', title: 'Avisos do SIASB', description: 'Avisar quando faltar paciente.', enabled: true }] },
    }),
    'GET /me/push-devices': () => ({ body: { items: [] } }),
  });
  await page.goto('/connections');
  await expect(page.getByText('3 de 3 conectadas')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Avisos' })).toBeHidden();
  await expect(page.getByText('Avisos do SIASB')).toBeHidden();
  expect(violations).toEqual([]);
});

test('Apps autorizados com as permissões de cada app: "Autorizado com", Retirar e o layout do cartão, sob a CSP de produção', async ({ page }, testInfo) => {
  const violations = await withCsp(page, productionCsp());
  let permissions = [
    { key: 'siasb.schedule_write', source: 'siasb', title: 'Agendar e desmarcar sessões pelo app', description: 'Permite que o app marque e desmarque sessões da clínica no SIASB em seu nome.', risk: 'low' },
    { key: 'siasb.procedures_write', source: 'siasb', title: 'Lançar e excluir procedimentos pelo app', description: 'Permite que o app inclua e exclua procedimentos previstos nos seus atendimentos do SIASB.', risk: 'high' },
  ];
  const deletes: string[] = [];
  await mockApi(page, {
    'GET /me': () => ({ body: me }),
    'GET /authorized-apps': () => ({
      body: {
        apps: [
          { ...apps[0]!, clientId: 'client-1', permissions },
          { ...apps[0]!, clientId: 'client-2', name: 'Assistente de Estudos', domain: 'estudos.exemplo.com', verified: false, permissions: [] },
        ],
      },
    }),
    'DELETE /authorized-apps/client-1/permissions/siasb.procedures_write': () => {
      deletes.push('siasb.procedures_write');
      permissions = permissions.filter((permission) => permission.key !== 'siasb.procedures_write');
      return { status: 204 };
    },
  });

  await page.goto('/authorized-apps');
  const list = page.getByRole('list', { name: 'Permissões liberadas para Claude' });
  await expect(list).toBeVisible();
  // As permissões ficam DENTRO do cartão do app (a largura toda), sem estourar para os lados.
  const card = page.getByRole('article').filter({ hasText: 'Claude' }).first();
  const cardBox = await card.boundingBox();
  const listBox = await list.boundingBox();
  expect(listBox!.x).toBeGreaterThanOrEqual(cardBox!.x);
  expect(listBox!.x + listBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
  await page.screenshot({ path: testInfo.outputPath('apps-permissoes.png'), fullPage: true });

  await page.getByRole('button', { name: 'Retirar: Lançar e excluir procedimentos pelo app, de Claude' }).click();
  await expect(page.getByText('Lançar e excluir procedimentos pelo app')).toBeHidden();
  expect(deletes).toEqual(['siasb.procedures_write']);

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('apps-permissoes-celular.png'), fullPage: true });

  expect(violations).toEqual([]);
});

test('Painel: calendário do mês e da semana, dia escolhido, sessão da clínica e celular, com a CSP de produção', async ({ page }, testInfo) => {
  const violations = await withCsp(page, productionCsp());
  // "Hoje" fixo no domingo 15/11/2026 (12:00 em Salvador): o relógio do navegador.
  await page.clock.setFixedTime(new Date('2026-11-15T15:00:00.000Z'));
  const asked: string[] = [];
  const meSiasb = { ...me, connections: { ...me.connections, siasb: { ...me.connections.siasb, offered: true, status: 'connected', expiresAt: null, syncedAt: null } } };
  await mockApi(page, {
    'GET /me': () => ({ body: meSiasb }),
    'GET /me/calendar': (request) => {
      const url = new URL(request.url());
      const from = url.searchParams.get('from') ?? '';
      const to = url.searchParams.get('to') ?? '';
      asked.push(`${from}..${to}`);
      return { body: myCalendarFixture({ from, to }) };
    },
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Novembro/ })).toBeVisible();
  expect(asked[0]).toBe('2026-11-01..2026-12-05');
  // No computador: os cartõezinhos do dia aparecem e os pontos ficam escondidos.
  await expect(page.locator('.pn-ch').first()).toBeVisible();
  await expect(page.locator('.pn-pts').first()).toBeHidden();
  // Os dias da grade são botões do tamanho de uma célula do calendário (7 colunas), não esticados nem espremidos.
  const cell = await page.getByRole('button', { name: /^17 de novembro/ }).boundingBox();
  expect(cell!.width).toBeGreaterThan(90);
  expect(cell!.height).toBeGreaterThanOrEqual(100);
  await page.screenshot({ path: testInfo.outputPath('painel-mes.png'), fullPage: true });

  await page.getByRole('button', { name: /^17 de novembro/ }).click();
  const detail = page.getByRole('region', { name: 'Terça, 17 de novembro' });
  await expect(detail.getByText('Histologia')).toBeVisible();
  // Prova e prazo do SIGAA: legenda, selo, ícone e hora (00:00 vira 'Sem hora marcada'); valem também no feriado.
  await expect(page.locator('.pn-legenda')).toContainText('Prova');
  await expect(page.locator('.pn-legenda')).toContainText('Prazo');
  await page.getByRole('button', { name: /^18 de novembro/ }).click();
  await expect(page.getByRole('region', { name: 'Quarta, 18 de novembro' }).locator('.pn-selo--exam')).toHaveText('Prova');
  await page.getByRole('button', { name: /^20 de novembro/ }).click();
  const feriado = page.getByRole('region', { name: 'Sexta, 20 de novembro' });
  await expect(feriado.locator('.pn-selo--deadline')).toHaveText('Prazo');
  await expect(feriado.locator('.pn-selo--holiday')).toHaveText('Sem aula');
  await expect(feriado.locator('.pn-ev__fonte--deadline svg')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('painel-prazo-feriado.png'), fullPage: true });
  await page.getByRole('button', { name: /^25 de novembro/ }).click();
  await expect(page.getByRole('region', { name: 'Quarta, 25 de novembro' })).toContainText('Sem hora marcada');
  await page.screenshot({ path: testInfo.outputPath('painel-dia.png'), fullPage: true });

  // A sessão da clínica (SIASB) aparece com o ícone do próprio painel e o selo "Clínica".
  await page.getByRole('button', { name: /^12 de novembro/ }).click();
  const clinic = page.getByRole('region', { name: 'Quinta, 12 de novembro' });
  await expect(clinic.getByText('Sessão na clínica')).toBeVisible();
  await expect(clinic.getByTitle('SIASB').locator('img')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('painel-clinica.png'), fullPage: true });

  await page.getByRole('button', { name: 'Semana' }).click();
  await expect.poll(() => asked).toContain('2026-11-08..2026-11-14');
  await page.screenshot({ path: testInfo.outputPath('painel-semana.png'), fullPage: true });

  // Celular (390 px): pontos no lugar dos cartõezinhos, sem rolagem horizontal da página.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Mês' }).click();
  await expect(page.locator('.pn-pts i').first()).toBeVisible();
  await expect(page.locator('.pn-ch').first()).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('painel-mes-celular.png'), fullPage: true });
  await page.getByRole('button', { name: 'Semana' }).click();
  await page.screenshot({ path: testInfo.outputPath('painel-semana-celular.png'), fullPage: true });

  expect(violations).toEqual([]);
});

test('Painel: o skeleton do calendário usa o azul do fundo da página (não o cinza das superfícies brancas)', async ({ page }, testInfo) => {
  const violations = await withCsp(page, productionCsp());
  await page.clock.setFixedTime(new Date('2026-11-15T15:00:00.000Z'));
  await mockApi(page, { 'GET /me': () => ({ body: me }) });
  // O calendário nunca chega: fica o skeleton.
  await page.route('**/me/calendar*', () => {});
  await page.goto('/');
  const skeleton = page.locator('.pn-cal--sk');
  await expect(skeleton).toBeVisible();
  // #c9d1ea: a mesma cor dos cartões de página (PageSkeleton); o cinza claro #e8eaf0 é só sobre branco.
  await expect(skeleton).toHaveCSS('background-color', 'rgb(201, 209, 234)');
  await page.screenshot({ path: testInfo.outputPath('painel-skeleton.png'), fullPage: true });
  expect(violations).toEqual([]);
});
