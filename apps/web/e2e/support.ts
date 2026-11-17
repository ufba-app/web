import type { BrowserContext, Page, Request } from '@playwright/test';

export const API = 'http://localhost:3000';
export const WEB = 'http://localhost:3001';

export const AUTH = 'http://localhost:3002';

/** Cabeçalhos de CORS da API para a origem que chama (o painel por padrão; o auth passa `AUTH`). */
const corsFor = (origin: string) => ({
  'access-control-allow-origin': origin,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type,x-ufba',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
});

export type MockResponse = { status?: number; body?: unknown };
export type MockHandler = (request: Request) => MockResponse | Promise<MockResponse>;

/**
 * Simula a API para as telas pós-login (o login de verdade passa pelo Google, que o teste não faz).
 * Responde o preflight de CORS e devolve 404 `{ error: "not_found" }` para rota sem mock.
 * As chaves são "MÉTODO /caminho". Com um `BrowserContext` o mock vale também para as abas que a página abrir
 * (o "Abrir o SIGAA já logado" abre uma aba nova que fala com a API sozinha).
 */
export async function mockApi(page: Page | BrowserContext, handlers: Record<string, MockHandler>, origin: string = WEB): Promise<void> {
  const CORS = corsFor(origin);
  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const key = `${request.method()} ${new URL(request.url()).pathname}`;
    const handler = handlers[key];
    const result = handler ? await handler(request) : { status: 404, body: { error: 'not_found', message: `sem mock para ${key}` } };
    await route.fulfill({
      status: result.status ?? 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: result.body === undefined ? undefined : JSON.stringify(result.body),
    });
  });
}

/** Saúde "tudo certo" (api#79) das conexões do exemplo. */
const OK_HEALTH = { state: 'ok', reason: null, message: 'Conexão funcionando.', action: null, since: '2026-11-16T12:00:00.000Z' };

export const me = {
  id: '6f0f9c1e-6f1d-4f43-9d52-0d3a8a8b9e11',
  email: 'marina.costa@ufba.br',
  name: 'Marina Costa',
  connections: {
    sigaa: { status: 'connected', login: 'marina.costa', passkey: { slots: 0 }, health: OK_HEALTH },
    moodle: { status: 'connected', account: 'ava.ufba.br:marina.costa', health: OK_HEALTH },
    classroom: {
      available: true,
      apps: ['ufba', 'guest'],
      accounts: [{ email: 'marina.costa@ufba.br', status: 'connected', health: OK_HEALTH }],
    },
    siasb: { offered: false, status: 'disconnected', expiresAt: null, syncedAt: null, health: null },
  },
};

export const authorizeRequest = {
  id: 'req-1',
  client: {
    domain: 'claude.ai',
    redirectUri: 'https://claude.ai/api/mcp/auth_callback',
    name: 'Claude',
    logoUrl: null,
    verified: true,
    metadata: 'present',
  },
  signedIn: true,
  sources: [
    { source: 'sigaa', status: 'connected' },
    { source: 'moodle', status: 'connected' },
    { source: 'classroom', status: 'connected' },
  ],
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
};
