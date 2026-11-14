import { z } from 'zod/mini';

/** Formato de erro de toda a API, exceto /authorize, /token e /register (WEB-API.md, seção 4). */
export const apiErrorBodySchema = z.object({
  error: z.string(),
  message: z.string(),
});

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;

/** Códigos que a API documenta. A API pode devolver outros; por isso o tipo aceita qualquer string. */
export type KnownErrorCode =
  | 'invalid_request'
  | 'session_expired'
  | 'csrf_rejected'
  | 'request_not_found'
  | 'not_found'
  | 'request_already_used'
  | 'request_expired'
  | 'source_not_connected'
  | 'account_ambiguous'
  | 'invalid_credentials'
  | 'too_many_attempts'
  // Vínculo fixo da conta com o SIGAA (CPF) e com o AVA (usuário), nos dois sentidos (WEB-API.md, seção 5).
  // A mensagem em pt-BR já vem da API; só um "excluir a conta" troca o titular.
  | 'source_account_mismatch'
  | 'source_account_taken'
  | 'source_account_not_owned'
  | 'not_supported'
  | 'source_unavailable'
  | 'internal_error';

/** Códigos só do web, nunca vindos da API. */
export type ClientErrorCode = 'network_error' | 'invalid_response';
