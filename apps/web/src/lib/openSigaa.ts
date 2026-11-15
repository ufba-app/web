import { launchSigaa } from '../api/connections';

/**
 * Página estática do próprio painel (public/opening.html) com o brasão piscando do boot, no lugar do `about:blank` branco:
 * metade da espera fica nesta aba e a outra metade na página da API. É same-origin e usa a CSP do painel.
 */
const OPENING_PAGE = '/opening.html';

/** Só navegação http(s): uma URL `javascript:` ou `data:` nunca pode ir parar na barra de endereço. */
function assertNavigableUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('launch_url_invalid');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('launch_url_invalid');
  return url.toString();
}

/**
 * "Abrir o SIGAA já logado". Tem que ser chamada DIRETO do clique, antes de qualquer `await`.
 *
 * - A janela abre AQUI, no clique (síncrono). Se abrisse depois do `await` da API, o navegador a trataria como popup
 *   não pedido e a bloquearia. Com ela já aberta, só falta atribuir a URL quando a API responder.
 * - A URL do `launchUrl` é de uso único e vale 30 s, então só é pedida agora, no clique.
 * - A URL é aberta como NAVEGAÇÃO de página inteira, nunca por `fetch`: a API recusa (403) e a senha não pode passar
 *   pelo JavaScript do painel.
 * - A janela nova perde a ligação com o painel (`opener = null`): a página do SIGAA não alcança o painel.
 * - Se o navegador bloqueou a janela, a navegação acontece nesta aba.
 * - Se algo falhar, a janela em branco fecha e o erro volta para quem chamou (que avisa por toast).
 */
export async function openSigaaLoggedIn(): Promise<void> {
  const popup = window.open(OPENING_PAGE, '_blank');
  if (popup) popup.opener = null;
  try {
    const { launchUrl } = await launchSigaa();
    const url = assertNavigableUrl(launchUrl);
    if (popup) popup.location.href = url;
    else window.location.assign(url);
  } catch (error) {
    popup?.close();
    throw error;
  }
}
