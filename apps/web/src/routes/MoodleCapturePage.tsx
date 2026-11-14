import { useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, PageHeader } from '@ufba-app/web-ui';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '../api/client';
import { captureMoodle } from '../api/connections';
import { meQueryKey } from '../api/me';
import { useDocumentTitle } from '../lib/useDocumentTitle';

type Status = { kind: 'working' } | { kind: 'done' } | { kind: 'error'; message: string };

const CAPTURE_PATH = '/connections/moodle/capture';

/**
 * O navegador abre esta página quando o AVA termina em `web+ufba://token=…` (`?u=<link>`).
 * Ela envia o link à API, tira o link da barra de endereço e avisa o resultado.
 */
export function MoodleCapturePage() {
  useDocumentTitle('Conectar o Moodle');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const started = useRef(false);
  const [status, setStatus] = useState<Status>({ kind: 'working' });

  useEffect(() => {
    // O StrictMode roda o efeito duas vezes em dev; o link só pode ser enviado uma vez.
    if (started.current) return;
    started.current = true;

    const link = new URLSearchParams(window.location.search).get('u')?.trim();
    // O link traz o token do Moodle: sai da barra de endereço antes de qualquer outra coisa.
    window.history.replaceState(null, '', CAPTURE_PATH);

    if (!link) {
      setStatus({ kind: 'error', message: 'O link do Moodle não chegou. Volte às conexões e tente de novo.' });
      return;
    }
    captureMoodle(link).then(
      () => {
        void queryClient.invalidateQueries({ queryKey: meQueryKey });
        setStatus({ kind: 'done' });
      },
      (error: unknown) => {
        setStatus({
          kind: 'error',
          message: error instanceof ApiError ? error.message : 'Não deu para conectar o Moodle agora. Tente de novo.',
        });
      },
    );
  }, [queryClient]);

  const back = <Button onPress={() => navigate('/connections', { replace: true })}>Voltar às conexões</Button>;

  return (
    <>
      <PageHeader title="Conectar o Moodle" />
      {status.kind === 'working' ? (
        <div className="web-status-line" role="status">
          <span className="web-spinner" aria-hidden="true" />
          Conectando o Moodle…
        </div>
      ) : null}
      {status.kind === 'done' ? (
        <EmptyState title="Moodle conectado" description="Pronto. Você já pode voltar às conexões." action={back} />
      ) : null}
      {status.kind === 'error' ? (
        <EmptyState title="Não deu para conectar o Moodle" description={status.message} action={back} />
      ) : null}
    </>
  );
}
