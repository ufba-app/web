import { toBase64Url } from './bytes';
import { parsePairFragment, type PairFragment } from './pairing';

/**
 * O pedido do QR chega no fragmento do link (`#id.chave`), que o servidor nunca vê. Se o celular ainda não está logado,
 * a pessoa vai ao Google e volta para `/pair` SEM o fragmento (a URL de retorno é só um caminho). Para não perder o
 * pedido, o `id` e a chave PÚBLICA do computador (nada secreto: a privada nunca sai do computador) ficam guardados
 * neste navegador por 5 minutos, o tempo de vida do pedido. É o único jeito de a chave não ir parar numa URL que o
 * servidor veja.
 */
const KEY = 'ufba.pair.pending';
export const STASH_TTL_MS = 5 * 60_000;

type Stored = { pairId: string; pub: string; at: number };

export function saveStash(fragment: PairFragment, now: number = Date.now()): void {
  try {
    const value: Stored = { pairId: fragment.pairId, pub: toBase64Url(fragment.computerPub), at: now };
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // sem armazenamento: o pedido só vale nesta aba, sem passar pelo login
  }
}

export function loadStash(now: number = Date.now()): PairFragment | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<Stored>;
    if (typeof stored.pairId !== 'string' || typeof stored.pub !== 'string' || typeof stored.at !== 'number') return null;
    if (now - stored.at > STASH_TTL_MS || now < stored.at) {
      clearStash();
      return null;
    }
    // Passa pela mesma validação estrita do fragmento.
    return parsePairFragment(`#${stored.pairId}.${stored.pub}`);
  } catch {
    return null;
  }
}

export function clearStash(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nada a limpar
  }
}
