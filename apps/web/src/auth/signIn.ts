import { API_URL, ApiError } from '../api/client';
import { createSession } from '../api/session';
import { getAuthOrigin } from '../lib/origins';
import { safeReturnPath } from '../lib/safe';
import { challengeFor, randomValue } from './pkce';

export const CLIENT_ID = 'ufba-web';
export const CALLBACK_PATH = '/sign-in/callback';

const KEYS = {
  verifier: 'ufba.pkce.verifier',
  state: 'ufba.pkce.state',
  returnTo: 'ufba.pkce.return',
} as const;

export type SignInErrorKind = 'denied' | 'state_mismatch' | 'missing_code' | 'exchange_failed' | 'storage_unavailable';

export class SignInError extends Error {
  readonly kind: SignInErrorKind;

  constructor(kind: SignInErrorKind, message: string) {
    super(message);
    this.name = 'SignInError';
    this.kind = kind;
  }
}

const MESSAGES = {
  denied: 'Use o seu e-mail @ufba.br.',
  state_mismatch: 'Não deu para confirmar o login. Tente entrar de novo.',
  missing_code: 'Não deu para confirmar o login. Tente entrar de novo.',
  exchange_failed: 'Não deu para entrar agora. Tente de novo em instantes.',
  storage_unavailable: 'Seu navegador bloqueou o armazenamento que o login precisa. Libere e tente de novo.',
} as const satisfies Record<SignInErrorKind, string>;

function storageSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    throw new SignInError('storage_unavailable', MESSAGES.storage_unavailable);
  }
}

function storageGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function clearStored(): void {
  try {
    for (const key of Object.values(KEYS)) window.sessionStorage.removeItem(key);
  } catch {
    // sem armazenamento não há o que limpar
  }
}

/** redirect_uri do cliente `ufba-web`: o login começa e termina no auth. Origem fixa do build, não a da janela. */
export function callbackUrl(): string {
  return `${getAuthOrigin()}${CALLBACK_PATH}`;
}

/** Monta a URL de /authorize da API para o login (PKCE com S256). */
export function buildAuthorizeUrl(params: { challenge: string; state: string; redirectUri: string }): string {
  const url = new URL('/authorize', API_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('code_challenge', params.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', params.state);
  return url.toString();
}

/** Começa o login: guarda verifier, state e destino em `sessionStorage` e vai para a API. */
export async function startSignIn(returnTo?: string | null): Promise<void> {
  const verifier = randomValue(32);
  const state = randomValue(16);
  const challenge = await challengeFor(verifier);
  storageSet(KEYS.verifier, verifier);
  storageSet(KEYS.state, state);
  storageSet(KEYS.returnTo, safeReturnPath(returnTo));
  window.location.assign(buildAuthorizeUrl({ challenge, state, redirectUri: callbackUrl() }));
}

/**
 * Termina o login na volta do Google: confere o state (uso único), troca o code pelo cookie e
 * devolve para onde a pessoa ia. Verifier e state são apagados em qualquer desfecho.
 */
export async function completeSignIn(search: URLSearchParams): Promise<string> {
  const expectedState = storageGet(KEYS.state);
  const verifier = storageGet(KEYS.verifier);
  const returnTo = safeReturnPath(storageGet(KEYS.returnTo));
  clearStored();

  const oauthError = search.get('error');
  if (oauthError) {
    // A API manda um texto pt-BR pronto para mostrar (renderizado só como texto).
    const description = search.get('error_description')?.trim();
    throw new SignInError('denied', description || MESSAGES.denied);
  }

  const state = search.get('state');
  if (!state || !expectedState || state !== expectedState || !verifier) {
    throw new SignInError('state_mismatch', MESSAGES.state_mismatch);
  }

  const code = search.get('code');
  if (!code) throw new SignInError('missing_code', MESSAGES.missing_code);

  try {
    await createSession({ code, codeVerifier: verifier, redirectUri: callbackUrl() });
  } catch (error) {
    throw new SignInError('exchange_failed', error instanceof ApiError ? error.message : MESSAGES.exchange_failed);
  }
  return returnTo;
}
