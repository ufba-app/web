import { defineConfig, devices } from '@playwright/test';

/**
 * O app de autenticação roda em :3002 (é o AUTH_ORIGIN da API e o redirect_uri do cliente `ufba-web`).
 * A API e o painel são simulados: nada aqui fala com o Google nem com a API real.
 */
export default defineConfig({
  testDir: 'e2e-auth',
  // Os testes contra a API real têm config própria (playwright.auth.real.config.ts).
  testIgnore: '**/real-api.spec.ts',
  timeout: 30_000,
  // O dev server começa frio: a primeira compilação de cada chunk lazy pode passar dos 5 s padrão com a suíte em paralelo.
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Largura dos artboards de celular do design (390px).
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
  webServer: {
    command: 'pnpm dev:auth',
    url: 'http://localhost:3002',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
