import { ApiError } from '../../api/client';
import {
  deletePasskey,
  deliverPairing,
  fetchSigaaKey,
  getPasskeySlot,
  listPasskeys,
  savePasskey,
  unlockSigaa,
} from '../../api/passkey';
import { fromBase64Url, randomBytes, toBase64Url, type Bytes } from './bytes';
import { sealForComputer } from './pairing';
import { openDk, sealDk } from './vault';
import { createPasskey, getPrf, PasskeyError, toPrfCredentials } from './webauthn';

/**
 * Os fluxos da chave mestra, do começo ao fim. Cada um devolve um resultado tipado (nada de exceção para a tela
 * decidir o que mostrar) e **descarta a DK** (`fill(0)`) em qualquer desfecho. Nada aqui escreve a DK, o PRF ou o
 * `userId` em log, URL, erro ou `localStorage`.
 *
 * Qualquer falha cai no mesmo lugar para a pessoa: digitar a senha do SIGAA (o desenho garante que ela sempre existe).
 */

const SALT_LENGTH = 32;
const encoder = new TextEncoder();

/** O `userId` do AAD é o id da conta (`GET /me`) em UTF-8: o mesmo em todos os aparelhos da pessoa. */
export const userIdBytes = (id: string): Bytes => encoder.encode(id);

const wipe = (bytes: Uint8Array | null | undefined) => bytes?.fill(0);

export type ActivateResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'unsupported' | 'limit' | 'not_connected' | 'failed' };

/**
 * Ativar este celular (SIGAA aberto nesta sessão): cria a passkey, pega o PRF com um `get` (o mesmo caminho do
 * desbloqueio), cifra a DK, grava e confere que a cópia abre. Se a conferência falha, remove a cópia e avisa que o
 * aparelho não serve (autoteste: nunca declara ativo o que não vai abrir depois).
 * São duas confirmações com a digital (criar e usar), por isso o desenho tem o passo "Conferindo".
 */
export async function activatePasskey(input: {
  userId: string;
  userName: string;
  displayName: string;
  label: string;
  onChecking?: () => void;
}): Promise<ActivateResult> {
  const user = userIdBytes(input.userId);
  const salt = randomBytes(SALT_LENGTH);
  let dk: Bytes | null = null;
  let prf: Bytes | null = null;
  let credentialId: Bytes | null = null;
  try {
    credentialId = await createPasskey({ userId: user, userName: input.userName, displayName: input.displayName, salt });
    input.onChecking?.();
    const got = await getPrf([{ id: credentialId, salt }]);
    prf = got.prf;

    dk = fromBase64Url(await fetchSigaaKey());
    const { iv, ciphertext } = await sealDk(prf, user, credentialId, dk);
    await savePasskey({
      credentialId: toBase64Url(credentialId),
      prfSalt: toBase64Url(salt),
      iv: toBase64Url(iv),
      ciphertext: toBase64Url(ciphertext),
      label: input.label,
    });

    // Autoteste: a cópia gravada tem de abrir com o PRF e dar a mesma DK.
    const reopened = await openDk(prf, user, credentialId, iv, ciphertext);
    const same = reopened.length === dk.length && reopened.every((byte, index) => byte === dk?.[index]);
    wipe(reopened);
    if (!same) {
      await deletePasskey(toBase64Url(credentialId)).catch(() => undefined);
      return { ok: false, reason: 'unsupported' };
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof PasskeyError) return { ok: false, reason: error.kind };
    if (error instanceof ApiError) {
      if (error.code === 'passkey_limit_reached') return { ok: false, reason: 'limit' };
      if (error.code === 'source_not_connected') return { ok: false, reason: 'not_connected' };
    }
    return { ok: false, reason: 'failed' };
  } finally {
    wipe(dk);
    wipe(prf);
  }
}

export type OpenResult =
  | { ok: true; dk: Bytes }
  | { ok: false; reason: 'cancelled' | 'unsupported' | 'no_passkey' | 'failed' };

/**
 * Abre a DK com a passkey deste aparelho: lista as passkeys (e os salts), pede a digital, busca a cópia da passkey que
 * respondeu e a abre com o PRF. Quem chama é dono do `dk` devolvido e precisa descartá-lo (`fill(0)`).
 */
