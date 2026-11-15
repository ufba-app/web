import { toBase64Url } from './bytes';
import { buildPairUrl, deviceLabel, newEphemeral, openFromPhone, parsePairFragment, sealForComputer } from './pairing';

const PAIR_ID = 'AAECAwQFBgcICQoLDA0ODw'; // 16 bytes em base64url (22 caracteres), como o id que a API gera
const DK = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);

describe('lacre entre o celular e o computador', () => {
  it('o celular lacra a DK e só o computador (dono da chave privada) abre', async () => {
    const computer = await newEphemeral();
    const sealed = await sealForComputer(PAIR_ID, computer.pub, DK);
    expect([...(await openFromPhone(PAIR_ID, computer, sealed))]).toEqual([...DK]);
  });

  it('os campos do pacote são base64url com os tamanhos que a API espera (pub 65 bytes, iv 12)', async () => {
    const computer = await newEphemeral();
    const sealed = await sealForComputer(PAIR_ID, computer.pub, DK);
    expect(sealed.pub).toMatch(/^[A-Za-z0-9_-]{87}$/);
    expect(sealed.iv).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(sealed.ciphertext).toMatch(/^[A-Za-z0-9_-]{64}$/); // 32 + 16 de tag = 48 bytes
  });

  it('cada lacre é diferente (chave e IV novos), mesmo para a mesma DK', async () => {
    const computer = await newEphemeral();
    const a = await sealForComputer(PAIR_ID, computer.pub, DK);
    const b = await sealForComputer(PAIR_ID, computer.pub, DK);
    expect(a.pub).not.toBe(b.pub);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('não abre com outro pedido (o id entra no salt e no AAD)', async () => {
    const computer = await newEphemeral();
    const sealed = await sealForComputer(PAIR_ID, computer.pub, DK);
    await expect(openFromPhone('BBECAwQFBgcICQoLDA0ODw', computer, sealed)).rejects.toThrow();
  });

  it('não abre com outra chave de computador (um intruso que só viu o pacote)', async () => {
    const computer = await newEphemeral();
    const intruder = await newEphemeral();
    const sealed = await sealForComputer(PAIR_ID, computer.pub, DK);
    await expect(openFromPhone(PAIR_ID, intruder, sealed)).rejects.toThrow();
  });

  it('não abre se alguém troca a chave pública do celular ou adultera o cifrado', async () => {
    const computer = await newEphemeral();
    const other = await newEphemeral();
    const sealed = await sealForComputer(PAIR_ID, computer.pub, DK);
    await expect(openFromPhone(PAIR_ID, computer, { ...sealed, pub: toBase64Url(other.pub) })).rejects.toThrow();
    const flipped = sealed.ciphertext.startsWith('A') ? `B${sealed.ciphertext.slice(1)}` : `A${sealed.ciphertext.slice(1)}`;
    await expect(openFromPhone(PAIR_ID, computer, { ...sealed, ciphertext: flipped })).rejects.toThrow();
  });
});

describe('link do QR', () => {
  it('leva a origem, o caminho /pair e o id e a chave pública só no fragmento', async () => {
    const computer = await newEphemeral();
    const url = new URL(buildPairUrl('https://meu.ufba.app', PAIR_ID, computer.pub, 'Firefox no Windows'));
    expect(url.origin).toBe('https://meu.ufba.app');
    expect(url.pathname).toBe('/pair');
    expect(url.search).toBe('');
    expect(url.hash.startsWith(`#${PAIR_ID}.`)).toBe(true);
    expect(url.hash).toContain(toBase64Url(computer.pub));
  });

  it('o fragmento volta inteiro pelo parse (ida e volta)', async () => {
    const computer = await newEphemeral();
    const url = new URL(buildPairUrl('https://meu.ufba.app', PAIR_ID, computer.pub, 'Edge no Windows'));
    const parsed = parsePairFragment(url.hash);
    expect(parsed?.pairId).toBe(PAIR_ID);
    expect([...(parsed?.computerPub ?? [])]).toEqual([...computer.pub]);
  });

  it('o nome do aparelho do fragmento é cortado em 60 caracteres e escapado', async () => {
    const computer = await newEphemeral();
    const url = buildPairUrl('https://meu.ufba.app', PAIR_ID, computer.pub, 'a b'.repeat(40));
    const label = decodeURIComponent(url.split('.').pop() ?? '');
    expect(label.length).toBe(60);
    expect(url.includes(' ')).toBe(false);
  });

  it.each([
    ['vazio', ''],
    ['só o id', `#${PAIR_ID}`],
    ['id curto', `#abc.${'A'.repeat(87)}`],
    ['chave curta', `#${PAIR_ID}.${'A'.repeat(86)}`],
    ['chave com caractere inválido', `#${PAIR_ID}.${'A'.repeat(86)}+`],
    ['chave que não é ponto P-256 sem compressão', `#${PAIR_ID}.${'A'.repeat(87)}`],
  ])('recusa fragmento inválido: %s', (_name, hash) => {
    expect(parsePairFragment(hash)).toBeNull();
  });
});

describe('deviceLabel', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0', 'Firefox no Windows'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0', 'Edge no Windows'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36', 'Chrome no Linux'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', 'Safari no Mac'],
    ['', 'Navegador no outro sistema'],
  ])('%s', (userAgent, label) => {
    expect(deviceLabel(userAgent)).toBe(label);
  });
});
