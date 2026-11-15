import { lazy } from 'react';

/**
 * Só os dois blocos de DESBLOQUEAR (QR no computador, digital no celular). A tela de autorizar app (app de auth)
 * importa daqui e não de `lazyPasskey.tsx`: aquele também referencia a lista de celulares e a ativação, que trazem o
 * `Dialog` do HeroUI e inflariam a primeira carga do auth (o teto de `pnpm size:auth` falha).
 */
export const QrUnlockBlock = lazy(() => import('./QrUnlockBlock').then((m) => ({ default: m.QrUnlockBlock })));
export const UnlockWithFingerprint = lazy(() =>
  import('./UnlockWithFingerprint').then((m) => ({ default: m.UnlockWithFingerprint })),
);
