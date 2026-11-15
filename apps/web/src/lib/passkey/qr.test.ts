import jsQR from 'jsqr';
import { buildPairUrl, newEphemeral } from './pairing';
import { encodeQr, qrPath } from './qr';

/** Rasteriza a matriz como um leitor de câmera veria (margem de 4 módulos, preto sobre branco) e decodifica com o jsQR. */
function decode(matrix: boolean[][], scale = 4): string | null {
  const quiet = 4;
  const side = (matrix.length + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const offset = (((y + quiet) * scale + dy) * side + (x + quiet) * scale + dx) * 4;
          pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
        }
      }
    }),
  );
  return jsQR(pixels, side, side)?.data ?? null;
}

describe('encodeQr', () => {
  it.each([
    ['curto', 'ufba.app'],
    ['com acento', 'liberar o SIGAA: ação'],
    ['médio', 'https://meu.ufba.app/pair#abcdefghijklmnopqrstuv.' + 'A'.repeat(120)],
    ['perto do limite da versão 20', 'x'.repeat(600)],
  ])('um leitor de QR de verdade decodifica o texto: %s', (_name, text) => {
    expect(decode(encodeQr(text))).toBe(text);
  });

  it('decodifica o link real do pareamento (id + chave pública P-256 + nome)', async () => {
    const computer = await newEphemeral();
    const url = buildPairUrl('https://meu.ufba.app', 'AAECAwQFBgcICQoLDA0ODw', computer.pub, 'Firefox no Windows');
    expect(decode(encodeQr(url))).toBe(url);
  });

  it('é determinístico e quadrado, com os três cantos de posição', () => {
    const a = encodeQr('ufba.app');
    expect(encodeQr('ufba.app')).toEqual(a);
    expect(a.length).toBe(21); // versão 1
    expect(a.every((row) => row.length === a.length)).toBe(true);
    for (const [x0, y0] of [
      [0, 0],
      [a.length - 7, 0],
      [0, a.length - 7],
    ] as const) {
      expect(a[y0]?.[x0]).toBe(true); // canto do quadrado de posição
      expect(a[y0 + 3]?.[x0 + 3]).toBe(true); // centro
      expect(a[y0 + 1]?.[x0 + 1]).toBe(false); // anel claro
    }
  });

  it('recusa texto que não cabe na versão 20 em vez de gerar um QR quebrado', () => {
    expect(() => encodeQr('x'.repeat(1000))).toThrow(/grande demais/);
  });
});

describe('qrPath', () => {
  it('descreve só os módulos escuros, no tamanho da matriz', () => {
    const matrix = [
      [true, false],
      [false, true],
    ];
    expect(qrPath(matrix)).toEqual({ d: 'M0 0h1v1h-1zM1 1h1v1h-1z', size: 2 });
  });
});
