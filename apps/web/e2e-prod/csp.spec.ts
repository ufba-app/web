import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { me, mockApi } from '../e2e/support';
import { adminMemorySyncFixture, adminTeamFixture, memoryProjectDetailFixture } from '../src/contract/fixtures';
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

test('permissões por fonte: a lista de interruptores, a confirmação de risco alto e o PUT não violam a CSP', async ({ page }, testInfo) => {
  const violations = await withCsp(page, productionCsp());
  const items = [
    {
      key: 'siasb.schedule_write',
      source: 'siasb',
      title: 'Agendar e desmarcar sessões pelo Claude',
      description: 'Permite que o Claude marque e desmarque sessões da clínica no SIASB em seu nome. Cada ação pede a sua confirmação antes de ser feita.',
      risk: 'low',
      enabled: true,
      available: true,
      unavailableReason: null,
    },
    {
      key: 'siasb.procedures_write',
      source: 'siasb',
      title: 'Lançar e excluir procedimentos pelo Claude',
      description: 'Permite que o Claude inclua e exclua procedimentos previstos nos seus atendimentos do SIASB, que ficam no prontuário. Cada ação pede a sua confirmação. Procedimentos realizados continuam sendo feitos por você no site.',
      risk: 'high',
      enabled: false,
      available: true,
      unavailableReason: null,
    },
    {
      key: 'moodle.algo',
      source: 'moodle',
      title: 'Algo do Moodle',
      description: 'Texto de uma permissão da fonte desconectada.',
      risk: 'low',
      enabled: false,
      available: false,
      unavailableReason: 'source_not_connected',
    },
  ];
  const puts: Array<{ key: string; body: unknown }> = [];
  await mockApi(page, {
    'GET /me': () => ({ body: me }),
    'GET /me/permissions': () => ({ body: { items } }),
    'PUT /me/permissions/siasb.procedures_write': (request) => {
      puts.push({ key: 'siasb.procedures_write', body: request.postDataJSON() });
      items[1]!.enabled = true;
      return { status: 204 };
    },
  });

  await page.goto('/connections');
  await expect(page.getByRole('heading', { name: 'Permissões' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Agendar e desmarcar sessões pelo Claude' })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Algo do Moodle' })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('permissoes.png'), fullPage: true });

  // Risco alto: pede confirmação antes de ligar. O PUT passa pelo preflight de CORS (PUT precisa estar liberado).
  await page.getByRole('switch', { name: 'Lançar e excluir procedimentos pelo Claude' }).click({ force: true });
  const dialog = page.getByRole('dialog', { name: 'Lançar e excluir procedimentos pelo Claude' });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: testInfo.outputPath('permissoes-confirmar.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Ligar' }).click();
  await expect(page.getByRole('switch', { name: 'Lançar e excluir procedimentos pelo Claude' })).toBeChecked();
  expect(puts).toEqual([{ key: 'siasb.procedures_write', body: { enabled: true } }]);

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
    'GET /me/permissions': () => ({
      body: {
        items: [
          {
            key: 'siasb.schedule_write',
            source: 'siasb',
            title: 'Agendar e desmarcar sessões pelo Claude',
            description: 'Permite que o Claude marque e desmarque sessões da clínica no SIASB em seu nome.',
            risk: 'low',
            enabled: false,
            available: siasb.status !== 'disconnected',
            unavailableReason: siasb.status === 'disconnected' ? 'source_not_connected' : null,
          },
        ],
      },
    }),
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

  await page.goto('/academic/curriculum');
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
  await page.goto('/academic/curriculum');
  await expect(page.getByRole('heading', { name: 'Optativas' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('va-grade-celular.png'), fullPage: true });

  expect(violations).toEqual([]);
});
