import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { createPairing, readPairing, unlockSigaa } from '../../api/passkey';
import { toBase64Url } from '../../lib/passkey/bytes';
import { buildPairUrl, deviceLabel, newEphemeral, openFromPhone, type Ephemeral } from '../../lib/passkey/pairing';
import { getPanelOrigin } from '../../lib/origins';

/**
 * Lado do COMPUTADOR do QR: abre o pedido no correio, mostra o link, consulta a cada ~1,5 s, abre o pacote que o
 * celular lacrou e chama o `unlock` com a DK. A chave privada descartável fica só em memória (um `ref`).
 * A DK nunca vai a estado, log ou erro: é aberta, usada uma vez e zerada.
 */

export const POLL_MS = 1500;

export type PairingStatus =
  /** abrindo o pedido */
  | 'creating'
  /** QR na tela, esperando o celular */
  | 'waiting'
  /** o celular respondeu: abrindo o pacote e liberando */
  | 'answered'
  | 'unlocked'
  /** passaram os 5 minutos (ou o pedido sumiu) */
  | 'expired'
  | 'error';

export type PairingState = {
  status: PairingStatus;
  url: string | null;
  /** Segundos que faltam (0 quando venceu). */
  secondsLeft: number;
  /** Fração do tempo que ainda resta, de 1 a 0, para a barra de progresso. */
  fraction: number;
  /** Texto pt-BR do erro de criação do pedido (limite, rede). */
  message: string | null;
};

const EMPTY: PairingState = { status: 'creating', url: null, secondsLeft: 0, fraction: 1, message: null };

export function usePairing(options: { enabled: boolean; client?: string; onUnlocked: () => void }): PairingState & { regenerate: () => void } {
  const { enabled, client, onUnlocked } = options;
  const [state, setState] = useState<PairingState>(EMPTY);
  const [round, setRound] = useState(0);
  const onUnlockedRef = useRef(onUnlocked);
  onUnlockedRef.current = onUnlocked;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const controller = new AbortController();
    const ephemeralRef: { current: Ephemeral | null } = { current: null };

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    const patch = (next: Partial<PairingState>) => alive && setState((current) => ({ ...current, ...next }));

    void (async () => {
      setState(EMPTY);
      let id: string;
      let expiresAt: number;
      try {
        const ephemeral = await newEphemeral();
        ephemeralRef.current = ephemeral;
        const created = await createPairing({ label: deviceLabel(), ...(client ? { client } : {}) });
        id = created.id;
        expiresAt = Date.parse(created.expiresAt);
        if (!alive) return;
        patch({ status: 'waiting', url: buildPairUrl(getPanelOrigin(), id, ephemeral.pub, deviceLabel()) });
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Não deu para gerar o QR agora. Tente de novo.';
        patch({ status: 'error', message });
        return;
      }

      const total = Math.max(expiresAt - Date.now(), 1);
      let busy = false;
      const tick = async () => {
        if (!alive || busy) return;
        const left = expiresAt - Date.now();
        patch({ secondsLeft: Math.max(0, Math.ceil(left / 1000)), fraction: Math.max(0, Math.min(1, left / total)) });
        if (left <= 0) {
          stop();
          patch({ status: 'expired', secondsLeft: 0, fraction: 0 });
          return;
        }
        busy = true;
        try {
          const read = await readPairing(id, controller.signal);
          if (!alive || read.status !== 'delivered' || !read.pub || !read.iv || !read.ciphertext || !ephemeralRef.current) return;
          stop();
          patch({ status: 'answered' });
          const dk = await openFromPhone(id, ephemeralRef.current, { pub: read.pub, iv: read.iv, ciphertext: read.ciphertext });
          try {
            await unlockSigaa(toBase64Url(dk));
          } finally {
            dk.fill(0);
          }
          if (!alive) return;
          patch({ status: 'unlocked' });
          onUnlockedRef.current();
        } catch (error) {
          if (!alive) return;
          // 404: o pedido venceu ou já foi lido. Falha de rede: tenta de novo no próximo ciclo (só enquanto esperava).
          if (error instanceof ApiError && error.status === 404) {
            stop();
            patch({ status: 'expired' });
          } else if (timer === undefined) {
            patch({ status: 'error', message: error instanceof ApiError ? error.message : 'Não deu para liberar agora. Digite a senha do SIGAA.' });
          }
        } finally {
          busy = false;
        }
      };
      timer = setInterval(() => void tick(), POLL_MS);
      void tick();
    })();

    return () => {
      alive = false;
      stop();
      controller.abort();
      ephemeralRef.current = null;
    };
  }, [enabled, client, round]);

  const regenerate = useCallback(() => setRound((value) => value + 1), []);
  return { ...state, regenerate };
}
