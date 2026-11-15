import { lazy } from 'react';

/**
 * Os blocos de "liberar o SIGAA com o celular" só aparecem em quem tem o SIGAA trancado, em celular com passkey ou na
 * lista de celulares: o código deles (criptografia, gerador de QR, WebAuthn) não entra na primeira carga.
 */
export const ActivatePasskey = lazy(() => import('./ActivatePasskey').then((m) => ({ default: m.ActivatePasskey })));
export const PhonesSection = lazy(() => import('./PhonesSection').then((m) => ({ default: m.PhonesSection })));
export const QrUnlockBlock = lazy(() => import('./QrUnlockBlock').then((m) => ({ default: m.QrUnlockBlock })));
export const UnlockWithFingerprint = lazy(() =>
  import('./UnlockWithFingerprint').then((m) => ({ default: m.UnlockWithFingerprint })),
);
