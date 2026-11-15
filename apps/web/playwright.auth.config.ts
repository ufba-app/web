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
  // Serve o BUILD (`vite preview`), não o servidor de desenvolvimento. O dev server entrega centenas de módulos soltos
  // e, com a suíte em paralelo, cada carga de página levava de 10 a 18 s: o teste do login por pedido de app (duas
  // cargas completas mais um chunk lazy) estourava o `expect` ou os 30 s, 1 vez em 3, só no desktop. Com o build são
  // poucos arquivos, e o teste passa a exercitar o que vai para produção. As origens são as de localhost.
  // `reuseExistingServer: false`: um `pnpm dev:auth` esquecido na porta 3002 não pode ser reaproveitado em silêncio.
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
