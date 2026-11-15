/** Página do próprio painel (`opening.html`, entrada do Vite) que pede o link à API e segue para o SIGAA. */
export const OPENING_PAGE = '/opening.html';

/**
 * "Abrir o SIGAA já logado". Tem que ser chamada DIRETO do clique (é o que impede o bloqueador de popup).
 *
 * O painel só abre a aba; quem pede o link de uso único à API e segue para ele é a própria aba (`src/opening`). Antes o
 * painel esperava a API e então navegava a aba de longe, e num app instalado (PWA) a janela do painel fica em segundo
 * plano e o navegador pode não deixá-la navegar a aba da frente: a aba ficava parada no brasão piscando.
 *
 * - A aba nova perde a ligação com o painel (`opener = null`): a página do SIGAA não alcança o painel.
 * - Se o navegador bloqueou a janela, a mesma página abre nesta aba (e segue para o SIGAA daqui).
 * - Erros (SIGAA fechado, limite de aberturas, sessão vencida, rede) aparecem na aba que abriu, não num toast.
 */
export function openSigaaLoggedIn(): void {
  const popup = window.open(OPENING_PAGE, '_blank');
  if (popup) popup.opener = null;
  else window.location.assign(OPENING_PAGE);
}
