import { launchSigaa } from '../api/connections';
import { assertNavigableUrl, launchErrorText } from '../lib/launchError';

/** O que a página faz fora dela mesma (trocável nos testes: o jsdom não navega nem fecha janela). */
export type OpeningNav = {
  /** Segue para a URL da API, trocando esta página no histórico. */
  replace(url: string): void;
  close(): void;
  /** Volta para o painel nesta mesma aba. */
  home(): void;
};

const defaultNav: OpeningNav = {
  replace: (url) => window.location.replace(url),
  close: () => window.close(),
  home: () => window.location.assign('/connections'),
};

/**
 * Página que o "Abrir o SIGAA já logado" abre numa aba nova (`/opening.html`). É ELA que pede o link à API e segue
 * para ele, em vez de o painel controlar a aba de longe: num app instalado a janela do painel fica em segundo plano
 * e o navegador pode não deixá-la navegar a aba da frente. Enquanto espera, mostra só o brasão piscando.
 *
 * - O pedido é o mesmo do painel (mesma origem: sessão, `X-UFBA` e corpo `{}`) e o token de uso único (30 s) só nasce
 *   agora, quando a página já está na frente.
 * - A senha nunca passa por aqui: a página só recebe a URL e faz `location.replace`, uma navegação de página inteira
 *   (nunca `fetch`: a API recusa com 403).
 * - Se algo falhar (SIGAA fechado, limite, sessão vencida, rede), o erro aparece NESTA aba, com botões para voltar ao
 *   painel e para fechar a aba. Texto sempre via `textContent`, nunca HTML.
 */
export async function runOpening(root: HTMLElement, nav: OpeningNav = defaultNav): Promise<void> {
  try {
    const { launchUrl } = await launchSigaa();
    nav.replace(assertNavigableUrl(launchUrl));
  } catch (error) {
    showError(root, launchErrorText(error), nav);
  }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function showError(root: HTMLElement, message: string, nav: OpeningNav): void {
  const title = element('h1', 'opening__title', 'Não deu para abrir o SIGAA');
  const text = element('p', 'opening__message', message);
  const hint = element('p', 'opening__hint');
  hint.setAttribute('aria-live', 'polite');

  const home = element('button', 'opening__button opening__button--primary', 'Voltar ao painel');
  home.type = 'button';
  home.addEventListener('click', () => nav.home());

  const close = element('button', 'opening__button', 'Fechar esta aba');
  close.type = 'button';
  close.addEventListener('click', () => {
    nav.close();
    // Alguns navegadores só fecham aba que o script abriu; se esta continuar aqui, diz o que fazer.
    setTimeout(() => {
      hint.textContent = 'Se a aba não fechou sozinha, feche-a pelo navegador.';
    }, 250);
  });

  const actions = element('div', 'opening__actions');
  actions.append(home, close);
  const card = element('div', 'opening__card');
  card.setAttribute('role', 'alert');
  card.append(title, text, actions, hint);

  root.replaceChildren(card); // some o brasão piscando
  root.removeAttribute('role');
  home.focus();
}
