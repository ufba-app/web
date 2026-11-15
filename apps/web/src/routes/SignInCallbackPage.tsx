import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { resolveDestination } from '../auth/destination';
import { CALLBACK_PATH, completeSignIn, SignInError } from '../auth/signIn';
import { useDocumentTitle } from '../lib/useDocumentTitle';

/** Volta do login: confere o state, troca o code pelo cookie, limpa a URL e segue para o destino. */
export function SignInCallbackPage() {
  useDocumentTitle('Entrando');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const started = useRef(false);

  useEffect(() => {
    // O StrictMode roda o efeito duas vezes em dev; o code só pode ser trocado uma vez.
    if (started.current) return;
    started.current = true;

    const search = new URLSearchParams(window.location.search);
    // O code e o state saem da barra de endereço antes de qualquer outra coisa.
    window.history.replaceState(null, '', CALLBACK_PATH);

    completeSignIn(search).then(
      (returnTo) => {
        queryClient.clear();
        const destination = resolveDestination(returnTo);
        if (destination.kind === 'auth') navigate(destination.to, { replace: true });
        else window.location.assign(destination.url);
      },
      (error: unknown) => {
        const message = error instanceof SignInError ? error.message : 'Não deu para entrar agora. Tente de novo.';
        navigate('/sign-in', { replace: true, state: { authError: message } });
      },
    );
  }, [navigate, queryClient]);

  // Sem desenho próprio: o brasão do auth.html (fora da #root) continua na tela até o redirect.
  return null;
}
