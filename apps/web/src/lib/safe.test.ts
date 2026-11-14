import { isSafeRedirectTarget, isTrustedLogoUrl, loginReturnPath, requestIdFromReturnPath, safeReturnPath } from './safe';

describe('safeReturnPath', () => {
  it('aceita caminho relativo do próprio web, com query', () => {
    expect(safeReturnPath('/authorize?request=abc')).toBe('/authorize?request=abc');
    expect(safeReturnPath('/connections')).toBe('/connections');
  });

  it.each([
    ['https://evil.example/x'],
    ['//evil.example/x'],
    ['/\\evil.example'],
    ['javascript:alert(1)'],
    ['connections'],
    ['/ok\nSet-Cookie: x'],
    ['/a\\b'],
    [''],
  ])('recusa %j e usa o padrão', (value) => {
    expect(safeReturnPath(value)).toBe('/connections');
  });

  it('usa o padrão para valor ausente e respeita o padrão informado', () => {
    expect(safeReturnPath(null)).toBe('/connections');
    expect(safeReturnPath(undefined, '/')).toBe('/');
  });

  it('com padrão diferente, caminho relativo sem barra inicial e host externo caem nele', () => {
    expect(safeReturnPath('connections', '/inicio')).toBe('/inicio');
    expect(safeReturnPath('//evil.example/x', '/inicio')).toBe('/inicio');
    expect(safeReturnPath('https://evil.example/', '/inicio')).toBe('/inicio');
    expect(safeReturnPath('', '/inicio')).toBe('/inicio');
  });

  it('mantém o hash e normaliza o caminho', () => {
    expect(safeReturnPath('/connections#topo')).toBe('/connections#topo');
    expect(safeReturnPath('/a/../connections')).toBe('/connections');
  });
});

describe('isTrustedLogoUrl', () => {
  const api = 'https://api.ufba.app';

  it('aceita só URL da própria API', () => {
    expect(isTrustedLogoUrl('https://api.ufba.app/client-logos/abc', api)).toBe(true);
    expect(isTrustedLogoUrl('https://evil.example/logo.png', api)).toBe(false);
    expect(isTrustedLogoUrl('https://api.ufba.app.evil.example/logo.png', api)).toBe(false);
  });

  it('recusa valor ausente, inválido ou de esquema perigoso', () => {
    expect(isTrustedLogoUrl(null, api)).toBe(false);
    expect(isTrustedLogoUrl('nao e url', api)).toBe(false);
    expect(isTrustedLogoUrl('data:image/png;base64,AAAA', api)).toBe(false);
  });
});

describe('isSafeRedirectTarget', () => {
  it('aceita http, https e esquemas próprios de clientes MCP', () => {
    expect(isSafeRedirectTarget('https://claude.ai/api/mcp/auth_callback?code=1&state=2')).toBe(true);
    expect(isSafeRedirectTarget('http://localhost:6274/oauth/callback?code=1')).toBe(true);
    expect(isSafeRedirectTarget('cursor://anysphere.cursor-mcp/oauth/callback?code=1')).toBe(true);
  });

  it('recusa esquemas que executam código e valores que não são endereço', () => {
    expect(isSafeRedirectTarget('javascript:alert(1)')).toBe(false);
    expect(isSafeRedirectTarget('JavaScript:alert(1)')).toBe(false);
    expect(isSafeRedirectTarget('data:text/html,<script>1</script>')).toBe(false);
    expect(isSafeRedirectTarget('/relativo')).toBe(false);
    expect(isSafeRedirectTarget('')).toBe(false);
    expect(isSafeRedirectTarget(undefined)).toBe(false);
  });
});

describe('requestIdFromReturnPath', () => {
  it('extrai o id do pedido', () => {
    expect(requestIdFromReturnPath('/authorize?request=abc123')).toBe('abc123');
  });

  it('request vazio ou ausente não é um id', () => {
    expect(requestIdFromReturnPath('/authorize?request=')).toBeNull();
    expect(requestIdFromReturnPath('/authorize?outro=1')).toBeNull();
  });

  it('ignora outros caminhos e retornos inseguros', () => {
    expect(requestIdFromReturnPath('/connections?request=abc')).toBeNull();
    expect(requestIdFromReturnPath('/authorize')).toBeNull();
    expect(requestIdFromReturnPath('https://evil.example/authorize?request=abc')).toBeNull();
    expect(requestIdFromReturnPath(null)).toBeNull();
  });
});

describe('loginReturnPath', () => {
  it('mantém a query nas rotas comuns', () => {
    expect(loginReturnPath('/connections', '?connected=classroom')).toBe('/connections?connected=classroom');
  });

  it('em /device o código do terminal nunca vai para o login', () => {
    expect(loginReturnPath('/device', '?user_code=ABCD-1234')).toBe('/device');
    expect(loginReturnPath('/device/', '?user_code=ABCD-1234')).toBe('/device');
  });
});
