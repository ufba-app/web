import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { API, server } from '../test/server';
import { fetchAuthorizeRequest, useAuthorizeRequest } from './authorize';
import { setSessionExpiredHandler } from './client';
import { fetchMe } from './me';
import { createSession, deleteSession } from './session';

const expired = () => HttpResponse.json({ error: 'session_expired', message: 'Entre de novo.' }, { status: 401 });

afterEach(() => setSessionExpiredHandler(null));

describe('401 esperado não dispara o tratador global de sessão expirada', () => {
  it.each([
    ['GET /me (saber se há sessão)', () => fetchMe(), 'get', '/me'],
    ['GET /authorize/requests/{id} (funciona sem sessão)', () => fetchAuthorizeRequest('r1'), 'get', '/authorize/requests/r1'],
    [
      'POST /session (troca do code)',
      () => createSession({ code: 'c', codeVerifier: 'v', redirectUri: 'http://x/cb' }),
      'post',
      '/session',
    ],
    ['DELETE /session (sair)', () => deleteSession(), 'delete', '/session'],
  ] as const)('%s', async (_name, call, method, path) => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    server.use(http[method](`${API}${path}`, expired));
    await expect(call()).rejects.toMatchObject({ code: 'session_expired' });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('useAuthorizeRequest', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {children}
    </QueryClientProvider>
  );

  it('sem id não faz nenhuma requisição', async () => {
    const spy = vi.fn();
    server.use(http.get(`${API}/authorize/requests/:id`, () => (spy(), HttpResponse.json({}))));
    const { result } = renderHook(() => useAuthorizeRequest(null), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(spy).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('com id busca o pedido e valida o formato', async () => {
    server.use(
      http.get(`${API}/authorize/requests/r1`, () =>
        HttpResponse.json({
          id: 'r1',
          client: { domain: 'claude.ai', redirectUri: 'https://claude.ai/cb', name: null, logoUrl: null, verified: false, metadata: 'absent' },
          signedIn: false,
          sources: null,
          expiresAt: '2026-11-12T12:00:00.000Z',
        }),
      ),
    );
    const { result } = renderHook(() => useAuthorizeRequest('r1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ id: 'r1', signedIn: false, sources: null });
  });

  it('pedidos diferentes não compartilham o cache', async () => {
    const seen: string[] = [];
    server.use(
      http.get(`${API}/authorize/requests/:id`, ({ params }) => {
        seen.push(String(params.id));
        return HttpResponse.json({
          id: params.id,
          client: { domain: 'x.com', redirectUri: 'https://x.com/cb', name: null, logoUrl: null, verified: false, metadata: 'absent' },
          signedIn: false,
          sources: null,
          expiresAt: '2026-11-12T12:00:00.000Z',
        });
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const shared = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const first = renderHook(() => useAuthorizeRequest('a'), { wrapper: shared });
    const second = renderHook(() => useAuthorizeRequest('b'), { wrapper: shared });
    await waitFor(() => expect(first.result.current.isSuccess && second.result.current.isSuccess).toBe(true));
    expect(first.result.current.data?.id).toBe('a');
    expect(second.result.current.data?.id).toBe('b');
    expect(seen.sort()).toEqual(['a', 'b']);
  });
});
