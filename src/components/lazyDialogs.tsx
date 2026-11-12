import { lazy } from 'react';

/**
 * Diálogos só abrem depois de um clique, então o código deles não entra na primeira carga.
 * `preloadDialogs` baixa os três quando o navegador está ocioso, para o primeiro clique já os encontrar prontos.
 */
const loaders = {
  disconnect: () => import('./DisconnectDialog'),
  moodle: () => import('./MoodleDialog'),
  sigaa: () => import('./SigaaDialog'),
};

export const DisconnectDialog = lazy(() => loaders.disconnect().then((m) => ({ default: m.DisconnectDialog })));
export const MoodleDialog = lazy(() => loaders.moodle().then((m) => ({ default: m.MoodleDialog })));
export const SigaaDialog = lazy(() => loaders.sigaa().then((m) => ({ default: m.SigaaDialog })));

export function preloadDialogs(): void {
  const load = () => {
    for (const loader of Object.values(loaders)) void loader().catch(() => undefined);
  };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(load);
  else window.setTimeout(load, 200);
}
