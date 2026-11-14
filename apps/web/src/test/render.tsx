import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { App } from '../App';
import { AuthApp } from '../AuthApp';
import { meFixture } from '../contract/fixtures';
import type { Me } from '../contract';
import { API } from './server';

/** Renderiza o app inteiro numa rota, com um cache novo por teste (sem retry, para erros aparecerem na hora). */
export function renderApp(route: string | { pathname: string; state?: unknown } = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

/** Igual a `renderApp`, mas com o app de autenticação (login, retorno do login, autorizar, erros). */
export function renderAuthApp(route: string | { pathname: string; state?: unknown } = '/sign-in') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthApp />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

export const meHandler = (me: Me = meFixture()) => http.get(`${API}/me`, () => HttpResponse.json(me));

export const signedOutMeHandler = () =>
  http.get(`${API}/me`, () =>
    HttpResponse.json({ error: 'session_expired', message: 'Entre de novo.' }, { status: 401 }),
  );

/** `window.location.replace` não navega no jsdom; troca por um espião (login em outro app, sessão expirada). */
export function mockLocationReplace() {
  const replace = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, origin: 'http://localhost:3001', replace },
  });
  return replace;
}

/** `window.location.assign` não navega no jsdom; troca por um espião. */
export function mockLocationAssign() {
  const assign = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, origin: 'http://localhost:3001', assign },
  });
  return assign;
}
