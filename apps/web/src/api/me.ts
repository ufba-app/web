import { useQuery } from '@tanstack/react-query';
import { meSchema } from '../contract';
import { request } from './client';

export const meQueryKey = ['me'] as const;

/** 401 aqui é um resultado esperado (ninguém logado): quem chama decide, o tratador global não age. */
export function fetchMe() {
  return request('/me', { schema: meSchema, handleSessionExpired: false });
}

export function useMe(options: { refetchInterval?: number | false } = {}) {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: fetchMe,
    retry: false,
    staleTime: 30_000,
    refetchInterval: options.refetchInterval ?? false,
  });
}
