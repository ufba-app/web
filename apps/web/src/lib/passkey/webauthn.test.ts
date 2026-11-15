import { looksLikePhone, rpIdFor, toPrfCredentials } from './webauthn';
import { toBase64Url } from './bytes';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('rpIdFor', () => {
  it.each([
    ['ufba.app', 'ufba.app'],
    ['meu.ufba.app', 'ufba.app'],
    ['auth.ufba.app', 'ufba.app'],
    ['localhost', 'localhost'],
    ['ufba.app.evil.example', 'ufba.app.evil.example'],
    ['notufba.app', 'notufba.app'],
  ])('%s -> %s', (hostname, rpId) => {
    expect(rpIdFor(hostname)).toBe(rpId);
  });
});

describe('looksLikePhone (a oferta de ativar só aparece em quem parece celular)', () => {
  function stub(opts: { mobile?: boolean; userAgent?: string; coarse: boolean }) {
    vi.stubGlobal('navigator', { userAgent: opts.userAgent ?? '', userAgentData: opts.mobile === undefined ? undefined : { mobile: opts.mobile } });
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' ? opts.coarse : false }));
    window.matchMedia = globalThis.matchMedia;
  }

  it('celular: móvel e toque como ponteiro principal', () => {
    stub({ mobile: true, coarse: true });
    expect(looksLikePhone()).toBe(true);
  });

  it('PC comum: não é móvel e o ponteiro é fino (mouse)', () => {
    stub({ mobile: false, coarse: false });
    expect(looksLikePhone()).toBe(false);
  });

  it('PC com tela de toque: não se declara móvel, então não passa', () => {
    stub({ mobile: false, coarse: true });
    expect(looksLikePhone()).toBe(false);
  });

  it('navegador móvel sem toque principal (ex.: teclado e mouse ligados): não passa', () => {
    stub({ mobile: true, coarse: false });
    expect(looksLikePhone()).toBe(false);
  });

  it('sem userAgentData (Safari e Firefox), cai no texto do user agent', () => {
    stub({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', coarse: true });
    expect(looksLikePhone()).toBe(true);
    stub({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0', coarse: false });
    expect(looksLikePhone()).toBe(false);
  });
});

describe('toPrfCredentials', () => {
  it('converte o id e o salt de base64url para bytes', () => {
    const id = Uint8Array.from([1, 2, 3]);
    const salt = Uint8Array.from([9, 8, 7]);
    const [item] = toPrfCredentials([{ credentialId: toBase64Url(id), prfSalt: toBase64Url(salt) }]);
    expect([...(item?.id ?? [])]).toEqual([1, 2, 3]);
    expect([...(item?.salt ?? [])]).toEqual([9, 8, 7]);
  });
});