export async function openDkWithPasskey(input: { userId: string }): Promise<OpenResult> {
  const user = userIdBytes(input.userId);
  let prf: Bytes | null = null;
  try {
    const { passkeys } = await listPasskeys();
    if (passkeys.length === 0) return { ok: false, reason: 'no_passkey' };
    const got = await getPrf(toPrfCredentials(passkeys));
    prf = got.prf;
    const credentialId = toBase64Url(got.credentialId);
    // A passkey que respondeu pode não ser nenhuma das que o servidor guarda (outra conta, passkey removida).
    if (!passkeys.some((item) => item.credentialId === credentialId)) return { ok: false, reason: 'no_passkey' };
    const slot = await getPasskeySlot(credentialId);
    const dk = await openDk(prf, user, got.credentialId, fromBase64Url(slot.iv), fromBase64Url(slot.ciphertext));
    return { ok: true, dk };
  } catch (error) {
    if (error instanceof PasskeyError) return { ok: false, reason: error.kind };
    if (error instanceof ApiError && error.code === 'passkey_not_found') return { ok: false, reason: 'no_passkey' };
    // A cópia não abre com este PRF (outro aparelho, PRF diferente entre gerenciadores): cai na senha.
    return { ok: false, reason: 'unsupported' };
  } finally {
    wipe(prf);
  }
}

export type UnlockResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'unsupported' | 'no_passkey' | 'rejected' | 'failed' };

/** Desbloquear o SIGAA neste aparelho (a DK vem da passkey) sem a senha passar pelo navegador. */
export async function unlockWithPasskey(input: { userId: string }): Promise<UnlockResult> {
  const opened = await openDkWithPasskey(input);
  if (!opened.ok) return { ok: false, reason: opened.reason === 'failed' ? 'failed' : opened.reason };
  try {
    await unlockSigaa(toBase64Url(opened.dk));
    return { ok: true };
  } catch (error) {
    // 422 `invalid_credentials`: a chave não abriu a senha guardada. 409: o cofre não existe mais.
    if (error instanceof ApiError && (error.code === 'invalid_credentials' || error.code === 'source_not_connected')) {
      return { ok: false, reason: 'rejected' };
    }
    return { ok: false, reason: 'failed' };
  } finally {
    wipe(opened.dk);
  }
}

export type ApproveResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'unsupported' | 'no_passkey' | 'expired' | 'failed' };

/**
 * No CELULAR: confirma com a digital, abre a DK da passkey daqui e a lacra para a chave pública do computador (que
 * veio no fragmento do QR) antes de entregar ao correio. A DK nunca sai do celular em claro.
 */
export async function approvePairing(input: { userId: string; pairId: string; computerPub: Uint8Array }): Promise<ApproveResult> {
  const opened = await openDkWithPasskey({ userId: input.userId });
  if (!opened.ok) return { ok: false, reason: opened.reason };
  try {
    const sealed = await sealForComputer(input.pairId, input.computerPub, opened.dk);
    await deliverPairing(input.pairId, sealed);
    return { ok: true };
  } catch (error) {
    // 404: venceu ou é de outra conta. 409 `pairing_already_delivered`: já foi respondido.
    if (error instanceof ApiError && (error.status === 404 || error.code === 'pairing_already_delivered')) {
      return { ok: false, reason: 'expired' };
    }
    return { ok: false, reason: 'failed' };
  } finally {
    wipe(opened.dk);
  }
}

/**
 * No CELULAR, sem passkey para abrir a DK (primeira vez, ou aparelho sem PRF): o SIGAA está aberto NESTA sessão, então a
 * DK vem do `GET /connections/sigaa/key` e é lacrada para o computador do mesmo jeito. Nada a ver com a digital: quem
 * decide é o toque em "Liberar". A DK vive só neste escopo e é zerada ao fim.
 */
export async function approvePairingWithSession(input: { pairId: string; computerPub: Uint8Array }): Promise<ApproveResult> {
  let dk: Bytes | null = null;
  try {
    dk = fromBase64Url(await fetchSigaaKey());
    const sealed = await sealForComputer(input.pairId, input.computerPub, dk);
    await deliverPairing(input.pairId, sealed);
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.code === 'pairing_already_delivered')) {
      return { ok: false, reason: 'expired' };
    }
    return { ok: false, reason: 'failed' };
  } finally {
    wipe(dk);
  }
}
