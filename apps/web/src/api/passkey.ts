import { useQuery } from '@tanstack/react-query';
import {
  pairingCreatedSchema,
  pairingInfoSchema,
  pairingReadSchema,
  passkeyListSchema,
  passkeySlotSchema,
  sigaaKeySchema,
  type PairingCreated,
  type PairingInfo,
  type PairingRead,
  type PasskeyList,
  type PasskeySlot,
} from '../contract';
import { request } from './client';

/**
 * Chave mestra (passkey) e correio do QR. A criptografia roda toda no navegador (`src/lib/passkey`); a API só guarda
 * e devolve bytes opacos.
 *
 * Aqui NÃO há `useMutation` nem `useQuery` para nada que carregue a DK ou o pacote lacrado: o TanStack Query guardaria
 * o valor no cache e nas variáveis da mutação, em memória, por mais tempo que o necessário. A DK é segredo: nunca em
 * log, URL, erro nem `localStorage`. Quem chama usa o valor e o descarta (`dk.fill(0)`).
 */

export const passkeysQueryKey = ['sigaa-passkeys'] as const;

/** GET /sigaa/passkey: o `prfSalt` não é segredo e o navegador precisa dele antes do toque. */
export function listPasskeys(): Promise<PasskeyList> {
  return request('/sigaa/passkey', { schema: passkeyListSchema });
}

/** A lista de celulares ativados (nome, datas): só metadados, nenhum segredo. */
export function usePasskeys(enabled = true) {
  return useQuery({ queryKey: passkeysQueryKey, queryFn: listPasskeys, enabled, retry: false, staleTime: 30_000 });
}

/** POST /sigaa/passkey (204). Exige o SIGAA aberto nesta sessão (409 `source_not_connected`) e o limite de 5 (409). */
export function savePasskey(input: { credentialId: string; prfSalt: string; iv: string; ciphertext: string; label?: string }): Promise<void> {
  return request('/sigaa/passkey', { method: 'POST', body: input });
}

/** POST /sigaa/passkey/slot: o id vai no corpo, não na URL. */
export function getPasskeySlot(credentialId: string): Promise<PasskeySlot> {
  return request('/sigaa/passkey/slot', { method: 'POST', body: { credentialId }, schema: passkeySlotSchema });
}

/** DELETE /sigaa/passkey/{credentialId} (204): a conexão do SIGAA não muda. */
export function deletePasskey(credentialId: string): Promise<void> {
  return request(`/sigaa/passkey/${encodeURIComponent(credentialId)}`, { method: 'DELETE' });
}

/** GET /connections/sigaa/key: a DK em base64url (32 bytes). Exige o SIGAA aberto nesta sessão (409). Segredo. */
export async function fetchSigaaKey(): Promise<string> {
  const { dk } = await request('/connections/sigaa/key', { schema: sigaaKeySchema, csrf: true });
  return dk;
}

/** POST /connections/sigaa/unlock (204): abre o cofre com a DK. 422 `invalid_credentials` se a chave não abrir. */
export function unlockSigaa(dk: string): Promise<void> {
  return request('/connections/sigaa/unlock', { method: 'POST', body: { dk } });
}

/** POST /pairings (201): o computador abre o pedido do QR (vale 5 min; até 3 abertos por pessoa). */
export function createPairing(input: { label?: string; client?: string }): Promise<PairingCreated> {
  return request('/pairings', { method: 'POST', body: input, schema: pairingCreatedSchema });
}

/** GET /pairings/{id}/info: o celular mostra o que está liberando (404 se for de outra conta ou venceu). */
export function getPairingInfo(id: string): Promise<PairingInfo> {
  return request(`/pairings/${encodeURIComponent(id)}/info`, { schema: pairingInfoSchema });
}

/** POST /pairings/{id} (204): o celular entrega o pacote lacrado. Uma vez só (409 `pairing_already_delivered`). */
export function deliverPairing(id: string, sealed: { pub: string; iv: string; ciphertext: string }): Promise<void> {
  return request(`/pairings/${encodeURIComponent(id)}`, { method: 'POST', body: sealed });
}

/** GET /pairings/{id}: o computador consulta a cada ~1,5 s; ao entregar, a leitura apaga o pedido (uso único). */
export function readPairing(id: string, signal?: AbortSignal): Promise<PairingRead> {
  return request(`/pairings/${encodeURIComponent(id)}`, { schema: pairingReadSchema, signal });
}
