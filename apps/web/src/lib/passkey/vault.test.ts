import { createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';
import { toBase64Url } from './bytes';
import { DK_LENGTH, KEK_INFO_PREFIX, openDk, sealDk, slotAad } from './vault';

// Valores inventados (nada real): só servem para travar o formato da cópia da DK sob a passkey.
const text = new TextEncoder();
const PRF = new Uint8Array(32).fill(0x11);
const USER_ID = text.encode('user-0001');
const CREDENTIAL_ID = new Uint8Array(16).fill(0xaa);
const IV = new Uint8Array(12).fill(0x01);
const DK = Uint8Array.from({ length: DK_LENGTH }, (_, i) => i);

/** Mesma conta feita à parte, com o `node:crypto`, para pegar erro de `info`, de salt ou de AAD no WebCrypto. */
function sealWithNode(prf: Uint8Array, userId: Uint8Array, credentialId: Uint8Array, iv: Uint8Array, dk: Uint8Array) {
  const kek = Buffer.from(hkdfSync('sha256', prf, Buffer.alloc(0), Buffer.concat([Buffer.from(KEK_INFO_PREFIX), userId]), 32));
  const cipher = createCipheriv('aes-256-gcm', kek, iv);
  cipher.setAAD(Buffer.concat([userId, credentialId, Buffer.from('2')]));
  return Buffer.concat([cipher.update(dk), cipher.final(), cipher.getAuthTag()]);
}

describe('cópia da DK sob a passkey', () => {
  it('o AAD é userId || credentialId || "2"', () => {
    expect([...slotAad(USER_ID, CREDENTIAL_ID)]).toEqual([...USER_ID, ...CREDENTIAL_ID, 0x32]);
  });

  it('bate byte a byte com o cálculo independente (HKDF + AES-256-GCM do node:crypto)', async () => {
    const { iv, ciphertext } = await sealDk(PRF, USER_ID, CREDENTIAL_ID, DK, IV);
    expect([...iv]).toEqual([...IV]);
    expect(toBase64Url(ciphertext)).toBe(toBase64Url(sealWithNode(PRF, USER_ID, CREDENTIAL_ID, IV, DK)));
    // 32 bytes da DK + 16 da tag do AES-GCM.
    expect(ciphertext.length).toBe(48);
  });

  it('uma cópia feita pelo node:crypto abre no navegador (e a DK volta idêntica)', async () => {
    const sealed = sealWithNode(PRF, USER_ID, CREDENTIAL_ID, IV, DK);
    const opened = await openDk(PRF, USER_ID, CREDENTIAL_ID, IV, new Uint8Array(sealed));
    expect([...opened]).toEqual([...DK]);
  });

  it('ida e volta com PRF, IV e DK aleatórios', async () => {
    const prf = crypto.getRandomValues(new Uint8Array(32));
    const dk = crypto.getRandomValues(new Uint8Array(DK_LENGTH));
    const { iv, ciphertext } = await sealDk(prf, USER_ID, CREDENTIAL_ID, dk);
    expect(iv.length).toBe(12);
    expect([...(await openDk(prf, USER_ID, CREDENTIAL_ID, iv, ciphertext))]).toEqual([...dk]);
  });

  it('o IV muda a cada cópia (a mesma DK não gera o mesmo cifrado)', async () => {
    const a = await sealDk(PRF, USER_ID, CREDENTIAL_ID, DK);
    const b = await sealDk(PRF, USER_ID, CREDENTIAL_ID, DK);
    expect(toBase64Url(a.iv)).not.toBe(toBase64Url(b.iv));
    expect(toBase64Url(a.ciphertext)).not.toBe(toBase64Url(b.ciphertext));
  });

  it('não abre com outro PRF, outra pessoa, outra passkey ou cifrado adulterado', async () => {
    const { iv, ciphertext } = await sealDk(PRF, USER_ID, CREDENTIAL_ID, DK, IV);
    await expect(openDk(new Uint8Array(32).fill(0x12), USER_ID, CREDENTIAL_ID, iv, ciphertext)).rejects.toThrow();
    await expect(openDk(PRF, text.encode('user-0002'), CREDENTIAL_ID, iv, ciphertext)).rejects.toThrow();
    await expect(openDk(PRF, USER_ID, new Uint8Array(16).fill(0xab), iv, ciphertext)).rejects.toThrow();
    const tampered = new Uint8Array(ciphertext);
    tampered[0] = (tampered[0] ?? 0) ^ 1;
    await expect(openDk(PRF, USER_ID, CREDENTIAL_ID, iv, tampered)).rejects.toThrow();
  });

  it('não abre uma cópia do formato antigo (AAD "1", que guardava login e senha)', async () => {
    const kek = Buffer.from(hkdfSync('sha256', PRF, Buffer.alloc(0), Buffer.concat([Buffer.from(KEK_INFO_PREFIX), USER_ID]), 32));
    const cipher = createCipheriv('aes-256-gcm', kek, IV);
    cipher.setAAD(Buffer.concat([USER_ID, CREDENTIAL_ID, Buffer.from('1')]));
    const legacy = Buffer.concat([cipher.update(DK), cipher.final(), cipher.getAuthTag()]);
    await expect(openDk(PRF, USER_ID, CREDENTIAL_ID, IV, new Uint8Array(legacy))).rejects.toThrow();
    // O mesmo decifrador do node, com o AAD certo, confirma que o teste não está quebrado por outro motivo.
    const decipher = createDecipheriv('aes-256-gcm', kek, IV);
    decipher.setAAD(Buffer.concat([USER_ID, CREDENTIAL_ID, Buffer.from('1')]));
    decipher.setAuthTag(legacy.subarray(legacy.length - 16));
    expect([...Buffer.concat([decipher.update(legacy.subarray(0, legacy.length - 16)), decipher.final()])]).toEqual([...DK]);
  });

  it('recusa DK que não tem 32 bytes', async () => {
    await expect(sealDk(PRF, USER_ID, CREDENTIAL_ID, new Uint8Array(31))).rejects.toThrow(/tamanho/);
  });
});
