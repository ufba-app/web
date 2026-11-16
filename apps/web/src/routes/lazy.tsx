import { lazy } from 'react';

/**
 * Páginas carregadas sob demanda: cada uma vira um chunk próprio e só baixa quando a pessoa chega nela.
 * Só as páginas do painel: login e autorização são do app de auth (src/auth/lazy.tsx).
 * Página nova entra aqui. Ver docs/performance.md.
 */
const loaders = {
  academic: () => import('./AcademicPage'),
  authorizedApps: () => import('./AuthorizedAppsPage'),
  comingSoon: () => import('./ComingSoonPage'),
  connections: () => import('./ConnectionsPage'),
  device: () => import('./DevicePage'),
  error: () => import('./ErrorPage'),
  grades: () => import('./GradesPage'),
  memoryAdmin: () => import('./MemoryAdminPage'),
  memoryComputers: () => import('./MemoryComputersPage'),
  memoryProject: () => import('./MemoryProjectPage'),
  memoryProjects: () => import('./MemoryProjectsPage'),
  moodleCapture: () => import('./MoodleCapturePage'),
  panel: () => import('./PanelPage'),
  pair: () => import('./PairPage'),
};

export const AcademicPage = lazy(() => loaders.academic().then((m) => ({ default: m.AcademicPage })));
export const AuthorizedAppsPage = lazy(() => loaders.authorizedApps().then((m) => ({ default: m.AuthorizedAppsPage })));
export const ComingSoonPage = lazy(() => loaders.comingSoon().then((m) => ({ default: m.ComingSoonPage })));
export const ConnectionsPage = lazy(() => loaders.connections().then((m) => ({ default: m.ConnectionsPage })));
export const DevicePage = lazy(() => loaders.device().then((m) => ({ default: m.DevicePage })));
export const MemoryComputersPage = lazy(() => loaders.memoryComputers().then((m) => ({ default: m.MemoryComputersPage })));
export const MemoryAdminPage = lazy(() => loaders.memoryAdmin().then((m) => ({ default: m.MemoryAdminPage })));
export const MemoryProjectPage = lazy(() => loaders.memoryProject().then((m) => ({ default: m.MemoryProjectPage })));
export const MemoryProjectsPage = lazy(() => loaders.memoryProjects().then((m) => ({ default: m.MemoryProjectsPage })));
export const GradesPage = lazy(() => loaders.grades().then((m) => ({ default: m.GradesPage })));
export const ErrorPage = lazy(() => loaders.error().then((m) => ({ default: m.ErrorPage })));
export const NotFoundPage = lazy(() => loaders.error().then((m) => ({ default: m.NotFoundPage })));
export const PanelPage = lazy(() => loaders.panel().then((m) => ({ default: m.PanelPage })));
export const PairPage = lazy(() => loaders.pair().then((m) => ({ default: m.PairPage })));
export const MoodleCapturePage = lazy(() => loaders.moodleCapture().then((m) => ({ default: m.MoodleCapturePage })));

const loaderByPath: Record<string, () => Promise<unknown>> = {
  '/': loaders.panel,
  '/schedule': loaders.comingSoon,
  '/deadlines': loaders.comingSoon,
  '/grades': loaders.grades,
  '/academic': loaders.academic,
  '/connections': loaders.connections,
  '/authorized-apps': loaders.authorizedApps,
  '/device': loaders.device,
  '/memory/computers': loaders.memoryComputers,
  '/memory/projects': loaders.memoryProjects,
  '/memory/admin': loaders.memoryAdmin,
};

/** Baixa a página antes do clique (passar o mouse ou focar num item do menu). Falha em silêncio: o clique tenta de novo. */
export function preloadRoute(path: string): void {
  void loaderByPath[path]?.().catch(() => undefined);
}
