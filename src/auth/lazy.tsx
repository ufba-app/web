import { lazy } from 'react';

/**
 * Páginas do app de autenticação carregadas sob demanda (chunk próprio). SignInPage e SignInCallbackPage ficam de
 * fora: são a entrada do login e carregam junto. Página nova do auth entra aqui. Ver docs/performance.md.
 */
export const AuthorizePage = lazy(() => import('../routes/AuthorizePage').then((m) => ({ default: m.AuthorizePage })));
export const AuthorizeErrorPage = lazy(() =>
  import('../routes/AuthorizeErrorPage').then((m) => ({ default: m.AuthorizeErrorPage })),
);
export const AuthNotFoundPage = lazy(() =>
  import('../routes/AuthNotFoundPage').then((m) => ({ default: m.AuthNotFoundPage })),
);
/** Onde os toasts aparecem; só baixa depois da primeira carga (chunk à parte). */
export const ToastHost = lazy(() => import('../components/ToastHost').then((m) => ({ default: m.ToastHost })));
