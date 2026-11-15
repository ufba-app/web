import { z } from 'zod/mini';

/** Formato de erro de toda a API, exceto /authorize, /token e /register (WEB-API.md, seção 4). */
export const apiErrorBodySchema = z.object({
  error: z.string(),
  message: z.string(),
});

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;

/**
 * Códigos que a API documenta (enum `ApiError.error` do openapi.json). A API pode devolver outros; por isso o tipo
 * aceita qualquer string. `openapi.contract.test.ts` falha se esta lista divergir da API.
 */
export const knownErrorCodes = [
  'invalid_request',
  'session_expired',
  'csrf_rejected',
  'request_not_found',
  'not_found',
  'request_expired',
  'source_not_connected',
  'account_ambiguous',
  'invalid_credentials',
  'too_many_attempts',
  // Vínculo fixo da conta com o SIGAA (CPF) e com o AVA (usuário), nos dois sentidos (WEB-API.md, seção 5).
  // A mensagem em pt-BR já vem da API; só um "excluir a conta" troca o titular.
  'source_account_mismatch',
  'source_account_taken',
  'source_account_not_owned',
  'not_supported',
  'source_unavailable',
  'internal_error',
  // Chave mestra (passkey) e correio do QR.
  'passkey_limit_reached',
  'passkey_not_found',
  'pairing_not_found',
  'pairing_already_delivered',
  // Memória (device flow, computadores, projetos e papéis do time): as telas são de outra frente.
  'device_code_invalid',
  'device_code_expired',
  'computer_limit_reached',
  'computer_not_found',
  'memory_unavailable',
  'memory_forbidden',
  'project_not_found',
  'project_name_taken',
  'not_project_owner',
  'invalid_email_domain',
  'not_admin',
  'role_not_found',
] as const;

export type KnownErrorCode = (typeof knownErrorCodes)[number];

/** Códigos só do web, nunca vindos da API. */
export type ClientErrorCode = 'network_error' | 'invalid_response';
