import { expect, test, type Page } from '@playwright/test';
import { API, AUTH, authorizeRequest, me, mockApi, WEB } from '../e2e/support';

/**
 * Telas do auth com a API e o painel simulados. O login de verdade passa pelo Google, que o teste não faz; o que
 * dá para provar aqui é o encadeamento: auth -> API (/authorize) -> auth (/sign-in/callback) -> POST /session -> destino.
 */

const signedOut = { status: 401, body: { error: 'session_expired', message: 'Entre de novo.' } };

/** O painel é outro app (:3001) e não está de pé neste teste: qualquer navegação para lá recebe uma página vazia. */
async function stubPanel(page: Page): Promise<string[]> {
  const visited: string[] = [];
  await page.route(`${WEB}/**`, async (route) => {
    visited.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>painel</title>' });
  });
  return visited;
}

/**
 * Simula o /authorize da API: devolve 302 para o redirect_uri com `code` e o mesmo `state` recebido, e guarda o
 * que a API receberia (para conferir o redirect_uri e o PKCE).
 */
async function stubApiAuthorize(page: Page) {
  const seen: { redirectUri?: string; clientId?: string; challengeMethod?: string } = {};
  await page.route(`${API}/authorize?**`, async (route) => {
    const url = new URL(route.request().url());
    seen.redirectUri = url.searchParams.get('redirect_uri') ?? undefined;
    seen.clientId = url.searchParams.get('client_id') ?? undefined;
    seen.challengeMethod = url.searchParams.get('code_challenge_method') ?? undefined;
    const back = new URL(seen.redirectUri ?? '');
    back.searchParams.set('code', 'the-code');
    back.searchParams.set('state', url.searchParams.get('state') ?? '');
    await route.fulfill({ status: 302, headers: { location: back.toString() } });
  });
  return seen;
}

