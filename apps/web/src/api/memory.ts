import { useQuery } from '@tanstack/react-query';
import {
  adminMemorySyncSchema,
  adminTeamSchema,
  adminTeamSearchSchema,
  deviceLookupSchema,
  memoryProjectDetailSchema,
  memoryProjectSchema,
  memoryProjectsSchema,
  memoryComputersSchema,
  memoryStatusSchema,
  type DeviceDecision,
  type DeviceLookup,
  type MemberLevel,
  type MemoryProject,
} from '../contract';
import { request } from './client';

export const memoryStatusQueryKey = ['memory', 'status'] as const;
export const memoryComputersQueryKey = ['memory', 'computers'] as const;

/** O código do terminal vai no corpo (POST), nunca na URL. */
export function lookupDevice(userCode: string): Promise<DeviceLookup> {
  return request('/device/lookup', { method: 'POST', body: { userCode }, schema: deviceLookupSchema });
}

/** Aprovar entrega a chave de gravação ao computador que pediu. Negar descarta o pedido. 204 nos dois casos. */
export function decideDevice(userCode: string, decision: DeviceDecision): Promise<void> {
  return request('/device/decision', { method: 'POST', body: { userCode, decision } });
}

export function useMemoryStatus() {
  return useQuery({
    queryKey: memoryStatusQueryKey,
    queryFn: () => request('/memory/status', { schema: memoryStatusSchema }),
    retry: false,
  });
}

export function useMemoryComputers() {
  return useQuery({
    queryKey: memoryComputersQueryKey,
    queryFn: () => request('/memory/computers', { schema: memoryComputersSchema }),
    retry: false,
  });
}

/** PATCH (204): troca o nome. */
export function renameMemoryComputer(id: string, name: string): Promise<void> {
  return request(`/memory/computers/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name } });
}

/** DELETE (204): revoga a chave do computador. Efeito imediato. */
export function revokeMemoryComputer(id: string): Promise<void> {
  return request(`/memory/computers/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export const memoryProjectsQueryKey = ['memory', 'projects'] as const;
export const memoryProjectQueryKey = (id: string) => ['memory', 'projects', id] as const;
export const adminTeamQueryKey = ['admin', 'team'] as const;
export const adminSyncQueryKey = ['admin', 'memory-sync'] as const;

const projectPath = (id: string) => `/memory/projects/${encodeURIComponent(id)}`;
const memberPath = (id: string, email: string) => `${projectPath(id)}/members/${encodeURIComponent(email)}`;

export function useMemoryProjects() {
  return useQuery({
    queryKey: memoryProjectsQueryKey,
    queryFn: () => request('/memory/projects', { schema: memoryProjectsSchema }),
    retry: false,
  });
}

export function useMemoryProject(id: string) {
  return useQuery({
    queryKey: memoryProjectQueryKey(id),
    queryFn: () => request(projectPath(id), { schema: memoryProjectDetailSchema }),
    retry: false,
  });
}

/** POST (201): cria um projeto do qual a pessoa é dona. */
export function createMemoryProject(name: string): Promise<MemoryProject> {
  return request('/memory/projects', { method: 'POST', body: { name }, schema: memoryProjectSchema });
}

/** PUT (204): convida por e-mail @ufba.br ou muda o nível. Só o dono. O e-mail vai codificado no caminho. */
export function setMemoryProjectMember(id: string, email: string, level: MemberLevel): Promise<void> {
  return request(memberPath(id, email), { method: 'PUT', body: { level } });
}

/** DELETE (204): o dono remove alguém; um membro sai usando o PRÓPRIO e-mail. */
export function removeMemoryProjectMember(id: string, email: string): Promise<void> {
  return request(memberPath(id, email), { method: 'DELETE' });
}

/** POST (204): passa a posse para um membro ativo com escrita. Quem transferiu continua com escrita. */
export function transferMemoryProject(id: string, email: string): Promise<void> {
  return request(`${projectPath(id)}/transfer`, { method: 'POST', body: { email } });
}

/** DELETE (204): apaga o projeto e o conteúdo no memory. Irreversível. */
export function deleteMemoryProject(id: string): Promise<void> {
  return request(projectPath(id), { method: 'DELETE' });
}

export function useAdminTeam() {
  return useQuery({
    queryKey: adminTeamQueryKey,
    queryFn: () => request('/admin/team', { schema: adminTeamSchema }),
    retry: false,
  });
}

/** Busca para escolher quem vira mantenedor. Só consulta com 2 letras ou mais. */
export function useAdminPeopleSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['admin', 'team-people', q] as const,
    queryFn: () => request(`/admin/team/people?q=${encodeURIComponent(q)}`, { schema: adminTeamSearchSchema }),
    enabled: q.length >= 2,
    retry: false,
  });
}

export function useAdminMemorySync() {
  return useQuery({
    queryKey: adminSyncQueryKey,
    queryFn: () => request('/admin/memory/sync', { schema: adminMemorySyncSchema }),
    retry: false,
  });
}

const rolePath = (userId: string, roleKey: string) =>
  `/admin/team/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleKey)}`;

/** PUT (204), corpo `{}`: atribui um papel. */
export function assignTeamRole(userId: string, roleKey: string): Promise<void> {
  return request(rolePath(userId, roleKey), { method: 'PUT', body: {} });
}

/** DELETE (204): retira um papel. */
export function unassignTeamRole(userId: string, roleKey: string): Promise<void> {
  return request(rolePath(userId, roleKey), { method: 'DELETE' });
}
