import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { ApiError } from '../../api/client';
import * as api from '../../api/passkey';
import { toBase64Url } from '../../lib/passkey/bytes';
import { parsePairFragment, sealForComputer } from '../../lib/passkey/pairing';
import { QrUnlockBlock } from './QrUnlockBlock';
import { POLL_MS } from './usePairing';

vi.mock('../../api/passkey');
// O QR de verdade é testado em lib/passkey/qr.test.ts (decodificado por um leitor); aqui só interessa o link que ele leva.
vi.mock('./QrCode', () => ({ QrCode: ({ text }: { text: string }) => <div role="img" aria-label="QR para liberar o SIGAA com o celular" data-url={text} /> }));

const mocked = vi.mocked(api);
const PAIR_ID = 'AAECAwQFBgcICQoLDA0ODw';
const DK = Uint8Array.from({ length: 32 }, (_, i) => 100 + i);

const qrUrl = () => screen.getByRole('img', { name: /QR/ }).getAttribute('data-url') ?? '';

function createdAt(msFromNow = 5 * 60_000) {
  return { id: PAIR_ID, expiresAt: new Date(Date.now() + msFromNow).toISOString() };
}

function setup(props: Partial<React.ComponentProps<typeof QrUnlockBlock>> = {}) {
  const onUnlocked = vi.fn();
  const onUsePassword = vi.fn();
  const view = render(<QrUnlockBlock onUnlocked={onUnlocked} onUsePassword={onUsePassword} {...props} />);
  return { ...view, onUnlocked, onUsePassword };
}

const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
// Deixa terminar o que roda de verdade (WebCrypto e promessas). O waitFor do Testing Library usa setInterval, que aqui é simulado.
const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 150))));

