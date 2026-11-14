import { authUrl, getAuthOrigin, getPanelOrigin, panelUrl } from './origins';

afterEach(() => vi.unstubAllEnvs());

describe('origens (desenvolvimento)', () => {
  it('usam os padrões de dev: painel :3001 e auth :3002', () => {
    expect(getPanelOrigin()).toBe('http://localhost:3001');
    expect(getAuthOrigin()).toBe('http://localhost:3002');
  });

  it('leem as variáveis do build e tiram a barra final', () => {
    vi.stubEnv('VITE_PANEL_ORIGIN', 'https://ufba.app/');
    vi.stubEnv('VITE_AUTH_ORIGIN', 'https://auth.ufba.app');
    expect(getPanelOrigin()).toBe('https://ufba.app');
    expect(getAuthOrigin()).toBe('https://auth.ufba.app');
  });

  it.each([['https://ufba.app/connections'], ['https://ufba.app?x=1'], ['ftp://ufba.app'], ['javascript:alert(1)'], ['ufba.app']])(
    'recusam um valor que não é só uma origem http(s): %j',
    (value) => {
      vi.stubEnv('VITE_PANEL_ORIGIN', value);
      expect(() => getPanelOrigin()).toThrow(/VITE_PANEL_ORIGIN/);
    },
  );
});

describe('origens (build de produção)', () => {
  it('sem a variável não há padrão silencioso: falha', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_PANEL_ORIGIN', '');
    vi.stubEnv('VITE_AUTH_ORIGIN', '');
    expect(() => getPanelOrigin()).toThrow(/VITE_PANEL_ORIGIN/);
    expect(() => getAuthOrigin()).toThrow(/VITE_AUTH_ORIGIN/);
  });

  it('com as variáveis, funciona', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_PANEL_ORIGIN', 'https://ufba.app');
    expect(panelUrl('/connections')).toBe('https://ufba.app/connections');
  });
});

describe('panelUrl e authUrl', () => {
  it('montam a URL com a origem fixa e o caminho relativo', () => {
    expect(panelUrl('/connections?x=1#topo')).toBe('http://localhost:3001/connections?x=1#topo');
    expect(authUrl('/sign-in?return=%2Fconnections')).toBe('http://localhost:3002/sign-in?return=%2Fconnections');
  });

  it.each([['//evil.example/x'], ['/\\evil.example'], ['https://evil.example/x'], ['javascript:alert(1)'], ['evil'], ['']])(
    'caminho inseguro %j cai em "/" e nunca muda a origem',
    (value) => {
      expect(panelUrl(value)).toBe('http://localhost:3001/');
      expect(authUrl(value)).toBe('http://localhost:3002/');
    },
  );

  it('ausente cai em "/"', () => {
    expect(panelUrl(null)).toBe('http://localhost:3001/');
    expect(panelUrl(undefined)).toBe('http://localhost:3001/');
  });

  it('a URL final sempre começa pela origem fixa, mesmo com caminho esquisito', () => {
    for (const path of ['/..//evil.example', '/%2F%2Fevil.example', '/a/../../b']) {
      expect(panelUrl(path).startsWith('http://localhost:3001/')).toBe(true);
      expect(new URL(panelUrl(path)).origin).toBe('http://localhost:3001');
    }
  });
});
