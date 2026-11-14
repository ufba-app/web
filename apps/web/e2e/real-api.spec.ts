import { expect, test } from '@playwright/test';
import { AUTH } from './support';

/**
 * Painel contra a API real em :3000, com o auth de pé em :3002. O login (e tudo o que dá para provar antes dele)
 * mora em e2e-auth/real-api.spec.ts; aqui fica só o que é do painel.
 */
test.describe('painel contra a API real', () => {
  test('sem sessão, uma página do painel manda para o login do auth e guarda o destino', async ({ page }) => {
    await page.goto('/connections');
    await expect(page).toHaveURL(`${AUTH}/sign-in?return=%2Fconnections`);
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    // Se o CORS com credenciais falhasse, aqui apareceria "Algo deu errado", não o login.
    await expect(page.getByText('Algo deu errado')).toHaveCount(0);
  });
});
