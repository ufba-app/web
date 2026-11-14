import { panelUrl } from '../lib/origins';
import { requestIdFromReturnPath, safeReturnPath } from '../lib/safe';

export type Destination =
  /** Fica dentro do auth (navegação do React Router). */
  | { kind: 'auth'; to: string }
  /** Sai para o painel (navegação de página inteira, com a origem fixa do build). */
  | { kind: 'panel'; url: string };

/**
 * Para onde a pessoa vai depois do login. Só `/authorize?request=<id>` continua no auth; qualquer outro caminho
 * relativo seguro vai ao painel. Valor inseguro (`//host`, `/\host`, `https://…`, `javascript:`) cai no padrão do
 * painel. A origem nunca vem do valor recebido.
 */
export function resolveDestination(returnTo: string | null | undefined): Destination {
  const requestId = requestIdFromReturnPath(returnTo);
  if (requestId) return { kind: 'auth', to: `/authorize?request=${encodeURIComponent(requestId)}` };
  return { kind: 'panel', url: panelUrl(safeReturnPath(returnTo)) };
}

/** Sai do auth para um caminho do painel (navegação de página inteira). */
export function goToPanel(path: string): void {
  window.location.assign(panelUrl(path));
}
