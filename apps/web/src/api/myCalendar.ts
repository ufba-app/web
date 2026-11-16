import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { myCalendarSchema } from '../contract';
import { request } from './client';

/**
 * GET /me/calendar?from=&to=: o calendário da pessoa já compilado pela API (feriados e dias sem aula, entregas e provas
 * do Moodle e do Classroom, sessões do SIASB para quem tem acesso). O intervalo é o visível na tela (no máximo 62 dias; a
 * grade de um mês cabe). Mantém o intervalo anterior na tela enquanto o novo carrega (trocar de mês não pisca).
 */
export function useMyCalendar(from: string, to: string) {
  return useQuery({
    queryKey: ['my-calendar', from, to],
    queryFn: () => request(`/me/calendar?from=${from}&to=${to}`, { schema: myCalendarSchema }),
    retry: false,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}
