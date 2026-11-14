import { goToPanel, resolveDestination } from './destination';

describe('resolveDestination', () => {
  it('/authorize?request=<id> continua dentro do auth', () => {
    expect(resolveDestination('/authorize?request=abc')).toEqual({ kind: 'auth', to: '/authorize?request=abc' });
  });

  it('o id do pedido é reescrito, não copiado como veio', () => {
    expect(resolveDestination('/authorize?request=a%26b&x=1')).toEqual({ kind: 'auth', to: '/authorize?request=a%26b' });
  });

  it('qualquer outro caminho relativo seguro vai ao painel, com a origem fixa', () => {
    expect(resolveDestination('/connections')).toEqual({ kind: 'panel', url: 'http://localhost:3001/connections' });
    expect(resolveDestination('/authorized-apps?x=1')).toEqual({
      kind: 'panel',
      url: 'http://localhost:3001/authorized-apps?x=1',
    });
  });

  it('/authorize sem pedido não é do auth: vai ao painel', () => {
    expect(resolveDestination('/authorize')).toEqual({ kind: 'panel', url: 'http://localhost:3001/authorize' });
  });

  it.each([
    ['//evil.example'],
    ['//evil.example/authorize?request=abc'],
    ['/\\evil.example'],
    ['https://evil.example'],
    ['https://evil.example/authorize?request=abc'],
    ['javascript:alert(1)'],
    ['data:text/html,x'],
    ['connections'],
    [''],
    [null],
    [undefined],
  ])('tentativa de open redirect %j cai no padrão do painel', (value) => {
    expect(resolveDestination(value)).toEqual({ kind: 'panel', url: 'http://localhost:3001/connections' });
  });

  it('com origem de painel configurada, só ela aparece no resultado', () => {
    vi.stubEnv('VITE_PANEL_ORIGIN', 'https://meu.ufba.app');
    const result = resolveDestination('//evil.example');
    expect(result).toEqual({ kind: 'panel', url: 'https://meu.ufba.app/connections' });
    vi.unstubAllEnvs();
  });
});

describe('goToPanel', () => {
  it('navega para a URL do painel', () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
    goToPanel('/');
    expect(assign).toHaveBeenCalledWith('http://localhost:3001/');
  });
});
