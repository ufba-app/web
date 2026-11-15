/**
 * Rotas do painel: as que ficam dentro do `AppLayout` (App.tsx). Antes do JavaScript carregar, o servidor devolve
 * `shell.html` (sidebar em skeleton) para elas e `index.html` (só o brasão) para o resto, sem script nenhum.
 *
 * Três lugares precisam concordar: esta lista, a regra `@panel` do Caddyfile e as rotas do `AppLayout`.
 * `panelPaths.test.ts` confere o Caddyfile. Rota nova no painel entra aqui e no Caddyfile.
 */
export const PANEL_EXACT_PATHS = [
  '/',
  '/schedule',
  '/deadlines',
  '/grades',
  '/academic',
  '/connections',
  '/authorized-apps',
  '/device',
  '/memory/computers',
  '/memory/projects',
  '/memory/admin',
] as const;

/** Prefixos com subrotas (`/connections/moodle/capture`, `/academic/curriculum`, `/memory/projects/<id>`). */
export const PANEL_PREFIXES = ['/academic', '/connections', '/authorized-apps', '/memory/projects'] as const;

export function isPanelPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return (
    (PANEL_EXACT_PATHS as readonly string[]).includes(path) ||
    PANEL_PREFIXES.some((prefix) => path.startsWith(`${prefix}/`))
  );
}
