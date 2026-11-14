import { expect, test } from '@playwright/test';
import { API, AUTH } from '../e2e/support';

/**
 * Contra a API real em :3000 (que precisa estar de pé com AUTH_ORIGIN=http://localhost:3002), com o auth em :3002.
 * O login de verdade passa pelo Google e exige a pessoa, então aqui testamos tudo o que dá para provar antes dele:
 * CORS com cookie, redirecionamentos e erros. Roda com `pnpm e2e:auth:real` (fora do `pnpm e2e:auth`, que é simulado).
 */
test.describe('auth contra a API real', () => {
  test('Entrar com Google leva à API com PKCE e a API manda para o Google', async ({ page }) => {
    // A chamada à API é real, mas o teste não segue o redirecionamento para o Google nem para o SSO da UFBA:
    // consultamos a API sem seguir redirecionamentos, conferimos o 303 e paramos a navegação ali.
    let apiResponse: { status: number; location: string | undefined } | undefined;
    let requested: URL | undefined;
    await page.route(`${API}/authorize?**`, async (route) => {
      requested = new URL(route.request().url());
      const real = await route.fetch({ maxRedirects: 0 });
      apiResponse = { status: real.status(), location: real.headers()['location'] };
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<title>parou aqui</title>' });
    });

    await page.goto('/sign-in');
    await page.getByRole('button', { name: /entrar com google/i }).click();
    await page.waitForURL(new RegExp(`^${API}/authorize\?`), { waitUntil: 'commit' });

    const url = requested as URL;
    expect(url.searchParams.get('client_id')).toBe('ufba-web');
    // O login começa e termina no auth.
    expect(url.searchParams.get('redirect_uri')).toBe(`${AUTH}/sign-in/callback`);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const state = url.searchParams.get('state');
    expect(state).toBeTruthy();
    // A API real respondeu 303 e mandou para o Google (só o @ufba.br, pelo parâmetro hd).
    expect(apiResponse?.status).toBe(303);
    expect(apiResponse?.location).toMatch(/^https:\/\/accounts\.google\.com\//);

    // O sessionStorage é do auth, de outra origem que a API: voltamos ao auth (mesma aba) para conferi-lo.
    await page.goBack({ waitUntil: 'commit' });
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();

    // O verifier ficou só no sessionStorage e nunca na URL.
    const stored = await page.evaluate(() => ({
      verifier: sessionStorage.getItem('ufba.pkce.verifier'),
      state: sessionStorage.getItem('ufba.pkce.state'),
    }));
    expect(stored.state).toBe(state);
    expect(stored.verifier).toBeTruthy();
    expect(url.toString()).not.toContain(stored.verifier as string);
  });

  test('cliente inválido: a API manda para o /authorize/error do auth com o texto em pt-BR', async ({ page }) => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: 'cliente-que-nao-existe',
      redirect_uri: 'https://exemplo.invalid/cb',
      code_challenge: 'x'.repeat(43),
      code_challenge_method: 'S256',
      state: 's',
    });
    await page.goto(`${API}/authorize?${params}`);
    await expect(page).toHaveURL(new RegExp(`^${AUTH}/authorize/error\\?error=`));
    await expect(page.getByRole('heading', { name: 'Pedido inválido' })).toBeVisible();
  });

  test('pedido de autorização inexistente, sem sessão, cai no login', async ({ page }) => {
    await page.goto('/authorize?request=nao-existe');
    // Sem sessão e sem pedido: ou vai ao login ou mostra "Pedido não encontrado", nunca uma tela quebrada.
    await expect(page.getByRole('heading', { name: /^(Entrar|Pedido não encontrado)$/ })).toBeVisible();
  });

  test('o login não tem violações de CSP nem erros no console, e o CORS com cookie vale para o auth', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(error.message));

    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    // Se o CORS com credenciais falhasse para a origem do auth, o /me não daria 401 limpo.
    await expect(page.getByText('Algo deu errado')).toHaveCount(0);

    // 401 de /me é esperado (ninguém logado) e o navegador o registra como erro de rede.
    expect(problems.filter((p) => !/401|Unauthorized/i.test(p))).toEqual([]);
  });
});
