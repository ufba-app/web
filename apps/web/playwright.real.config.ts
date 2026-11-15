import { defineConfig, devices } from '@playwright/test';

/**
 * Painel (:3001) contra a API REAL (:3000), que precisa estar de pé (e o auth na :3002). Fica à parte do
 * `playwright.config.ts` (simulado) para este não depender da API. Aqui o painel segue no dev server: a API real
 * só existe na máquina de quem a subiu, nunca no CI.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: 'real-api.spec.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: { baseURL: 'http://localhost:3001', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
  webServer: { command: 'pnpm dev', url: 'http://localhost:3001', reuseExistingServer: true, timeout: 60_000 },
});
