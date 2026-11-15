import { useQuery } from '@tanstack/react-query';
import { academicStateSchema, curriculumSchema } from '../contract';
import { request } from './client';

/**
 * Vida acadêmica: importação do histórico (WEB-API.md, seção 5.1). Só o caminho até a importação: consentimento,
 * importar, acompanhar, confirmar e apagar. Resumo, grade (`GET /me/academic/curriculum`) e configurações ficam para depois.
 * O formato das respostas está em `src/contract/academic.ts`.
 */

export const academicQueryKey = ['academic'] as const;

/** Intervalo do acompanhamento enquanto a importação roda em segundo plano (não há campo de etapa, só `RUNNING`). */
export const ACADEMIC_POLL_MS = 3000;

/**
 * GET /me/academic. Consulta de novo sozinho enquanto a importação roda (`RUNNING`) e enquanto a grade do curso está
 * sendo buscada (`curriculumStatus: IMPORTING`).
 */
export function useAcademic() {
  return useQuery({
    queryKey: academicQueryKey,
    queryFn: () => request('/me/academic', { schema: academicStateSchema }),
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === 'RUNNING' || data?.curriculumStatus === 'IMPORTING' ? ACADEMIC_POLL_MS : false;
    },
  });
}

export const curriculumQueryKey = ['academic', 'curriculum'] as const;

/**
 * GET /me/academic/curriculum: a grade do curso marcada com o que a pessoa já fez (sempre estimativa).
 * 404 `import_not_found` sem histórico; 409 `curriculum_unavailable` enquanto a grade não existe.
 */
export function useCurriculum(enabled: boolean) {
  return useQuery({
    queryKey: curriculumQueryKey,
    queryFn: () => request('/me/academic/curriculum', { schema: curriculumSchema }),
    enabled,
    retry: false,
    staleTime: 30_000,
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

/**
 * DELETE /me/academic/draft (204): descarta só o rascunho (ou a falha) de uma leitura. O histórico gravado fica: volta a
 * `READY` se havia histórico, ou a `NONE` se não havia. Erros: 409 `import_in_progress` (ainda lendo), 404
 * `import_not_found` (não há nada a descartar).
 */
export function discardAcademicDraft(): Promise<void> {
  return request('/me/academic/draft', { method: 'DELETE' });
}

/** DELETE /me/academic (204): apaga histórico, rascunho e perfil. O aceite do consentimento fica. */
export function deleteAcademic(): Promise<void> {
  return request('/me/academic', { method: 'DELETE' });
}
