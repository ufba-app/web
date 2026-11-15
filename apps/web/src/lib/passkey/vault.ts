import { concatBytes, type Bytes } from './bytes';

/**
 * Cópia da DK (chave de dados do cofre da senha do SIGAA) guardada sob a passkey.
 *
 *   KEK   = HKDF-SHA256(ikm = PRF, salt = vazio, info = "ufba.app/sigaa-master/v1" || userId)  (AES-256-GCM, não extraível)
 *   cópia = AES-256-GCM(KEK, iv de 96 bits, AAD = userId || credentialId || "2", texto = a DK crua de 32 bytes)
 *
 * O servidor só guarda `iv` e `ciphertext` (opacos). O PRF nunca sai do aparelho onde a passkey mora. O "2" no AAD é a
 * versão do conteúdo (a versão "1" guardava `{ login, password }`; ver os docs/specs da API).
 * A DK é segredo: nunca em log, URL, erro, `localStorage` nem asserção de teste que a imprima.
 */

const encoder = new TextEncoder();

export const KEK_INFO_PREFIX = 'ufba.app/sigaa-master/v1';
export const SLOT_VERSION = '2';
export const DK_LENGTH = 32;
const IV_LENGTH = 12;

async function deriveKek(prf: Uint8Array, userId: Uint8Array): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey('raw', new Uint8Array(prf), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: concatBytes(encoder.encode(KEK_INFO_PREFIX), userId) },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function slotAad(userId: Uint8Array, credentialId: Uint8Array): Bytes {
  return concatBytes(userId, credentialId, encoder.encode(SLOT_VERSION));
}

export async function sealDk(
  prf: Uint8Array,
  userId: Uint8Array,
  credentialId: Uint8Array,
  dk: Uint8Array,
  iv: Bytes = crypto.getRandomValues(new Uint8Array(IV_LENGTH)),
): Promise<{ iv: Bytes; ciphertext: Bytes }> {
  if (dk.length !== DK_LENGTH) throw new Error('DK com tamanho inesperado');
  const kek = await deriveKek(prf, userId);
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: slotAad(userId, credentialId) },
    kek,
    new Uint8Array(dk),
  );
  return { iv, ciphertext: new Uint8Array(sealed) };
}

/** Lança se o PRF, o `userId` ou o `credentialId` não forem os da cópia (a autenticação do AES-GCM falha). */
export async function openDk(
  prf: Uint8Array,
  userId: Uint8Array,
  credentialId: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Bytes> {
  const kek = await deriveKek(prf, userId);
  const opened = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv), additionalData: slotAad(userId, credentialId) },
      kek,
      new Uint8Array(ciphertext),
    ),
  );
  if (opened.length !== DK_LENGTH) throw new Error('DK com tamanho inesperado');
  return opened;
}
