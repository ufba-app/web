import { defineConfig, devices } from '@playwright/test';

/**
 * O web precisa rodar em :3001: é a WEB_ORIGIN da API e o redirect_uri do cliente `ufba-web`.
 * Os testes em `e2e/real-api.spec.ts` falam com a API real em :3000 (que precisa estar de pé).
 */
export default defineConfig({
  testDir: 'e2e',
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
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3001',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
