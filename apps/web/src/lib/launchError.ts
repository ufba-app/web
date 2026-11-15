import { ApiError } from '../api/client';

/** Só navegação http(s): uma URL `javascript:` ou `data:` nunca pode ir parar na barra de endereço. */
export function assertNavigableUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('launch_url_invalid');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('launch_url_invalid');
  return url.toString();
}

/** Texto para quando "Abrir o SIGAA já logado" falha (aparece na própria aba que abriu, não num toast). */
export function launchErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'source_not_connected') return 'Libere o SIGAA neste navegador antes de abri-lo.';
    if (error.code === 'session_expired') return 'Sua sessão venceu. Entre de novo no painel.';
    // A API limita a 6 aberturas por 10 minutos.
    if (error.code === 'too_many_attempts') return 'Muitas aberturas seguidas. Espere alguns minutos e tente de novo.';
    return error.message;
  }
  return 'Não deu para abrir o SIGAA agora. Tente de novo.';
}
