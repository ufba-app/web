import { useQuery } from '@tanstack/react-query';
import { authorizeDecisionSchema, authorizeRequestSchema } from '../contract';
import { request } from './client';

const path = (id: string) => `/authorize/requests/${encodeURIComponent(id)}`;

/** Funciona sem sessão (devolve `signedIn: false`), por isso o tratador global de 401 fica de fora. */
export function fetchAuthorizeRequest(id: string) {
  return request(path(id), { schema: authorizeRequestSchema, handleSessionExpired: false });
}

export function useAuthorizeRequest(id: string | null) {
  return useQuery({
    queryKey: ['authorize-request', id],
    queryFn: () => fetchAuthorizeRequest(id as string),
    enabled: id !== null,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}

export type Decision = 'approve' | 'deny';

/** Devolve a URL para onde o web navega, exatamente como a API mandou. */
export async function decideAuthorizeRequest(id: string, decision: Decision): Promise<string> {
  const result = await request(`${path(id)}/${decision}`, {
    method: 'POST',
    body: {},
    schema: authorizeDecisionSchema,
  });
  return result.redirectTo;
}
