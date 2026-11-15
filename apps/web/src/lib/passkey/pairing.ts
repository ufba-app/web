import { concatBytes, fromBase64Url, toBase64Url, type Bytes } from './bytes';

/**
 * Pareamento por QR (computador <-> celular da mesma conta). A API é só o "correio": guarda bytes que não abre.
 *
 *   QR     = <origem do painel>/pair#<id>.<chave pública P-256 do computador>.<nome do aparelho>
 *            (o fragmento `#…` o navegador nunca manda ao servidor: por isso a chave pública vai nele)
 *   chave  = HKDF-SHA256(ECDH(P-256), salt = id, info = "ufba.app/pair/v1" || pubComputador || pubCelular)  (AES-256-GCM)
 *   pacote = AES-256-GCM(chave, iv de 96 bits, AAD = id, texto = a DK crua de 32 bytes)
 *
 * O `id` é o que a API devolve em `POST /pairings` (16 bytes em base64url, 22 caracteres); no lacre entra o texto do
 * `id`, em bytes UTF-8, o mesmo que o computador e o celular veem.
 */

const encoder = new TextEncoder();
const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;

export const PAIR_INFO_PREFIX = 'ufba.app/pair/v1';
export const PAIR_PATH = '/pair';
const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const PUB_PATTERN = /^[A-Za-z0-9_-]{87}$/;
const MAX_LABEL = 60;

export type Ephemeral = { privateKey: CryptoKey; pub: Bytes };

/** Par P-256 descartável: a parte privada não é extraível e nunca sai da memória da aba. */
export async function newEphemeral(): Promise<Ephemeral> {
  const pair = await crypto.subtle.generateKey(ECDH, false, ['deriveBits']);
  return { privateKey: pair.privateKey, pub: new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)) };
}

async function sessionKey(
  privateKey: CryptoKey,
  peerPub: Uint8Array,
  pairId: string,
  computerPub: Uint8Array,
  phonePub: Uint8Array,
): Promise<CryptoKey> {
  const peer = await crypto.subtle.importKey('raw', new Uint8Array(peerPub), ECDH, false, []);
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256);
  const ikm = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(pairId),
      info: concatBytes(encoder.encode(PAIR_INFO_PREFIX), computerPub, phonePub),
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export type SealedPackage = { pub: string; iv: string; ciphertext: string };

/** No CELULAR: lacra a DK para a chave pública do computador (que veio no fragmento do QR). */
export async function sealForComputer(pairId: string, computerPub: Uint8Array, dk: Uint8Array): Promise<SealedPackage> {
  const phone = await newEphemeral();
  const key = await sessionKey(phone.privateKey, computerPub, pairId, computerPub, phone.pub);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(pairId) }, key, new Uint8Array(dk));
  return { pub: toBase64Url(phone.pub), iv: toBase64Url(iv), ciphertext: toBase64Url(new Uint8Array(sealed)) };
}

/** No COMPUTADOR: abre o pacote que o celular entregou ao correio. Lança se não for para esta chave e este pedido. */
export async function openFromPhone(pairId: string, computer: Ephemeral, delivered: SealedPackage): Promise<Bytes> {
  const phonePub = fromBase64Url(delivered.pub);
  const key = await sessionKey(computer.privateKey, phonePub, pairId, computer.pub, phonePub);
  const opened = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(fromBase64Url(delivered.iv)), additionalData: encoder.encode(pairId) },
    key,
    new Uint8Array(fromBase64Url(delivered.ciphertext)),
  );
  return new Uint8Array(opened);
}

export function buildPairUrl(origin: string, pairId: string, computerPub: Uint8Array, label: string): string {
  return `${origin}${PAIR_PATH}#${pairId}.${toBase64Url(computerPub)}.${encodeURIComponent(label.slice(0, MAX_LABEL))}`;
}

export type PairFragment = { pairId: string; computerPub: Bytes };

/**
 * Lê o fragmento do QR. Só o `id` e a chave pública valem (formato fixo); o nome do aparelho que vai no fragmento é
 * ignorado de propósito: o celular mostra o `label` que vem do servidor (`GET /pairings/{id}/info`), não texto de link.
 */
export function parsePairFragment(hash: string): PairFragment | null {
  const [pairId, pub] = hash.replace(/^#/, '').split('.');
  if (!pairId || !pub || !ID_PATTERN.test(pairId) || !PUB_PATTERN.test(pub)) return null;
  const computerPub = fromBase64Url(pub);
  return computerPub.length === 65 && computerPub[0] === 4 ? { pairId, computerPub } : null;
}

/** "Firefox no Windows": o nome que o computador dá a si mesmo ao abrir o pedido (a API aceita até 60 caracteres). */
export function deviceLabel(userAgent: string = navigator.userAgent): string {
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Navegador';
  const system = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad/.test(userAgent)
        ? 'iPhone'
        : /Mac OS/.test(userAgent)
          ? 'Mac'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'outro sistema';
  return `${browser} no ${system}`;
}
