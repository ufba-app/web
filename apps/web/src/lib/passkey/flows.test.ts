import { ApiError } from '../../api/client';
import * as api from '../../api/passkey';
import { fromBase64Url, toBase64Url } from './bytes';
import { activatePasskey, approvePairing, openDkWithPasskey, unlockWithPasskey, userIdBytes } from './flows';
import { newEphemeral, openFromPhone } from './pairing';
import { openDk, sealDk } from './vault';
import * as webauthn from './webauthn';

vi.mock('../../api/passkey');
vi.mock('./webauthn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./webauthn')>()),
  createPasskey: vi.fn(),
  getPrf: vi.fn(),
}));

// Tudo inventado: a criptografia é a real, só o toque na digital e a rede são simulados.
const USER_ID = '6f0f9c1e-6f1d-4f43-9d52-0d3a8a8b9e11';
const CREDENTIAL_ID = new Uint8Array(16).fill(0xaa);
const OTHER_CREDENTIAL_ID = new Uint8Array(16).fill(0xbb);
const SALT = new Uint8Array(32).fill(0x07);
const PRF = new Uint8Array(32).fill(0x11);
const DK = Uint8Array.from({ length: 32 }, (_, i) => 200 - i);
const PAIR_ID = 'AAECAwQFBgcICQoLDA0ODw';

const mocked = vi.mocked(api);
const mockedAuthn = vi.mocked(webauthn);

const passkeyRow = (id: Uint8Array) => ({ credentialId: toBase64Url(id), prfSalt: toBase64Url(SALT), label: 'iPhone', createdAt: '2026-11-15T10:00:00Z', lastUnlockedAt: null });

async function seedSlot(credentialId = CREDENTIAL_ID, prf = PRF) {
  const sealed = await sealDk(prf, userIdBytes(USER_ID), credentialId, DK);
  mocked.listPasskeys.mockResolvedValue({ passkeys: [passkeyRow(credentialId)] });
  mocked.getPasskeySlot.mockResolvedValue({ prfSalt: toBase64Url(SALT), iv: toBase64Url(sealed.iv), ciphertext: toBase64Url(sealed.ciphertext) });
}

