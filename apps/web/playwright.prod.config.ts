import { defineConfig, devices } from '@playwright/test';

/** Testes contra o build de produção (`vite preview`): é o que o Caddy serve, então é onde a CSP precisa valer. */
export default defineConfig({
  testDir: 'e2e-prod',
  timeout: 30_000,
  reporter: 'list',
  use: { baseURL: 'http://localhost:3001', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: 'http://localhost:3001',
    reuseExistingServer: false,
    // O build de produção exige as origens (sem padrão silencioso). Em teste, as de desenvolvimento.
    env: { VITE_AUTH_ORIGIN: 'http://localhost:3002', VITE_PANEL_ORIGIN: 'http://localhost:3001' },
    timeout: 180_000,
  },
});
