import { http, HttpResponse } from 'msw';
import { API, server } from '../test/server';
import { buildAuthorizeUrl, callbackUrl, completeSignIn, SignInError, startSignIn } from './signIn';

const assign = vi.fn();

beforeEach(() => {
  assign.mockReset();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, origin: 'http://localhost:3002', assign },
  });
});

function stored() {
  return {
    verifier: window.sessionStorage.getItem('ufba.pkce.verifier'),
    state: window.sessionStorage.getItem('ufba.pkce.state'),
    returnTo: window.sessionStorage.getItem('ufba.pkce.return'),
  };
}

describe('startSignIn', () => {
  it('guarda verifier, state e destino e vai para /authorize da API com PKCE S256', async () => {
    await startSignIn('/authorize?request=abc');

    const { verifier, state, returnTo } = stored();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(state).toBeTruthy();
    expect(returnTo).toBe('/authorize?request=abc');

    const target = new URL(assign.mock.calls[0]?.[0] as string);
    expect(target.origin + target.pathname).toBe(`${API}/authorize`);
    expect(target.searchParams.get('response_type')).toBe('code');
    expect(target.searchParams.get('client_id')).toBe('ufba-web');
    expect(target.searchParams.get('redirect_uri')).toBe('http://localhost:3002/sign-in/callback');
    expect(target.searchParams.get('code_challenge_method')).toBe('S256');
    expect(target.searchParams.get('state')).toBe(state);
    // O verifier nunca vai na URL; só o challenge.
    expect(target.toString()).not.toContain(verifier as string);
    expect(target.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('descarta destino inseguro e usa o padrão', async () => {
    await startSignIn('https://evil.example/');
    expect(stored().returnTo).toBe('/connections');
  });

  it('avisa quando o navegador bloqueia o armazenamento', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    await expect(startSignIn()).rejects.toMatchObject({ kind: 'storage_unavailable' });
    expect(assign).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('buildAuthorizeUrl', () => {
  it('monta a URL com os parâmetros esperados', () => {
    const url = new URL(buildAuthorizeUrl({ challenge: 'c', state: 's', redirectUri: 'http://x/cb' }));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'ufba-web',
      redirect_uri: 'http://x/cb',
      code_challenge: 'c',
      code_challenge_method: 'S256',
      state: 's',
    });
  });
});

describe('completeSignIn', () => {
  function seed(state = 'state-1', verifier = 'verifier-1', returnTo = '/authorize?request=abc') {
    window.sessionStorage.setItem('ufba.pkce.state', state);
    window.sessionStorage.setItem('ufba.pkce.verifier', verifier);
    window.sessionStorage.setItem('ufba.pkce.return', returnTo);
  }

  it('confere o state, troca o code (camelCase) e devolve o destino; limpa o armazenamento', async () => {
    seed();
    let body: unknown;
    let headers: Headers | undefined;
    server.use(
      http.post(`${API}/session`, async ({ request }) => {
        body = await request.json();
        headers = request.headers;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const returnTo = await completeSignIn(new URLSearchParams('code=the-code&state=state-1'));

    expect(returnTo).toBe('/authorize?request=abc');
    expect(body).toEqual({ code: 'the-code', codeVerifier: 'verifier-1', redirectUri: callbackUrl() });
    expect(headers?.get('x-ufba')).toBe('1');
    expect(stored()).toEqual({ verifier: null, state: null, returnTo: null });
  });

  it('state diferente: recusa sem chamar a API e apaga o que guardou', async () => {
    seed();
    const spy = vi.fn();
    server.use(http.post(`${API}/session`, () => (spy(), new HttpResponse(null, { status: 204 }))));

    await expect(completeSignIn(new URLSearchParams('code=x&state=outro'))).rejects.toMatchObject({
      kind: 'state_mismatch',
    });
    expect(spy).not.toHaveBeenCalled();
    expect(stored()).toEqual({ verifier: null, state: null, returnTo: null });
  });

  it('state de uso único: a segunda tentativa com o mesmo state falha', async () => {
    seed();
    server.use(http.post(`${API}/session`, () => new HttpResponse(null, { status: 204 })));
    await completeSignIn(new URLSearchParams('code=x&state=state-1'));
    await expect(completeSignIn(new URLSearchParams('code=x&state=state-1'))).rejects.toMatchObject({
      kind: 'state_mismatch',
    });
  });

  it('sem state guardado (outra aba, armazenamento limpo): recusa', async () => {
    await expect(completeSignIn(new URLSearchParams('code=x&state=state-1'))).rejects.toMatchObject({
      kind: 'state_mismatch',
    });
  });

  it('retorno sem state é recusado mesmo que haja verifier guardado e nenhum state guardado', async () => {
    window.sessionStorage.setItem('ufba.pkce.verifier', 'verifier-1');
    const spy = vi.fn();
    server.use(http.post(`${API}/session`, () => (spy(), new HttpResponse(null, { status: 204 }))));
    await expect(completeSignIn(new URLSearchParams('code=x'))).rejects.toMatchObject({ kind: 'state_mismatch' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('state guardado mas sem verifier: recusa', async () => {
    window.sessionStorage.setItem('ufba.pkce.state', 'state-1');
    await expect(completeSignIn(new URLSearchParams('code=x&state=state-1'))).rejects.toMatchObject({
      kind: 'state_mismatch',
    });
  });

  it('descrição de erro só com espaços cai no texto padrão', async () => {
    seed();
    await expect(
      completeSignIn(new URLSearchParams({ error: 'access_denied', error_description: '   ' })),
    ).rejects.toMatchObject({ message: 'Use o seu e-mail @ufba.br.' });
  });

  it('o erro de login se chama SignInError', async () => {
    const error = await completeSignIn(new URLSearchParams('code=x')).catch((e: unknown) => e);
    expect(error).toMatchObject({ name: 'SignInError' });
  });

  it('sem code: recusa', async () => {
    seed();
    await expect(completeSignIn(new URLSearchParams('state=state-1'))).rejects.toMatchObject({ kind: 'missing_code' });
  });

  it('erro vindo do Google/API usa o texto pt-BR que veio, como está', async () => {
    seed();
    const text = 'marina.costa@gmail.com não é um e-mail @ufba.br. Entre com a sua conta institucional.';
    const search = new URLSearchParams({ error: 'access_denied', error_description: text });
    await expect(completeSignIn(search)).rejects.toMatchObject({ kind: 'denied', message: text });
    expect(stored()).toEqual({ verifier: null, state: null, returnTo: null });
  });

  it('erro sem descrição cai no texto padrão', async () => {
    seed();
    await expect(completeSignIn(new URLSearchParams('error=access_denied'))).rejects.toMatchObject({
      kind: 'denied',
      message: 'Use o seu e-mail @ufba.br.',
    });
  });

  it('falha na troca do code vira SignInError com a mensagem da API', async () => {
    seed();
    server.use(
      http.post(`${API}/session`, () => HttpResponse.json({ error: 'invalid_request', message: 'Código inválido.' }, { status: 400 })),
    );
    const error = await completeSignIn(new URLSearchParams('code=x&state=state-1')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SignInError);
    expect(error).toMatchObject({ kind: 'exchange_failed', message: 'Código inválido.' });
    expect(stored()).toEqual({ verifier: null, state: null, returnTo: null });
  });

  it('destino guardado inseguro vira o padrão', async () => {
    seed('state-1', 'verifier-1', '//evil.example');
    server.use(http.post(`${API}/session`, () => new HttpResponse(null, { status: 204 })));
    await expect(completeSignIn(new URLSearchParams('code=x&state=state-1'))).resolves.toBe('/connections');
  });
});
