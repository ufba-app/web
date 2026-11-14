const PLACEHOLDER_ORIGIN = 'https://placeholder.invalid';

/**
 * Caminho de retorno depois do login. Só aceita caminho relativo do próprio web:
 * nada de outro host, de `//host`, de barra invertida nem de esquema. Qualquer outra coisa cai no `fallback`.
 */
export function safeReturnPath(value: string | null | undefined, fallback = '/connections'): string {
  if (typeof value !== 'string' || value === '') return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  let url: URL;
  try {
    url = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Logo do app só é mostrado se vier da própria API (que baixa e valida a imagem).
 * A CSP já impede o resto, mas não confiamos só nela.
 */
export function isTrustedLogoUrl(value: string | null | undefined, apiUrl: string): value is string {
  if (typeof value !== 'string') return false;
  try {
    const logo = new URL(value);
    const api = new URL(apiUrl);
    return logo.origin === api.origin && (logo.protocol === 'https:' || logo.protocol === 'http:');
  } catch {
    return false;
  }
}

const BLOCKED_PROTOCOLS = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'blob:']);

/**
 * O backend manda `redirectTo` já pronto e pede que o web não o monte nem valide. Só barramos o que
 * executaria código ou não é um endereço: clientes MCP podem usar esquemas próprios, então não limitamos a http(s).
 */
export function isSafeRedirectTarget(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false;
  try {
    const url = new URL(value);
    return !BLOCKED_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

/** Id do pedido de autorização dentro de um caminho de retorno como `/authorize?request=abc`. */
export function requestIdFromReturnPath(returnPath: string | null | undefined): string | null {
  const safe = safeReturnPath(returnPath, '');
  if (!safe) return null;
  const url = new URL(safe, PLACEHOLDER_ORIGIN);
  if (url.pathname !== '/authorize') return null;
  const id = url.searchParams.get('request');
  return id && id.length > 0 ? id : null;
}
