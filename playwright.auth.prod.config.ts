import { defineConfig, devices } from '@playwright/test';

/**
 * Testes contra o build de produção do auth (`vite preview`, que serve o que o Caddy serviria): é onde a CSP precisa
 * valer. O build de produção exige as origens fixas; em teste elas apontam para localhost.
 */
export default defineConfig({
  testDir: 'e2e-auth-prod',
  timeout: 30_000,
  reporter: 'list',
  use: { baseURL: 'http://localhost:3002', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm build:auth && pnpm preview:auth',
    url: 'http://localhost:3002',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_API_URL: 'http://localhost:3000',
      VITE_PANEL_ORIGIN: 'http://localhost:3001',
      VITE_AUTH_ORIGIN: 'http://localhost:3002',
    },
  },
});
