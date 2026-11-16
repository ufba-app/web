import { useQuery } from '@tanstack/react-query';
import { attendanceSchema } from '../contract';
import { request } from './client';

/**
 * GET /sources/sigaa/attendance: a frequência das turmas do semestre, lida ao vivo no SIGAA (até 24 requisições). Só roda
 * ao abrir a tela de Notas e faltas: nada de polling, nem refetch ao voltar para a janela ou reconectar. "Atualizar" é
 * um clique da pessoa (`refetch`).
 */
export function useAttendance(enabled = true) {
  return useQuery({
    queryKey: ['attendance'],
    queryFn: () => request('/sources/sigaa/attendance', { schema: attendanceSchema }),
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });
}
