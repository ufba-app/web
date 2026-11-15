import { lazy } from 'react';

/**
 * Diálogos só abrem depois de um clique, então o código deles não entra na primeira carga.
 * `preloadDialogs` baixa todos quando o navegador está ocioso, para o primeiro clique já os encontrar prontos.
 */
const loaders = {
  disconnect: () => import('./DisconnectDialog'),
  disconnectComputer: () => import('./DisconnectComputerDialog'),
  deleteProject: () => import('./DeleteProjectDialog'),
  newProject: () => import('./NewProjectDialog'),
  projectConfirm: () => import('./ProjectConfirmDialog'),
  moodle: () => import('./MoodleDialog'),
  renameComputer: () => import('./RenameComputerDialog'),
  siasb: () => import('./SiasbDialog'),
  sigaa: () => import('./SigaaDialog'),
};

export const DisconnectDialog = lazy(() => loaders.disconnect().then((m) => ({ default: m.DisconnectDialog })));
export const DisconnectComputerDialog = lazy(() =>
  loaders.disconnectComputer().then((m) => ({ default: m.DisconnectComputerDialog })),
);
export const RenameComputerDialog = lazy(() => loaders.renameComputer().then((m) => ({ default: m.RenameComputerDialog })));
export const MoodleDialog = lazy(() => loaders.moodle().then((m) => ({ default: m.MoodleDialog })));
export const DeleteProjectDialog = lazy(() => loaders.deleteProject().then((m) => ({ default: m.DeleteProjectDialog })));
export const NewProjectDialog = lazy(() => loaders.newProject().then((m) => ({ default: m.NewProjectDialog })));
export const ProjectConfirmDialog = lazy(() => loaders.projectConfirm().then((m) => ({ default: m.ProjectConfirmDialog })));
export const SiasbDialog = lazy(() => loaders.siasb().then((m) => ({ default: m.SiasbDialog })));
export const SigaaDialog = lazy(() => loaders.sigaa().then((m) => ({ default: m.SigaaDialog })));

export function preloadDialogs(): void {
  const load = () => {
    for (const loader of Object.values(loaders)) void loader().catch(() => undefined);
  };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(load);
  else window.setTimeout(load, 200);
}
