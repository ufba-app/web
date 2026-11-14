import { moodleStartSchema, type MoodleStart } from '../contract';
import { apiUrl, request } from './client';

/**
 * A senha do SIGAA vai direto do navegador para a API (nunca por proxy nem servidor do web).
 * De propósito não usamos `useMutation`: ele guardaria a senha nas variáveis da mutação, em memória.
 */
export function connectSigaa(credentials: { login: string; password: string }): Promise<void> {
  return request('/connections/sigaa', { method: 'POST', body: credentials });
}

/** DELETE /connections/sigaa (204, sem corpo). */
export function disconnectSigaa(): Promise<void> {
  return request('/connections/sigaa', { method: 'DELETE' });
}

/** DELETE /connections/moodle (204, sem corpo). */
export function disconnectMoodle(): Promise<void> {
  return request('/connections/moodle', { method: 'DELETE' });
}

export function startMoodle(): Promise<MoodleStart> {
  return request('/connections/moodle/start', { method: 'POST', body: {}, schema: moodleStartSchema });
}

export function captureMoodle(link: string): Promise<void> {
  return request('/connections/moodle', { method: 'POST', body: { link } });
}

export function removeClassroomAccount(email: string): Promise<void> {
  return request(`/connections/classroom/${encodeURIComponent(email)}`, { method: 'DELETE' });
}

export type ClassroomApp = 'ufba' | 'guest';

/** Navegação de página inteira (não é fetch): a API leva ao Google e volta para /connections. */
export function classroomStartUrl(app: ClassroomApp): string {
  return apiUrl(`/connections/classroom/start?app=${app}`);
}
