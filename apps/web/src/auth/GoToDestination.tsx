import { useEffect, useRef } from 'react';
import { Navigate } from 'react-router';
import { resolveDestination } from './destination';

/** Já tem sessão: segue para o destino (dentro do auth ou no painel). Não desenha nada. */
export function GoToDestination({ returnTo }: { returnTo: string | null | undefined }) {
  const destination = resolveDestination(returnTo);
  const panelTarget = destination.kind === 'panel' ? destination.url : null;
  const navigated = useRef<string | null>(null);

  useEffect(() => {
    // O StrictMode roda o efeito duas vezes em dev; um segundo `assign` aborta o primeiro. Navega uma vez por destino.
    if (!panelTarget || navigated.current === panelTarget) return;
    navigated.current = panelTarget;
    window.location.assign(panelTarget);
  }, [panelTarget]);

  return destination.kind === 'auth' ? <Navigate to={destination.to} replace /> : null;
}
