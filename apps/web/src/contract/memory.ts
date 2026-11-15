import { z } from 'zod/mini';

/** POST /device/lookup: quem pediu a conexão de um computador (código do terminal). */
export const deviceLookupSchema = z.object({
  clientName: z.string(),
  computerName: z.nullable(z.string()),
  os: z.nullable(z.string()),
  requestedAt: z.string(),
  approxLocation: z.nullable(z.string()),
  /** A rede de quem aprova é bem diferente da de quem pediu. */
  ipDiffers: z.boolean(),
});
export type DeviceLookup = z.infer<typeof deviceLookupSchema>;

export const deviceDecisions = ['approve', 'deny'] as const;
export type DeviceDecision = (typeof deviceDecisions)[number];

export const memoryComputerSchema = z.object({
  id: z.string(),
  name: z.string(),
  os: z.string(),
  agents: z.array(z.string()),
  /** `fresh` (instalação nova) ou `profile` (perfil ufba); a API pode mandar outro valor no futuro. */
  installMode: z.nullable(z.string()),
  createdAt: z.string(),
  lastSeenAt: z.nullable(z.string()),
  revokedAt: z.nullable(z.string()),
});
export type MemoryComputer = z.infer<typeof memoryComputerSchema>;

export const memoryComputersSchema = z.object({ computers: z.array(memoryComputerSchema) });
export type MemoryComputers = z.infer<typeof memoryComputersSchema>;

export const memoryStatusSchema = z.object({
  memoryAvailable: z.boolean(),
  userReady: z.boolean(),
  isAdmin: z.boolean(),
  computers: z.array(memoryComputerSchema),
});
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;

/** Nome do computador: 1 a 60 caracteres (PATCH /memory/computers/{id}). */
export const COMPUTER_NAME_MAX = 60;

/** Projeto da memória (lista e detalhe). `role`: o que ESTA pessoa pode; `source`: de onde vem o acesso. */
export const projectRoles = ['owner', 'read', 'write'] as const;
export const projectSources = ['owner', 'invite', 'team'] as const;
export const memberLevels = ['read', 'write'] as const;
export type MemberLevel = (typeof memberLevels)[number];

export const memoryProjectSchema = z.object({
  id: z.string(),
  workspace: z.string(),
  project: z.string(),
  title: z.string(),
  team: z.boolean(),
  role: z.enum(projectRoles),
  source: z.enum(projectSources),
  membersCount: z.number(),
  sync: z.enum(['ok', 'pending']),
});
export type MemoryProject = z.infer<typeof memoryProjectSchema>;

export const memoryProjectsSchema = z.object({ projects: z.array(memoryProjectSchema) });
export type MemoryProjects = z.infer<typeof memoryProjectsSchema>;

export const projectMemberSchema = z.object({
  email: z.string(),
  name: z.nullable(z.string()),
  level: z.enum(memberLevels),
  status: z.enum(['pending', 'active']),
});
export type ProjectMember = z.infer<typeof projectMemberSchema>;

export const memoryProjectDetailSchema = z.object({
  ...memoryProjectSchema.shape,
  /** Só o dono recebe a lista; os demais recebem `[]`. */
  members: z.array(projectMemberSchema),
  /** Trecho do `.ai-memory.toml` para colar na raiz do repositório. */
  marker: z.string(),
});
export type MemoryProjectDetail = z.infer<typeof memoryProjectDetailSchema>;

/** Nome do projeto: 1 a 60 caracteres (POST /memory/projects). */
export const PROJECT_NAME_MAX = 60;
/** Só e-mail institucional pode ser convidado. */
export const INVITE_EMAIL_DOMAIN = '@ufba.br';

/** GET /admin/team (somente admin). */
export const teamRoleSchema = z.object({
  key: z.string(),
  description: z.string(),
  grants: z.array(
    z.object({
      workspace: z.string(),
      project: z.string(),
      title: z.string(),
      level: z.enum(memberLevels),
    }),
  ),
});
export type TeamRole = z.infer<typeof teamRoleSchema>;

export const teamMemberSchema = z.object({
  userId: z.string(),
  name: z.nullable(z.string()),
  email: z.nullable(z.string()),
  roles: z.array(z.string()),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const adminTeamSchema = z.object({
  roles: z.array(teamRoleSchema),
  members: z.array(teamMemberSchema),
});
export type AdminTeam = z.infer<typeof adminTeamSchema>;

/** GET /admin/team/people?q= : até 20 pessoas (mínimo 2 letras), com os papéis que já têm. */
export const adminTeamSearchSchema = z.object({ people: z.array(teamMemberSchema) });
export type AdminTeamSearch = z.infer<typeof adminTeamSearchSchema>;

/** GET /admin/memory/sync (somente admin). `lastError` é só um código (ex.: `unavailable`). */
export const adminMemorySyncSchema = z.object({
  failing: z.array(
    z.object({
      name: z.nullable(z.string()),
      email: z.nullable(z.string()),
      attempts: z.number(),
      nextRunAt: z.string(),
      lastError: z.nullable(z.string()),
    }),
  ),
  unknownProjects: z.array(z.object({ workspace: z.string(), project: z.string() })),
});
export type AdminMemorySync = z.infer<typeof adminMemorySyncSchema>;
