import { lazy } from 'react';

/**
 * Páginas carregadas sob demanda: cada uma vira um chunk próprio e só baixa quando a pessoa chega nela.
 * Só as páginas do painel: login e autorização são do app de auth (src/auth/lazy.tsx).
 * Página nova entra aqui. Ver docs/performance.md.
 */
const loaders = {
  authorizedApps: () => import('./AuthorizedAppsPage'),
  comingSoon: () => import('./ComingSoonPage'),
  connections: () => import('./ConnectionsPage'),
  error: () => import('./ErrorPage'),
  moodleCapture: () => import('./MoodleCapturePage'),
};

export const AuthorizedAppsPage = lazy(() => loaders.authorizedApps().then((m) => ({ default: m.AuthorizedAppsPage })));
export const ComingSoonPage = lazy(() => loaders.comingSoon().then((m) => ({ default: m.ComingSoonPage })));
export const ConnectionsPage = lazy(() => loaders.connections().then((m) => ({ default: m.ConnectionsPage })));
export const ErrorPage = lazy(() => loaders.error().then((m) => ({ default: m.ErrorPage })));
export const NotFoundPage = lazy(() => loaders.error().then((m) => ({ default: m.NotFoundPage })));
export const MoodleCapturePage = lazy(() => loaders.moodleCapture().then((m) => ({ default: m.MoodleCapturePage })));

const loaderByPath: Record<string, () => Promise<unknown>> = {
  '/': loaders.comingSoon,
  '/schedule': loaders.comingSoon,
  '/deadlines': loaders.comingSoon,
  '/grades': loaders.comingSoon,
  '/connections': loaders.connections,
  '/authorized-apps': loaders.authorizedApps,
};

/** Baixa a página antes do clique (passar o mouse ou focar num item do menu). Falha em silêncio: o clique tenta de novo. */
export function preloadRoute(path: string): void {
  void loaderByPath[path]?.().catch(() => undefined);
}
