import { AuthLayout, Button, Notice, ServiceIcon } from '@ufba-app/web-ui';
import { useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { useAuthorizeRequest } from '../api/authorize';
import { useMe } from '../api/me';
import { GoToDestination } from '../auth/GoToDestination';
import { SignInError, startSignIn } from '../auth/signIn';
import { requestIdFromReturnPath, safeReturnPath } from '../lib/safe';
import { useDocumentTitle } from '../lib/useDocumentTitle';

type LocationState = { authError?: string } | null;

export function SignInPage() {
  useDocumentTitle('Entrar');
  const [params] = useSearchParams();
  const location = useLocation();
  const returnTo = safeReturnPath(params.get('return'));
  const requestId = requestIdFromReturnPath(params.get('return'));
  const me = useMe();
  // Sem sessão a API ainda mostra quem pede acesso (nome/domínio), para a pessoa saber por que está entrando.
  const pending = useAuthorizeRequest(requestId);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const authError = (location.state as LocationState)?.authError ?? startError;

  if (me.data) return <GoToDestination returnTo={returnTo} />;

  const client = pending.data?.client;
  const clientName = client ? (client.name?.trim() || client.domain) : null;

  const signIn = async () => {
    setStartError(null);
    setStarting(true);
    try {
      await startSignIn(returnTo);
    } catch (error) {
      setStarting(false);
      setStartError(error instanceof SignInError ? error.message : 'Não deu para entrar agora. Tente de novo.');
    }
  };

  return (
    <AuthLayout
      headline="Seu semestre num lugar só."
      subline="Horário, prazos, notas e faltas, sempre atualizados."
      sources={['sigaa', 'moodle', 'classroom']}
    >
      {clientName ? (
        <Notice tone="info">
          <strong>{clientName}</strong> quer acessar seus dados acadêmicos. Entre para revisar o pedido.
        </Notice>
      ) : null}
      <h1>Entrar</h1>
      <p className="web-muted">Use a sua conta @ufba.br. Ela é o seu acesso, sem senha extra.</p>
      {authError ? <Notice tone="danger">{authError}</Notice> : null}
      <Button className="web-full" isPending={starting} onPress={() => void signIn()}>
        <ServiceIcon service="google" size={20} />
        {authError ? 'Usar outra conta' : 'Entrar com Google'}
      </Button>
      <p className="web-muted" style={{ fontSize: 13 }}>
        Moodle, SIGAA e Classroom você conecta depois, uma vez só.
      </p>
    </AuthLayout>
  );
}
