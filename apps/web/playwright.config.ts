import { defineConfig, devices } from '@playwright/test';

/**
 * O web precisa rodar em :3001: é a WEB_ORIGIN da API e o redirect_uri do cliente `ufba-web`.
 * A API é simulada. Os testes de `e2e/real-api.spec.ts` (API real em :3000) têm config própria:
 * `playwright.real.config.ts` (`pnpm e2e:real`).
 */
export default defineConfig({
  testDir: 'e2e',
  testIgnore: '**/real-api.spec.ts',
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Largura dos artboards de celular do design (390px).
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
  // Serve o BUILD (`vite preview`), não o dev server: o dev entrega centenas de módulos soltos e, com a suíte em
  // paralelo, a carga de cada página passava de 10 s e derrubava testes ao acaso (mesma causa do e2e do auth). Com o
  // build são poucos arquivos, e o teste exercita o que vai para produção. Origens de localhost.
  // `reuseExistingServer: false`: um `pnpm dev` esquecido na 3001 não pode ser reaproveitado em silêncio.
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: 'http://localhost:3001',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_API_URL: 'http://localhost:3000',
      VITE_PANEL_ORIGIN: 'http://localhost:3001',
      VITE_AUTH_ORIGIN: 'http://localhost:3002',
    },
  },
});
