import type { z } from 'zod/mini';
import { apiErrorBodySchema, type ClientErrorCode, type KnownErrorCode } from '../contract';

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly code: KnownErrorCode | ClientErrorCode | (string & {});

  constructor(status: number, code: ApiError['code'], message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const GENERIC_MESSAGE = 'Algo deu errado. Tente de novo em instantes.';
const NETWORK_MESSAGE = 'Não deu para falar com o ufba.app. Verifique sua conexão e tente de novo.';
const INVALID_RESPONSE_MESSAGE = 'O servidor respondeu algo inesperado. Tente de novo em instantes.';

type SessionExpiredHandler = () => void;
let sessionExpiredHandler: SessionExpiredHandler | null = null;

/** Um único lugar decide o que fazer com `401 session_expired` (o app manda para /sign-in). */
export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  sessionExpiredHandler = handler;
}

export type RequestOptions<T> = {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  /** Valida a resposta. A API é a fronteira não confiável: nada chega às telas sem passar por aqui. */
  schema?: z.ZodMiniType<T>;
  signal?: AbortSignal;
  /** Padrão: true. Desligue onde 401 é um resultado esperado (ex.: GET /me para saber se há sessão). */
  handleSessionExpired?: boolean;
};

/**
 * Chamada direta do navegador à API, com o cookie de sessão (`credentials: 'include'`).
 * Rotas que mudam estado levam `X-UFBA: 1` e, quando há corpo, `Content-Type: application/json` (WEB-API.md, seção 3).
 */
export async function request<T = void>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') headers['X-UFBA'] = '1';
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (cause) {
    // Cancelamento não é falha de rede. Checa pelo nome (e não por `instanceof DOMException`), que não vale entre contextos.
    if (typeof cause === 'object' && cause !== null && (cause as { name?: unknown }).name === 'AbortError') throw cause;
    throw new ApiError(0, 'network_error', NETWORK_MESSAGE);
  }

  if (!response.ok) {
    const body = apiErrorBodySchema.safeParse(await response.json().catch(() => null));
    const error = body.success
      ? new ApiError(response.status, body.data.error, body.data.message)
      : new ApiError(response.status, 'internal_error', GENERIC_MESSAGE);
    if (response.status === 401 && error.code === 'session_expired' && options.handleSessionExpired !== false) {
      sessionExpiredHandler?.();
    }
    throw error;
  }

  if (response.status === 204) return undefined as T;

  const json: unknown = await response.json().catch(() => undefined);
  if (!options.schema) return json as T;
  const parsed = options.schema.safeParse(json);
  if (!parsed.success) throw new ApiError(response.status, 'invalid_response', INVALID_RESPONSE_MESSAGE);
  return parsed.data;
}

/** Navegação de página inteira para uma rota da API (ex.: /connections/classroom/start). Não é fetch. */
export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}
