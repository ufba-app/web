/** `Uint8Array` sobre um `ArrayBuffer` próprio: é o que o WebCrypto aceita como `BufferSource`. */
export type Bytes = Uint8Array<ArrayBuffer>;

export function concatBytes(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** base64url sem preenchimento (o formato de todos os campos binários da API). */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const BASE64URL = /^[A-Za-z0-9_-]*$/;

/** Lança se o texto não for base64url válido (nada de decodificar lixo em silêncio). */
export function fromBase64Url(text: string): Bytes {
  if (!BASE64URL.test(text) || text.length % 4 === 1) throw new Error('base64url inválido');
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length));
}