const logs = () => [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'info')];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('activatePasskey', () => {
  const input = { userId: USER_ID, userName: 'marina', displayName: 'Marina', label: 'iPhone de Marina' };

  it('cria a passkey, cifra a DK, grava a cópia e a cópia gravada abre com o PRF e dá a mesma DK', async () => {
    const spies = logs();
    mockedAuthn.createPasskey.mockResolvedValue(CREDENTIAL_ID);
    mockedAuthn.getPrf.mockResolvedValue({ credentialId: CREDENTIAL_ID, prf: new Uint8Array(PRF) });
    mocked.fetchSigaaKey.mockResolvedValue(toBase64Url(DK));
    mocked.savePasskey.mockResolvedValue(undefined);
    const onChecking = vi.fn();

    await expect(activatePasskey({ ...input, onChecking })).resolves.toEqual({ ok: true });

    expect(onChecking).toHaveBeenCalledOnce();
    const saved = mocked.savePasskey.mock.calls[0]?.[0];
    expect(saved?.credentialId).toBe(toBase64Url(CREDENTIAL_ID));
    expect(saved?.label).toBe('iPhone de Marina');
    expect(fromBase64Url(saved?.prfSalt ?? '')).toHaveLength(32);
    const opened = await openDk(PRF, userIdBytes(USER_ID), CREDENTIAL_ID, fromBase64Url(saved?.iv ?? ''), fromBase64Url(saved?.ciphertext ?? ''));
    expect([...opened]).toEqual([...DK]);
    // A DK nunca vai a log.
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('o PRF que sela a DK vem de um get (o mesmo caminho do desbloqueio), com o salt gravado', async () => {
    mockedAuthn.createPasskey.mockResolvedValue(CREDENTIAL_ID);
    mockedAuthn.getPrf.mockResolvedValue({ credentialId: CREDENTIAL_ID, prf: new Uint8Array(PRF) });
    mocked.fetchSigaaKey.mockResolvedValue(toBase64Url(DK));
    mocked.savePasskey.mockResolvedValue(undefined);
    await activatePasskey(input);
    const [credentials] = mockedAuthn.getPrf.mock.calls[0] ?? [];
    expect(toBase64Url(credentials?.[0]?.salt ?? new Uint8Array())).toBe(mocked.savePasskey.mock.calls[0]?.[0].prfSalt);
  });

  it.each([
    ['cancelou o toque', () => mockedAuthn.createPasskey.mockRejectedValue(new webauthn.PasskeyError('cancelled')), 'cancelled'],
    ['aparelho sem PRF', () => mockedAuthn.createPasskey.mockRejectedValue(new webauthn.PasskeyError('unsupported')), 'unsupported'],
    ['erro inesperado', () => mockedAuthn.createPasskey.mockRejectedValue(new Error('boom')), 'failed'],
  ])('na criação: %s', async (_name, arrange, reason) => {
    arrange();
    await expect(activatePasskey(input)).resolves.toEqual({ ok: false, reason });
    expect(mocked.fetchSigaaKey).not.toHaveBeenCalled();
    expect(mocked.savePasskey).not.toHaveBeenCalled();
  });

  it('SIGAA não aberto nesta sessão (409): not_connected, e nada é gravado', async () => {
    mockedAuthn.createPasskey.mockResolvedValue(CREDENTIAL_ID);
    mockedAuthn.getPrf.mockResolvedValue({ credentialId: CREDENTIAL_ID, prf: new Uint8Array(PRF) });
    mocked.fetchSigaaKey.mockRejectedValue(new ApiError(409, 'source_not_connected', 'Conecte o SIGAA.'));
    await expect(activatePasskey(input)).resolves.toEqual({ ok: false, reason: 'not_connected' });
    expect(mocked.savePasskey).not.toHaveBeenCalled();
  });

  it('limite de 5 passkeys (409): limit', async () => {
    mockedAuthn.createPasskey.mockResolvedValue(CREDENTIAL_ID);
    mockedAuthn.getPrf.mockResolvedValue({ credentialId: CREDENTIAL_ID, prf: new Uint8Array(PRF) });
    mocked.fetchSigaaKey.mockResolvedValue(toBase64Url(DK));
    mocked.savePasskey.mockRejectedValue(new ApiError(409, 'passkey_limit_reached', 'Limite.'));
    await expect(activatePasskey(input)).resolves.toEqual({ ok: false, reason: 'limit' });
  });
});

describe('openDkWithPasskey e unlockWithPasskey', () => {
  it('abre a DK da passkey que respondeu e a manda ao unlock (nunca a senha)', async () => {
    await seedSlot();
    mockedAuthn.getPrf.mockResolvedValue({ credentialId: CREDENTIAL_ID, prf: new Uint8Array(PRF) });
    mocked.unlockSigaa.mockResolvedValue(undefined);

    await expect(unlockWithPasskey({ userId: USER_ID })).resolves.toEqual({ ok: true });

    expect(mocked.unlockSigaa).toHaveBeenCalledOnce();
    expect(mocked.unlockSigaa).toHaveBeenCalledWith(toBase64Url(DK));
    expect(mocked.getPasskeySlot).toHaveBeenCalledWith(toBase64Url(CREDENTIAL_ID));
  });

  it('com várias passkeys, usa a cópia da que respondeu', async () => {
    const sealed = await sealDk(PRF, userIdBytes(USER_ID), OTHER_CREDENTIAL_ID, DK);
    mocked.listPasskeys.mockResolvedValue({ passkeys: [passkeyRow(CREDENTIAL_ID), passkeyRow(OTHER_CREDENTIAL_ID)] });
    mocked.getPasskeySlot.mockResolvedValue({ prfSalt: toBase64Url(SALT), iv: toBase64Url(sealed.iv), ciphertext: toBase64Url(sealed.ciphertext) });
    mockedAuthn.getPrf.mockResolvedValue({ credentialId: OTHER_CREDENTIAL_ID, prf: new Uint8Array(PRF) });
    const result = await openDkWithPasskey({ userId: USER_ID });
    expect(result.ok && [...result.dk]).toEqual([...DK]);
    expect(mocked.getPasskeySlot).toHaveBeenCalledWith(toBase64Url(OTHER_CREDENTIAL_ID));
    expect(mockedAuthn.getPrf.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it('sem nenhuma passkey guardada: no_passkey, sem pedir a digital', async () => {
    mocked.listPasskeys.mockResolvedValue({ passkeys: [] });
    await expect(openDkWithPasskey({ userId: USER_ID })).resolves.toEqual({ ok: false, reason: 'no_passkey' });
    expect(mockedAuthn.getPrf).not.toHaveBeenCalled();
  });

  it('a passkey que respondeu não é nenhuma das guardadas: no_passkey', async () => {
    await seedSlot();
    mockedAuthn.getPrf.mockResolvedValue({ credentialId: OTHER_CREDENTIAL_ID, prf: new Uint8Array(PRF) });
    await expect(openDkWithPasskey({ userId: USER_ID })).resolves.toEqual({ ok: false, reason: 'no_passkey' });
    expect(mocked.getPasskeySlot).not.toHaveBeenCalled();
  });

  it('cancelou a digital: cancelled', async () => {
    await seedSlot();
    mockedAuthn.getPrf.mockRejectedValue(new webauthn.PasskeyError('cancelled'));
    await expect(unlockWithPasskey({ userId: USER_ID })).resolves.toEqual({ ok: false, reason: 'cancelled' });
    expect(mocked.unlockSigaa).not.toHaveBeenCalled();
  });

  it('PRF diferente (outro gerenciador): a cópia não abre e cai na senha (unsupported), sem chamar o unlock', async () => {
    await seedSlot();
    mockedAuthn.getPrf.mockResolvedValue({ credentialId: CREDENTIAL_ID, prf: new Uint8Array(32).fill(0x99) });
    await expect(unlockWithPasskey({ userId: USER_ID })).resolves.toEqual({ ok: false, reason: 'unsupported' });
    expect(mocked.unlockSigaa).not.toHaveBeenCalled();
  });

  it('o servidor recusa a chave (422 invalid_credentials): rejected, para a tela cair na senha', async () => {
    await seedSlot();
    mockedAuthn.getPrf.mockResolvedValue({ credentialId: CREDENTIAL_ID, prf: new Uint8Array(PRF) });
    mocked.unlockSigaa.mockRejectedValue(new ApiError(422, 'invalid_credentials', 'A chave não abriu a senha guardada. Digite a senha do SIGAA.'));
    await expect(unlockWithPasskey({ userId: USER_ID })).resolves.toEqual({ ok: false, reason: 'rejected' });
  });

  it('erro de rede no unlock: failed', async () => {
    await seedSlot();
    mockedAuthn.getPrf.mockResolvedValue({ credentialId: CREDENTIAL_ID, prf: new Uint8Array(PRF) });
    mocked.unlockSigaa.mockRejectedValue(new ApiError(0, 'network_error', 'Sem rede.'));
    await expect(unlockWithPasskey({ userId: USER_ID })).resolves.toEqual({ ok: false, reason: 'failed' });
  });
});

describe('approvePairing (no celular)', () => {
  it('lacra a DK para a chave do computador e entrega ao correio: só o computador abre', async () => {
    await seedSlot();
    mockedAuthn.getPrf.mockResolvedValue({ credentialId: CREDENTIAL_ID, prf: new Uint8Array(PRF) });
    mocked.deliverPairing.mockResolvedValue(undefined);
    const computer = await newEphemeral();

    await expect(approvePairing({ userId: USER_ID, pairId: PAIR_ID, computerPub: computer.pub })).resolves.toEqual({ ok: true });

    const [id, sealed] = mocked.deliverPairing.mock.calls[0] ?? [];
    expect(id).toBe(PAIR_ID);
    expect([...(await openFromPhone(PAIR_ID, computer, sealed as never))]).toEqual([...DK]);
    // A DK em claro nunca vai ao correio.
    expect(JSON.stringify(sealed)).not.toContain(toBase64Url(DK));
  });

  it('este celular não tem a senha guardada: no_passkey, sem entregar nada', async () => {
    mocked.listPasskeys.mockResolvedValue({ passkeys: [] });
    const computer = await newEphemeral();
    await expect(approvePairing({ userId: USER_ID, pairId: PAIR_ID, computerPub: computer.pub })).resolves.toEqual({ ok: false, reason: 'no_passkey' });
    expect(mocked.deliverPairing).not.toHaveBeenCalled();
  });

  it.each([
    ['pedido vencido ou de outra conta (404)', new ApiError(404, 'pairing_not_found', 'x')],
    ['já respondido (409)', new ApiError(409, 'pairing_already_delivered', 'x')],
  ])('%s: expired', async (_name, error) => {
    await seedSlot();
    mockedAuthn.getPrf.mockResolvedValue({ credentialId: CREDENTIAL_ID, prf: new Uint8Array(PRF) });
    mocked.deliverPairing.mockRejectedValue(error);
    const computer = await newEphemeral();
    await expect(approvePairing({ userId: USER_ID, pairId: PAIR_ID, computerPub: computer.pub })).resolves.toEqual({ ok: false, reason: 'expired' });
  });

  it('cancelou a digital: cancelled', async () => {
    await seedSlot();
    mockedAuthn.getPrf.mockRejectedValue(new webauthn.PasskeyError('cancelled'));
    const computer = await newEphemeral();
    await expect(approvePairing({ userId: USER_ID, pairId: PAIR_ID, computerPub: computer.pub })).resolves.toEqual({ ok: false, reason: 'cancelled' });
    expect(mocked.deliverPairing).not.toHaveBeenCalled();
  });
});
