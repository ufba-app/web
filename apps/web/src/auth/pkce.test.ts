import { challengeFor, randomValue } from './pkce';

describe('challengeFor', () => {
  it('bate com o vetor de teste da RFC 7636 (apêndice B)', async () => {
    await expect(challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).resolves.toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});

describe('randomValue', () => {
  it('gera base64url (sem +, / nem =) com o tamanho esperado', () => {
    const value = randomValue(32);
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(value).toHaveLength(43);
  });

  it('usa base64url: "+" vira "-", "/" vira "_" e o preenchimento "=" some', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues');
    spy.mockImplementationOnce(<T extends ArrayBufferView | null>(array: T): T => {
      (array as unknown as Uint8Array).set([0xfb, 0xef, 0xbe]); // base64: "++++"
      return array;
    });
    expect(randomValue(3)).toBe('----');
    spy.mockImplementationOnce(<T extends ArrayBufferView | null>(array: T): T => {
      (array as unknown as Uint8Array).set([0xff, 0xff, 0xff]); // base64: "////"
      return array;
    });
    expect(randomValue(3)).toBe('____');
    spy.mockRestore();
  });

  it('remove todo o preenchimento: 31 bytes dão "==" em base64 e 32 dão "="', () => {
    expect(randomValue(31)).toHaveLength(42);
    expect(randomValue(31)).not.toContain('=');
    expect(randomValue(32)).not.toContain('=');
  });

  it('não repete', () => {
    const values = new Set(Array.from({ length: 50 }, () => randomValue()));
    expect(values.size).toBe(50);
  });
});
