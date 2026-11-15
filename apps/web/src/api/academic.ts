import { useQuery } from '@tanstack/react-query';
import { academicStateSchema } from '../contract';
import { request } from './client';

/**
 * Vida acadêmica: importação do histórico (WEB-API.md, seção 5.1). Só o caminho até a importação: consentimento,
 * importar, acompanhar, confirmar e apagar. Resumo, grade (`GET /me/academic/curriculum`) e configurações ficam para depois.
 * O formato das respostas está em `src/contract/academic.ts`.
 */

export const academicQueryKey = ['academic'] as const;

/** Intervalo do acompanhamento enquanto a importação roda em segundo plano (não há campo de etapa, só `RUNNING`). */
export const ACADEMIC_POLL_MS = 3000;

/** GET /me/academic. Enquanto `status` for `RUNNING`, consulta de novo sozinho. */
export function useAcademic() {
  return useQuery({
    queryKey: academicQueryKey,
    queryFn: () => request('/me/academic', { schema: academicStateSchema }),
    retry: false,
    refetchInterval: (query) => (query.state.data?.status === 'RUNNING' ? ACADEMIC_POLL_MS : false),
  });
}

/** PUT /me/academic/consent (204). O aceite vem antes de qualquer leitura; revogar é `accepted: false`. */
export function setAcademicConsent(accepted: boolean): Promise<void> {
  return request('/me/academic/consent', { method: 'PUT', body: { accepted } });
}

/**
 * POST /me/academic/import (202; roda em segundo plano). Erros: 409 `consent_required`, 409 `source_not_connected`
 * (SIGAA fechado ou trancado nesta sessão), 409 `import_in_progress`, 429 `too_many_attempts` (3 por dia),
 * 503 `import_unavailable`.
 */
export function startAcademicImport(): Promise<void> {
  return request('/me/academic/import', { method: 'POST', body: {} });
}

/** POST /me/academic/confirm (204): grava o histórico. 404 `import_not_found` se não há rascunho (vale 7 dias). */
export function confirmAcademicImport(): Promise<void> {
  return request('/me/academic/confirm', { method: 'POST', body: {} });
}

/** DELETE /me/academic (204): apaga histórico, rascunho e perfil. O aceite do consentimento fica. */
export function deleteAcademic(): Promise<void> {
  return request('/me/academic', { method: 'DELETE' });
}
