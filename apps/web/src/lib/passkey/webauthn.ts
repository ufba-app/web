import { fromBase64Url, randomBytes, toBase64Url, type Bytes } from './bytes';

/**
 * WebAuthn com a extensão PRF: a passkey só serve de "detentora de chave" (quem autentica a pessoa é o cookie de
 * sessão). O PRF nunca sai do aparelho onde a passkey mora e nunca é enviado a lugar nenhum.
 *
 * Suporte se descobre TENTANDO: `getClientCapabilities` não serve (o Safari omite o PRF mesmo funcionando e o Firefox
 * diz que tem e descarta o resultado). Regra: criar a passkey e exigir 32 bytes de PRF num `get`.
 */

export const PRF_LENGTH = 32;
const TIMEOUT_MS = 120_000;

export type PasskeyFailure = 'cancelled' | 'unsupported';

export class PasskeyError extends Error {
  readonly kind: PasskeyFailure;
  constructor(kind: PasskeyFailure) {
    super(kind);
    this.name = 'PasskeyError';
    this.kind = kind;
  }
}

export function hasWebAuthn(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined' && !!navigator.credentials;
}

/**
 * "Parece celular": o navegador se declara móvel E o toque é o jeito principal de apontar. Um PC comum não passa nas
 * duas. É uma dedução (celular com "ver como computador" ligado se comporta como PC); a oferta de ativar só aparece
 * em quem passa, mas a lista de celulares ativados oferece "Ativar mais um celular" de qualquer aparelho.
 */
export function looksLikePhone(): boolean {
  if (typeof navigator === 'undefined') return false;
  const hint = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile;
  const mobile = typeof hint === 'boolean' ? hint : /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
  const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return mobile && touch;
}

/** O RP ID é o domínio-pai (`ufba.app`): vale para `meu.ufba.app` e `auth.ufba.app`. Fora disso (localhost), o próprio host. */
export function rpIdFor(hostname: string = location.hostname): string {
  return hostname === 'ufba.app' || hostname.endsWith('.ufba.app') ? 'ufba.app' : hostname;
}

type PrfOutput = { results?: { first?: BufferSource } };

function prfFrom(credential: PublicKeyCredential): Bytes | null {
  const first = (credential.getClientExtensionResults() as { prf?: PrfOutput }).prf?.results?.first;
  if (!first) return null;
  // Cópia para um `ArrayBuffer` próprio: o PRF devolvido pelo navegador não pode ser zerado por quem o recebeu.
  const view = first instanceof ArrayBuffer ? new Uint8Array(first) : new Uint8Array(first.buffer, first.byteOffset, first.byteLength);
  const bytes: Bytes = Uint8Array.from(view);
  return bytes.length === PRF_LENGTH ? bytes : null;
}

function asFailure(error: unknown): PasskeyError {
  const name = (error as { name?: unknown } | null)?.name;
  return new PasskeyError(name === 'NotAllowedError' || name === 'AbortError' ? 'cancelled' : 'unsupported');
}

/**
 * Cria a passkey (descobrível, com verificação do usuário). Devolve só o id: o PRF que sela a DK vem de um `get`
 * (`getPrf`), exatamente o que o desbloqueio vai usar. Sem suporte a PRF, `unsupported`.
 */
export async function createPasskey(input: { userId: Uint8Array; userName: string; displayName: string; salt: Uint8Array }): Promise<Bytes> {
  if (!hasWebAuthn()) throw new PasskeyError('unsupported');
  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.create({
      publicKey: {
        rp: { id: rpIdFor(), name: 'ufba.app' },
        user: { id: new Uint8Array(input.userId), name: input.userName, displayName: input.displayName },
        challenge: randomBytes(32),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
        timeout: TIMEOUT_MS,
        extensions: { prf: { eval: { first: new Uint8Array(input.salt) } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
  } catch (error) {
    throw asFailure(error);
  }
  if (!credential) throw new PasskeyError('cancelled');
  const prf = (credential.getClientExtensionResults() as { prf?: { enabled?: boolean } & PrfOutput }).prf;
  // `enabled: false` é "este autenticador não faz PRF". Se nem veio `prf`, deixa o `get` seguinte decidir.
  if (prf && prf.enabled === false && !prf.results?.first) throw new PasskeyError('unsupported');
  return new Uint8Array(credential.rawId);
}

export type PrfCredential = { id: Uint8Array; salt: Uint8Array };

/**
 * Pede a digital e devolve o PRF de uma das passkeys da lista (a que a pessoa escolher/usar), com o `credentialId`
 * dela. `evalByCredential` dá a cada passkey o seu próprio salt (o navegador precisa dele ANTES do toque).
 */
export async function getPrf(credentials: PrfCredential[]): Promise<{ credentialId: Bytes; prf: Bytes }> {
  if (!hasWebAuthn() || credentials.length === 0) throw new PasskeyError('unsupported');
  const evalByCredential: Record<string, { first: Uint8Array }> = {};
  for (const credential of credentials) evalByCredential[toBase64Url(credential.id)] = { first: new Uint8Array(credential.salt) };
  let assertion: PublicKeyCredential | null;
  try {
    assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        rpId: rpIdFor(),
        allowCredentials: credentials.map((credential) => ({ type: 'public-key' as const, id: new Uint8Array(credential.id) })),
        userVerification: 'required',
        timeout: TIMEOUT_MS,
        extensions: { prf: { evalByCredential } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
  } catch (error) {
    throw asFailure(error);
  }
  if (!assertion) throw new PasskeyError('cancelled');
  const prf = prfFrom(assertion);
  if (!prf) throw new PasskeyError('unsupported');
  return { credentialId: new Uint8Array(assertion.rawId), prf };
}

/** O que a API guarda do salt/ids em texto (base64url) vira bytes para o `getPrf`. */
export function toPrfCredentials(items: Array<{ credentialId: string; prfSalt: string }>): PrfCredential[] {
  return items.map((item) => ({ id: fromBase64Url(item.credentialId), salt: fromBase64Url(item.prfSalt) }));
}