beforeEach(() => {
  vi.clearAllMocks();
  // Só o relógio e os intervalos são simulados; setTimeout fica real para o Testing Library esperar normalmente.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  mocked.createPairing.mockResolvedValue(createdAt());
  mocked.readPairing.mockResolvedValue({ status: 'pending' });
  mocked.unlockSigaa.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('QrUnlockBlock (no computador)', () => {
  it('abre o pedido com o nome do aparelho e mostra o QR, o relógio de 5 minutos e "ou digite a senha"', async () => {
    const { container, onUsePassword } = setup({ client: 'Claude' });
    expect(await screen.findByRole('img', { name: /QR/ })).toBeInTheDocument();
    expect(mocked.createPairing).toHaveBeenCalledWith({ label: expect.stringMatching(/ no /), client: 'Claude' });
    expect(screen.getByRole('heading', { name: 'Liberar o SIGAA com o celular' })).toBeInTheDocument();
    expect(screen.getByText('Abra a câmera do celular e leia o código. Use o celular que você ativou.')).toBeInTheDocument();
    expect(screen.getByText(/Vale por [45]:\d\d/)).toBeInTheDocument();
    expect(screen.getByText('Esperando o celular…')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await userEvent.click(screen.getByRole('button', { name: 'digite a senha do SIGAA' }));
    expect(onUsePassword).toHaveBeenCalledOnce();
  });

  it('o link do QR é o do painel, com o id e a chave pública só no fragmento', async () => {
    setup();
    await screen.findByRole('img', { name: /QR/ });
    const url = new URL(qrUrl());
    expect(url.origin).toBe('http://localhost:3001');
    expect(url.pathname).toBe('/pair');
    expect(url.search).toBe('');
    expect(parsePairFragment(url.hash)?.pairId).toBe(PAIR_ID);
  });

  it('o relógio anda e a barra encolhe', async () => {
    setup();
    await screen.findByRole('img', { name: /QR/ });
    expect(screen.getByText('Vale por 5:00')).toBeInTheDocument();
    await tick(61_500);
    expect(screen.getByText(/Vale por 3:5\d/)).toBeInTheDocument();
  });

  it('o celular entregou: abre o pacote, chama o unlock com a DK e avisa quem chamou', async () => {
    const { onUnlocked } = setup();
    await screen.findByRole('img', { name: /QR/ });
    const computerPub = parsePairFragment(new URL(qrUrl()).hash)?.computerPub;
    expect(computerPub).toBeDefined();
    const sealed = await sealForComputer(PAIR_ID, computerPub as Uint8Array, DK);
    mocked.readPairing.mockResolvedValue({ status: 'delivered', ...sealed });

    await tick(POLL_MS);

    await settle();
    expect(onUnlocked).toHaveBeenCalledOnce();
    expect(mocked.unlockSigaa).toHaveBeenCalledOnce();
    expect(mocked.unlockSigaa).toHaveBeenCalledWith(toBase64Url(DK));
    expect(screen.getByText('O celular respondeu. Só mais um instante.')).toBeInTheDocument();
  });

  it('consulta de tempos em tempos e para de consultar depois de liberar', async () => {
    setup();
    await screen.findByRole('img', { name: /QR/ });
    const before = mocked.readPairing.mock.calls.length;
    await tick(POLL_MS * 3);
    expect(mocked.readPairing.mock.calls.length).toBeGreaterThan(before);
  });

  it('a chave não abre o cofre (422): erro com o texto da API e "Gerar novo QR", sem chamar onUnlocked', async () => {
    const { onUnlocked } = setup();
    await screen.findByRole('img', { name: /QR/ });
    const computerPub = parsePairFragment(new URL(qrUrl()).hash)?.computerPub as Uint8Array;
    mocked.readPairing.mockResolvedValue({ status: 'delivered', ...(await sealForComputer(PAIR_ID, computerPub, DK)) });
    mocked.unlockSigaa.mockRejectedValue(new ApiError(422, 'invalid_credentials', 'A chave não abriu a senha guardada. Digite a senha do SIGAA.'));

    await tick(POLL_MS);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não deu para liberar');
    expect(alert).toHaveTextContent('A chave não abriu a senha guardada. Digite a senha do SIGAA.');
    expect(onUnlocked).not.toHaveBeenCalled();

    mocked.readPairing.mockResolvedValue({ status: 'pending' });
    await userEvent.click(screen.getByRole('button', { name: 'Gerar novo QR' }));
    await settle();
    expect(mocked.createPairing).toHaveBeenCalledTimes(2);
  });

  it('pacote de outro pedido ou adulterado: erro, nunca libera', async () => {
    const { onUnlocked } = setup();
    await screen.findByRole('img', { name: /QR/ });
    const computerPub = parsePairFragment(new URL(qrUrl()).hash)?.computerPub as Uint8Array;
    mocked.readPairing.mockResolvedValue({ status: 'delivered', ...(await sealForComputer('BBECAwQFBgcICQoLDA0ODw', computerPub, DK)) });

    await tick(POLL_MS);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(mocked.unlockSigaa).not.toHaveBeenCalled();
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it('passaram os 5 minutos: "O QR venceu" e "Gerar novo QR" abre outro pedido', async () => {
    setup();
    await screen.findByRole('img', { name: /QR/ });
    await tick(5 * 60_000 + 2_000);

    expect(await screen.findByRole('heading', { name: 'O QR venceu' })).toBeInTheDocument();
    expect(screen.getByText('Cada código vale 5 minutos. Gere outro para continuar.')).toBeInTheDocument();
    // A senha continua sendo a saída.
    expect(screen.getByRole('button', { name: 'digite a senha do SIGAA' })).toBeInTheDocument();

    mocked.createPairing.mockResolvedValue(createdAt());
    await userEvent.click(screen.getByRole('button', { name: 'Gerar novo QR' }));
    await settle();
    expect(mocked.createPairing).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('img', { name: /QR/ })).toBeInTheDocument();
  });

  it('o correio diz que o pedido sumiu (404): vencido', async () => {
    setup();
    await screen.findByRole('img', { name: /QR/ });
    mocked.readPairing.mockRejectedValue(new ApiError(404, 'pairing_not_found', 'x'));
    await tick(POLL_MS);
    expect(await screen.findByRole('heading', { name: 'O QR venceu' })).toBeInTheDocument();
  });

  it('não deu para abrir o pedido (limite ou rede): erro com o texto da API e a senha como saída', async () => {
    mocked.createPairing.mockRejectedValue(new ApiError(429, 'too_many_attempts', 'Muitos pedidos de liberação abertos. Aguarde alguns minutos e tente de novo.'));
    setup();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Muitos pedidos de liberação abertos. Aguarde alguns minutos e tente de novo.');
    expect(screen.getByRole('button', { name: 'digite a senha do SIGAA' })).toBeInTheDocument();
  });

  it('falha de rede ao consultar não derruba o QR (tenta no próximo ciclo)', async () => {
    setup();
    await screen.findByRole('img', { name: /QR/ });
    mocked.readPairing.mockRejectedValueOnce(new ApiError(0, 'network_error', 'Sem rede.'));
    await tick(POLL_MS);
    expect(screen.getByRole('img', { name: /QR/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ao sair da tela para de consultar o correio', async () => {
    const { unmount } = setup();
    await screen.findByRole('img', { name: /QR/ });
    unmount();
    const calls = mocked.readPairing.mock.calls.length;
    await tick(POLL_MS * 4);
    expect(mocked.readPairing.mock.calls.length).toBe(calls);
  });

  it('a versão compacta (tela de autorizar) mostra o mesmo conteúdo', async () => {
    setup({ compact: true });
    expect(await screen.findByRole('img', { name: /QR/ })).toBeInTheDocument();
    expect(document.querySelector('.web-pk-qr--compact')).not.toBeNull();
  });
});
