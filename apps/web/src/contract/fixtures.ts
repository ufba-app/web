import type { AuthorizeRequest } from './authorize';
import type { AuthorizedApp } from './authorizedApps';
import type { Me } from './me';

/** Dados de exemplo no formato do contrato, para testes. */
export function meFixture(overrides: Partial<Me> = {}): Me {
  return {
    id: '6f0f9c1e-6f1d-4f43-9d52-0d3a8a8b9e11',
    email: 'marina.costa@ufba.br',
    name: 'Marina Costa',
    connections: {
      sigaa: { status: 'connected', login: 'marina.costa' },
      moodle: { status: 'connected', account: 'ava.ufba.br:marina.costa' },
      classroom: {
        available: true,
        apps: ['ufba', 'guest'],
        accounts: [{ email: 'marina.costa@ufba.br', status: 'connected' }],
      },
    },
    ...overrides,
  };
}

export function authorizeRequestFixture(overrides: Partial<AuthorizeRequest> = {}): AuthorizeRequest {
  return {
    id: 'req-1',
    client: {
      domain: 'claude.ai',
      redirectUri: 'https://claude.ai/api/mcp/auth_callback',
      name: 'Claude',
      logoUrl: 'http://localhost:3000/client-logos/abc123',
      verified: true,
      metadata: 'present',
    },
    signedIn: true,
    sources: [
      { source: 'sigaa', status: 'connected' },
      { source: 'moodle', status: 'connected' },
      { source: 'classroom', status: 'connected' },
    ],
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    ...overrides,
  };
}

export function authorizedAppFixture(overrides: Partial<AuthorizedApp> = {}): AuthorizedApp {
  return {
    clientId: 'client-1',
    domain: 'claude.ai',
    name: 'Claude',
    logoUrl: null,
    verified: true,
    authorizedAt: '2026-11-04T12:00:00.000Z',
    lastUsedAt: '2026-11-11T10:00:00.000Z',
    sigaa: true,
    ...overrides,
  };
}
