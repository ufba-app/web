/**
 * Gerador de QR Code mínimo: modo byte, correção de erro nível L, versões 1 a 20, máscara 0 fixa. Portado do spike
 * (`dev/ufba/spike-passkey-prf/qr.js`, onde celulares de verdade leram o código). Existe porque a CSP não deixa
 * carregar biblioteca de CDN e para não pôr uma dependência no bundle só para desenhar um quadrado.
 * O algoritmo segue a ISO/IEC 18004 (estrutura da referência de domínio público de Nayuki).
 *
 * Só desenha o link do pedido de pareamento (chave pública + id; nada secreto).
 */

const ECC_PER_BLOCK_L = [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28];
const NUM_BLOCKS_L = [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8];
const FORMAT_L = 1;
const MASK = 0;
const MAX_VERSION = 20;

const bit = (value: number, index: number) => ((value >>> index) & 1) !== 0;

function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const count = Math.floor(version / 7) + 2;
    result -= (25 * count - 10) * count - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

const dataCodewords = (version: number) =>
  Math.floor(rawDataModules(version) / 8) - (ECC_PER_BLOCK_L[version] ?? 0) * (NUM_BLOCKS_L[version] ?? 0);

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j] ?? 0, root);
      if (j + 1 < result.length) result[j] = (result[j] ?? 0) ^ (result[j + 1] ?? 0);
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() ?? 0);
    result.push(0);
    divisor.forEach((coefficient, i) => {
      result[i] = (result[i] ?? 0) ^ gfMul(coefficient, factor);
    });
  }
  return result;
}

function alignmentPositions(version: number, size: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let position = size - 7; result.length < count; position -= step) result.splice(1, 0, position);
  return result;
}

/** Matriz de módulos (`true` = escuro), indexada `[y][x]`, sem a margem. */
export function encodeQr(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  let version = 1;
  for (; version <= MAX_VERSION; version++) {
    const countBits = version <= 9 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= dataCodewords(version) * 8) break;
  }
  if (version > MAX_VERSION) throw new Error('texto grande demais para o QR');

  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const byte of bytes) push(byte, 8);
  const capacity = dataCodewords(version) * 8;
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0));

  const numBlocks = NUM_BLOCKS_L[version] ?? 1;
  const eccLength = ECC_PER_BLOCK_L[version] ?? 0;
  const raw = Math.floor(rawDataModules(version) / 8);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLength = Math.floor(raw / numBlocks);
  const divisor = rsDivisor(eccLength);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const block = data.slice(k, k + shortLength - eccLength + (i < numShort ? 0 : 1));
    k += block.length;
    const ecc = rsRemainder(block, divisor);
    if (i < numShort) block.push(0);
    blocks.push(block.concat(ecc));
  }
  const codewords: number[] = [];
  for (let i = 0; i < (blocks[0]?.length ?? 0); i++) {
    blocks.forEach((block, j) => {
      if (i !== shortLength - eccLength || j >= numShort) codewords.push(block[i] ?? 0);
    });
  }

  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    (modules[y] as boolean[])[x] = dark;
    (reserved[y] as boolean[])[x] = true;
  };

  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ] as const) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, distance !== 2 && distance !== 4);
      }
    }
  }
  const alignment = alignmentPositions(version, size);
  const last = alignment.length - 1;
  alignment.forEach((ax, i) =>
    alignment.forEach((ay, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }),
  );

  const formatData = (FORMAT_L << 3) | MASK;
  let remainder = formatData;
  for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  const formatBits = ((formatData << 10) | remainder) ^ 0x5412;
  for (let i = 0; i <= 5; i++) set(8, i, bit(formatBits, i));
  set(8, 7, bit(formatBits, 6));
  set(8, 8, bit(formatBits, 7));
  set(7, 8, bit(formatBits, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(formatBits, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(formatBits, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(formatBits, i));
  set(8, size - 8, true);

  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const versionBits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, bit(versionBits, i));
      set(b, a, bit(versionBits, i));
    }
  }

  let index = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (!(reserved[y] as boolean[])[x] && index < codewords.length * 8) {
          (modules[y] as boolean[])[x] = bit(codewords[index >>> 3] ?? 0, 7 - (index & 7));
          index++;
        }
      }
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!(reserved[y] as boolean[])[x] && (x + y) % 2 === 0) (modules[y] as boolean[])[x] = !(modules[y] as boolean[])[x];
    }
  }
  return modules;
}

/** Caminho SVG (um único `<path>`) dos módulos escuros, para desenhar sem canvas, sem `style=` e sem imagem. */
export function qrPath(matrix: boolean[][]): { d: string; size: number } {
  let d = '';
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return { d, size: matrix.length };
}
