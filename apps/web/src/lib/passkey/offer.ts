/**
 * "Agora não" na oferta de ativar o celular: lembrado só neste navegador (conveniência por aparelho, nada vai ao servidor
 * e nada sensível fica aqui). Limpar os dados do navegador faz a oferta voltar. O armazenamento pode não existir
 * (janela privada, dados bloqueados): nesse caso a oferta simplesmente aparece de novo.
 */
const KEY = 'ufba.passkey.offer.dismissed';

export function isOfferDismissed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissOffer(): void {
  try {
    window.localStorage.setItem(KEY, '1');
  } catch {
    // sem armazenamento: a oferta volta na próxima visita
  }
}

export function resetOffer(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nada a limpar
  }
}
