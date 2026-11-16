import type { AuthorizeRequest } from './authorize';
import type { AuthorizedApp } from './authorizedApps';
import type {
  AdminMemorySync,
  AdminTeam,
  DeviceLookup,
  MemoryComputer,
  MemoryProject,
  MemoryProjectDetail,
} from './memory';
import type { Me } from './me';
import type { OfferedPermission } from './permissions';

/** Dados de exemplo no formato do contrato, para testes. */
export function meFixture(overrides: Partial<Me> = {}): Me {
  return {
    id: '6f0f9c1e-6f1d-4f43-9d52-0d3a8a8b9e11',
    email: 'marina.costa@ufba.br',
    name: 'Marina Costa',
    connections: {
      sigaa: { status: 'connected', login: 'marina.costa', passkey: { slots: 0 } },
      moodle: { status: 'connected', account: 'ava.ufba.br:marina.costa' },
      classroom: {
        available: true,
        apps: ['ufba', 'guest'],
        accounts: [{ email: 'marina.costa@ufba.br', status: 'connected' }],
      },
      siasb: { offered: false, status: 'disconnected', expiresAt: null, syncedAt: null },
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
    // Sem permissões oferecidas por padrão (quem não tem o SIASB não recebe nenhuma): os testes de permissão passam as suas.
    permissions: [],
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
    permissions: [],
    ...overrides,
  };
}

export function memoryComputerFixture(overrides: Partial<MemoryComputer> = {}): MemoryComputer {
  return {
    id: 'pc-1',
    name: 'Notebook da Marina',
    os: 'windows',
    agents: ['claude-code', 'codex'],
    installMode: 'fresh',
    createdAt: '2026-11-04T12:00:00.000Z',
    lastSeenAt: null,
    revokedAt: null,
    ...overrides,
  };
}

export function deviceLookupFixture(overrides: Partial<DeviceLookup> = {}): DeviceLookup {
  return {
    clientName: 'Instalador ufba.app',
    computerName: 'Notebook da Marina',
    os: 'windows',
    requestedAt: '2026-11-14T15:30:00.000Z',
    approxLocation: 'Salvador, BA',
    ipDiffers: false,
    ...overrides,
  };
}

export function memoryProjectFixture(overrides: Partial<MemoryProject> = {}): MemoryProject {
  return {
    id: 'proj-1',
    workspace: 'marina-costa',
    project: 'tcc',
    title: 'TCC',
    team: false,
    role: 'owner',
    source: 'owner',
    membersCount: 1,
    sync: 'ok',
    ...overrides,
  };
}

export function memoryProjectDetailFixture(overrides: Partial<MemoryProjectDetail> = {}): MemoryProjectDetail {
  return {
    ...memoryProjectFixture(),
    members: [],
    marker: 'workspace = "marina-costa"\nproject = "tcc"',
    ...overrides,
  };
}

export function adminTeamFixture(overrides: Partial<AdminTeam> = {}): AdminTeam {
  return {
    roles: [
      {
        key: 'maintainer',
        description: 'Mantenedor',
        grants: [
          { workspace: 'ufba-app', project: 'api', title: 'API', level: 'write' },
          { workspace: 'ufba-app', project: 'web', title: 'Web', level: 'write' },
          { workspace: 'ufba-app', project: 'docs', title: 'Docs', level: 'write' },
        ],
      },
    ],
    members: [{ userId: 'u-1', name: 'Marina Costa', email: 'marina.costa@ufba.br', roles: ['maintainer'] }],
    ...overrides,
  };
}

export function adminMemorySyncFixture(overrides: Partial<AdminMemorySync> = {}): AdminMemorySync {
  return { failing: [], unknownProjects: [], ...overrides };
}

/**
 * As duas permissões do SIASB no formato real da API (api#57 e #59), com o texto dela (neutro: "pelo app"). `available`
 * segue a conexão do SIASB; `granted` lista as chaves que este app já tem concedidas.
 */
export function offeredPermissionsFixture(available = true, granted: string[] = []): OfferedPermission[] {
  const reason = available ? null : ('source_not_connected' as const);
  return [
    {
      key: 'siasb.schedule_write',
      source: 'siasb',
      title: 'Agendar e desmarcar sessões pelo app',
      description:
        'Permite que o app marque e desmarque sessões da clínica no SIASB em seu nome. Cada ação pede a sua confirmação antes de ser feita.',
      risk: 'low',
      available,
      unavailableReason: reason,
      granted: granted.includes('siasb.schedule_write'),
    },
    {
      key: 'siasb.procedures_write',
      source: 'siasb',
      title: 'Lançar e excluir procedimentos pelo app',
      description:
        'Permite que o app inclua e exclua procedimentos previstos nos seus atendimentos do SIASB, que ficam no prontuário. Cada ação pede a sua confirmação. Procedimentos realizados continuam sendo feitos por você no site.',
      risk: 'high',
      available,
      unavailableReason: reason,
      granted: granted.includes('siasb.procedures_write'),
    },
  ];
}

/**
 * A permissão de postar em fóruns do AVA (api#65), no formato real da API, com o texto dela. Risco alto; fonte `moodle`.
 * `available` segue a conexão do Moodle; `granted` diz se este app já a tem.
 */
export function moodleForumPermissionFixture(available = true, granted = false): OfferedPermission {
  return {
    key: 'moodle.forum_write',
    source: 'moodle',
    title: 'Postar em fóruns do AVA pelo app',
    description:
      'Permite que o app publique mensagens em fóruns do AVA em seu nome: abrir uma discussão nova ou responder a uma existente. Quem vê são os colegas e os professores, e a publicação não pode ser desfeita pelo app. Cada publicação pede a sua confirmação antes de ser enviada.',
    risk: 'high',
    available,
    unavailableReason: available ? null : 'source_not_connected',
    granted,
  };
}