test.describe('auth (API simulada)', () => {
  test('login completo sem destino: vai ao painel, com o redirect_uri no auth', async ({ page }) => {
    const visited = await stubPanel(page);
    let loggedIn = false;
    let session: { code?: string; codeVerifier?: string; redirectUri?: string } = {};
    let sessionHeaders: Record<string, string> = {};
    await mockApi(
      page,
      {
        'GET /me': () => (loggedIn ? { body: me } : signedOut),
        'POST /session': async (request) => {
          session = request.postDataJSON();
          sessionHeaders = request.headers();
          loggedIn = true;
          return { status: 204 };
        },
      },
      AUTH,
    );
    // Depois do mockApi: no Playwright a rota registrada por último tem prioridade, e o /authorize é mais específico.
    const seen = await stubApiAuthorize(page);

    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    await page.getByRole('button', { name: 'Entrar com Google' }).click();

    await page.waitForURL(`${WEB}/connections`);
    expect(seen).toEqual({ redirectUri: `${AUTH}/sign-in/callback`, clientId: 'ufba-web', challengeMethod: 'S256' });
    expect(session).toMatchObject({ code: 'the-code', redirectUri: `${AUTH}/sign-in/callback` });
    expect(session.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sessionHeaders['x-ufba']).toBe('1');
    expect(visited).toContain(`${WEB}/connections`);
  });

  test('na volta do login o brasão do auth.html continua na tela; nas telas com conteúdo ele some', async ({ page }) => {
    await stubPanel(page);
    let loggedIn = false;
    // A troca do code fica presa até o teste conferir a tela de espera (sem tempo fixo: em máquina carregada ele estoura).
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await mockApi(
      page,
      {
        'GET /me': () => (loggedIn ? { body: me } : signedOut),
        'POST /session': async () => {
          await gate;
          loggedIn = true;
          return { status: 204 };
        },
      },
      AUTH,
    );
    await stubApiAuthorize(page);

    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    // Tela com conteúdo: a #root tem o login e o brasão de espera some.
    await expect(page.locator('.boot')).toBeHidden();

    await page.getByRole('button', { name: 'Entrar com Google' }).click();
    await page.waitForURL(`${AUTH}/sign-in/callback`);
    // Volta do login: a página não desenha nada (sem "Entrando…"), a #root fica vazia e o MESMO brasão segue visível.
    await expect(page.locator('#root')).toBeEmpty();
    await expect(page.locator('.boot__mark')).toBeVisible();
    await expect(page.getByText('Entrando')).toHaveCount(0);

    release();
    await page.waitForURL(`${WEB}/connections`);
  });

  test('login a partir de um pedido de app termina no /authorize do próprio auth', async ({ page }) => {
    await stubPanel(page);
    let loggedIn = false;
    await mockApi(
      page,
      {
        'GET /me': () => (loggedIn ? { body: me } : signedOut),
        'GET /authorize/requests/req-1': () => ({ body: { ...authorizeRequest, signedIn: loggedIn, sources: loggedIn ? authorizeRequest.sources : null } }),
        'POST /session': () => {
          loggedIn = true;
          return { status: 204 };
        },
      },
      AUTH,
    );
    await stubApiAuthorize(page);

    // A API manda a pessoa sem sessão para cá; o /authorize do auth a leva ao login e guarda o pedido.
    await page.goto('/authorize?request=req-1');
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    await expect(page.getByText(/quer acessar seus dados acadêmicos/i)).toBeVisible();
    await page.getByRole('button', { name: 'Entrar com Google' }).click();

    await expect(page.getByRole('button', { name: 'Autorizar' })).toBeVisible();
    expect(new URL(page.url()).origin).toBe(AUTH);
    expect(new URL(page.url()).pathname).toBe('/authorize');
  });

  test('retorno do login com state errado não chama /session e volta ao login com aviso', async ({ page }) => {
    let sessionCalls = 0;
    await mockApi(
      page,
      {
        'GET /me': () => signedOut,
        'POST /session': () => {
          sessionCalls += 1;
          return { status: 204 };
        },
      },
      AUTH,
    );
    await page.goto('/sign-in/callback?code=x&state=forjado');
    await expect(page.getByRole('alert')).toContainText(/não deu para confirmar o login/i);
    expect(sessionCalls).toBe(0);
    // O code e o state saíram da barra de endereço.
    expect(page.url()).not.toContain('code=');
  });

  test('conta fora do @ufba.br: mostra o texto da API e oferece outra conta', async ({ page }) => {
    await mockApi(page, { 'GET /me': () => signedOut }, AUTH);
    const text = 'marina.costa@gmail.com não é um e-mail @ufba.br. Entre com a sua conta institucional.';
    await page.goto(`/sign-in/callback?error=access_denied&error_description=${encodeURIComponent(text)}`);
    await expect(page.getByRole('alert')).toHaveText(text);
    await expect(page.getByRole('button', { name: 'Usar outra conta' })).toBeVisible();
  });

  test('já logado, /sign-in manda ao painel; retorno de outra origem é ignorado', async ({ page }) => {
    const visited = await stubPanel(page);
    await mockApi(page, { 'GET /me': () => ({ body: me }) }, AUTH);

    await page.goto(`/sign-in?return=${encodeURIComponent('//evil.example/x')}`);
    await page.waitForURL(`${WEB}/connections`);
    expect(visited.every((url) => url.startsWith(WEB))).toBe(true);
  });

  test('Autorizar: mostra o app, o domínio e navega para o redirectTo da API', async ({ page }) => {
    await stubPanel(page);
    await mockApi(
      page,
      {
        'GET /me': () => ({ body: me }),
        'GET /authorize/requests/req-1': () => ({ body: authorizeRequest }),
        'POST /authorize/requests/req-1/approve': () => ({ body: { redirectTo: `${WEB}/landed?code=abc&state=xyz` } }),
      },
      AUTH,
    );
    await page.goto('/authorize?request=req-1');

    await expect(page.getByText('Claude', { exact: true })).toBeVisible();
    await expect(page.getByText('Verificado')).toBeVisible();
    await expect(page.getByText('claude.ai', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Autorizar' }).click();
    await page.waitForURL(`${WEB}/landed?code=abc&state=xyz`);
  });

  test('Recusar usa o deny e navega para o redirectTo', async ({ page }) => {
    await stubPanel(page);
    await mockApi(
      page,
      {
        'GET /me': () => ({ body: me }),
        'GET /authorize/requests/req-1': () => ({ body: authorizeRequest }),
        'POST /authorize/requests/req-1/deny': () => ({ body: { redirectTo: `${WEB}/landed?error=access_denied` } }),
      },
      AUTH,
    );
    await page.goto('/authorize?request=req-1');
    await page.getByRole('button', { name: 'Recusar' }).click();
    await page.waitForURL(`${WEB}/landed?error=access_denied`);
  });

  test('falha ao autorizar vira toast (evento), com a tela de pedido intacta e contraste visível', async ({ page }, testInfo) => {
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

    const toast = page.getByText('Não deu para responder agora.');
    await expect(toast).toBeVisible();
    // Os botões voltam a ficar ativos para tentar de novo.
    await expect(page.getByRole('button', { name: 'Autorizar' })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('toast-erro.png') });
  });

  test('pedido inválido: /authorize/error mostra o texto da API; "Ir para o painel" leva ao painel e há "Entrar de novo"', async ({ page }) => {
    await stubPanel(page);
    await page.goto(`/authorize/error?error=invalid_redirect&message=${encodeURIComponent('Cliente desconhecido.')}`);
    await expect(page.getByRole('heading', { name: 'Pedido inválido' })).toBeVisible();
    await expect(page.getByText('Cliente desconhecido.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar de novo' })).toBeVisible();
    await page.getByRole('button', { name: 'Ir para o painel' }).click();
    await page.waitForURL(`${WEB}/`);
  });

  test('pedido expirado: tela de erro própria', async ({ page }) => {
    await mockApi(
      page,
      {
        'GET /me': () => ({ body: me }),
        'GET /authorize/requests/req-1': () => ({ status: 410, body: { error: 'request_expired', message: 'Expirou.' } }),
      },
      AUTH,
    );
    await page.goto('/authorize?request=req-1');
    await expect(page.getByRole('heading', { name: 'Pedido expirado' })).toBeVisible();
  });

  test('404 do auth e a raiz', async ({ page }) => {
    await stubPanel(page);
    await mockApi(page, { 'GET /me': () => signedOut }, AUTH);

    await page.goto('/rota-que-nao-existe');
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
    await page.getByRole('button', { name: 'Ir para o painel' }).click();
    await page.waitForURL(`${WEB}/`);

    await page.goto('/');
    await expect(page).toHaveURL(`${AUTH}/sign-in`);
  });

  test('sem rolagem horizontal, também no celular', async ({ page }) => {
    await mockApi(page, { 'GET /me': () => signedOut }, AUTH);
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
