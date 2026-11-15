import { concatBytes, fromBase64Url, randomBytes, toBase64Url } from './bytes';

describe('base64url', () => {
  it('ida e volta, com bytes que usam + e / no base64 comum', () => {
    const bytes = Uint8Array.from([251, 255, 190, 0, 1, 2, 253]);
    const text = toBase64Url(bytes);
    expect(text).toBe('-_--AAEC_Q');
    expect([...fromBase64Url(text)]).toEqual([...bytes]);
  });

  it.each([[0], [1], [2], [3], [31], [32], [65]])('ida e volta com %i bytes aleatórios', (length) => {
    const bytes = randomBytes(length);
    expect([...fromBase64Url(toBase64Url(bytes))]).toEqual([...bytes]);
  });

  it('não leva preenchimento "="', () => {
    expect(toBase64Url(Uint8Array.from([1]))).not.toContain('=');
  });

  it.each([['a+b'], ['a/b'], ['a=='], ['a b'], ['á'], ['a']])('recusa base64url inválido: %j', (text) => {
    expect(() => fromBase64Url(text)).toThrow();
  });
});

describe('concatBytes', () => {
  it('junta na ordem', () => {
    expect([...concatBytes(Uint8Array.from([1, 2]), new Uint8Array(0), Uint8Array.from([3]))]).toEqual([1, 2, 3]);
  });
});
