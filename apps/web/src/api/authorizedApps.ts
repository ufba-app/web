import { useQuery } from '@tanstack/react-query';
import { authorizedAppsSchema } from '../contract';
import { request } from './client';

export const authorizedAppsQueryKey = ['authorized-apps'] as const;

export function useAuthorizedApps() {
  return useQuery({
    queryKey: authorizedAppsQueryKey,
    queryFn: () => request('/authorized-apps', { schema: authorizedAppsSchema }),
    retry: false,
  });
}

/** Revogar tem efeito imediato: apaga os tokens do app e a senha do SIGAA cifrada para ele (e as permissões dele). */
export function revokeAuthorizedApp(clientId: string): Promise<void> {
  return request(`/authorized-apps/${encodeURIComponent(clientId)}`, { method: 'DELETE' });
}

/** Retira UMA permissão de um app, sem revogar o app (204; 404 se ele não a tinha). */
export function revokeAppPermission(clientId: string, key: string): Promise<void> {
  return request(`/authorized-apps/${encodeURIComponent(clientId)}/permissions/${encodeURIComponent(key)}`, { method: 'DELETE' });
}
