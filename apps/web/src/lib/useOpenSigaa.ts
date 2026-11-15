import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../api/client';
import { meQueryKey } from '../api/me';
import { notify } from './notify';
import { openSigaaLoggedIn } from './openSigaa';

/** Falha de "Abrir o SIGAA já logado" (a janela em branco já foi fechada). Mesmos textos da página de Conexões. */
export function launchErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'source_not_connected') return 'Libere o SIGAA neste navegador antes de abri-lo.';
    // A API limita a 6 aberturas por 10 minutos.
    if (error.code === 'too_many_attempts') return 'Muitas aberturas seguidas. Espere alguns minutos e tente de novo.';
    return error.message;
  }
  return 'Não deu para abrir o SIGAA agora. Tente de novo.';
}

/**
 * "Abrir o SIGAA já logado" a partir de um botão. `open` precisa ser chamada DIRETO do clique (ver `openSigaaLoggedIn`:
 * a janela abre ali, antes de qualquer espera). Erro vira toast; o SIGAA fechado nesta sessão relê `/me` para o menu
 * passar a oferecer "Reconectar".
 */
export function useOpenSigaa() {
  const queryClient = useQueryClient();
  const [launching, setLaunching] = useState(false);

  const open = () => {
    if (launching) return;
    setLaunching(true);
    openSigaaLoggedIn()
      .catch((error: unknown) => {
        notify.error(launchErrorText(error));
        if (error instanceof ApiError && error.code === 'source_not_connected') {
          void queryClient.invalidateQueries({ queryKey: meQueryKey });
        }
      })
      .finally(() => setLaunching(false));
  };

  return { open, launching };
}
