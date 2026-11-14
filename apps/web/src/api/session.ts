import { request } from './client';

/** POST /session: troca o code do PKCE pelo cookie de sessão (204). Corpo em camelCase, como o contrato manda. */
export function createSession(body: { code: string; codeVerifier: string; redirectUri: string }): Promise<void> {
  return request('/session', { method: 'POST', body, handleSessionExpired: false });
}

/** DELETE /session: sai da conta, apaga a sessão e a senha do SIGAA guardada para o web (204). */
export function deleteSession(): Promise<void> {
  return request('/session', { method: 'DELETE', handleSessionExpired: false });
}
