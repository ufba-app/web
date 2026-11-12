import { defineConfig, devices } from '@playwright/test';

/**
 * Auth (:3002) contra a API REAL (:3000), que precisa estar de pé com AUTH_ORIGIN=http://localhost:3002.
 * Fica à parte do `playwright.auth.config.ts` (simulado) para este não depender da API.
 */
export default defineConfig({
  testDir: 'e2e-auth',
  testMatch: 'real-api.spec.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: { baseURL: 'http://localhost:3002', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'pnpm dev:auth', url: 'http://localhost:3002', reuseExistingServer: true, timeout: 60_000 },
});
