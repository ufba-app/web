import { useQueryClient } from '@tanstack/react-query';
import { AccountLine, AuthLayout, Button, ClientRequest, Notice } from '@ufba-app/web-ui';
import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { decideAuthorizeRequest, useAuthorizeRequest, type Decision } from '../api/authorize';
import { API_URL, ApiError } from '../api/client';
import { useMe } from '../api/me';
import { deleteSession } from '../api/session';
import { ErrorScreen } from '../components/ErrorScreen';
import { AuthorizePageSkeleton } from '../components/Skeletons';
import { SourcesList } from '../components/SourcesList';
import type { AuthorizeSourceStatus, Source } from '../contract';
import { goToPanel } from '../auth/destination';
import { notify } from '../lib/notify';
import { panelUrl } from '../lib/origins';
import { isSafeRedirectTarget, isTrustedLogoUrl } from '../lib/safe';
import { useDocumentTitle } from '../lib/useDocumentTitle';

const SOURCE_NAME: Record<Source, string> = { sigaa: 'SIGAA', moodle: 'Moodle', classroom: 'Classroom' };

type RequestProblem = { title: string; message: string; notice?: string };

/** Textos dos erros do pedido de autorização (todos pt-BR, só como texto). */
export function requestProblem(code: string): RequestProblem {
  switch (code) {
    case 'request_expired':
      return {
        title: 'Pedido expirado',
        message: 'Volte ao app e peça acesso de novo.',
        notice: 'Por segurança, cada pedido vale por pouco tempo.',
      };
    default:
      return { title: 'Pedido não encontrado', message: 'Não achamos esse pedido. Volte ao app e peça acesso de novo.' };
  }
}

const REQUEST_ERROR_CODES = new Set(['request_expired', 'request_not_found']);

/** Dicas abaixo da lista, para fontes que o app ainda não vai conseguir ler. */
function sourceHints(sources: Array<{ source: Source; status: AuthorizeSourceStatus }>): Array<{ key: string; text: string; link: string }> {
  if (sources.every((s) => s.status === 'disconnected')) {
    return [{ key: 'none', text: 'Sem fontes conectadas, o app não vê nada ainda.', link: 'Conectar agora' }];
  }
  const hints: Array<{ key: string; text: string; link: string }> = [];
  for (const { source, status } of sources) {
    if (status === 'password_required') {
      hints.push({
        key: `${source}-password`,
        text: `O ${SOURCE_NAME[source]} só vai aparecer para o app depois que você digitar a senha.`,
        link: 'Digitar senha',
      });
    } else if (status === 'reconnect_required') {
      hints.push({
        key: `${source}-reconnect`,
        text: `O ${SOURCE_NAME[source]} precisa ser reconectado para o app poder ler.`,
        link: 'Reconectar',
      });
    }
  }
  return hints;
}

export function AuthorizePage() {
  useDocumentTitle('Autorizar');
  const [params] = useSearchParams();
  const requestId = params.get('request');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const request = useAuthorizeRequest(requestId);
  const me = useMe();
  const [deciding, setDeciding] = useState<Decision | null>(null);
  const [problemCode, setProblemCode] = useState<string | null>(null);

  if (!requestId) return <Navigate to="/authorize/error" replace />;
  const returnTo = `/authorize?request=${encodeURIComponent(requestId)}`;

  if (request.isPending || (request.data?.signedIn && me.isPending)) {
    // Os textos fixos da página já aparecem; só o pedido (quem pede e o que lê) espera a API.
    return <AuthorizePageSkeleton />;
  }

  if (request.error) {
    const error = request.error;
    if (error instanceof ApiError && REQUEST_ERROR_CODES.has(error.code)) {
      const problem = requestProblem(error.code);
      return (
        <ErrorScreen
          {...problem}
          primary={{ label: 'Ir para o painel', onPress: () => goToPanel('/') }}
        />
      );
    }
    return (
      <ErrorScreen
        title="Algo deu errado"
        message={error instanceof ApiError ? error.message : 'Não foi você. Tente de novo em instantes.'}
        primary={{ label: 'Tentar de novo', onPress: () => void request.refetch() }}
      />
    );
  }

  const data = request.data;
  if (!data.signedIn || me.error || !me.data) {
    return <Navigate to={`/sign-in?return=${encodeURIComponent(returnTo)}`} replace />;
  }

  if (problemCode || new Date(data.expiresAt).getTime() <= Date.now()) {
    return (
      <ErrorScreen
        {...requestProblem(problemCode ?? 'request_expired')}
        primary={{ label: 'Ir para o painel', onPress: () => goToPanel('/') }}
      />
    );
  }

  const { client, sources } = data;
  const logo = isTrustedLogoUrl(client.logoUrl, API_URL) ? (
    <img src={client.logoUrl} alt="" width={52} height={52} referrerPolicy="no-referrer" />
  ) : undefined;
  const hints = sourceHints(sources ?? []);

  const decide = async (decision: Decision) => {
    setDeciding(decision);
    try {
      const redirectTo = await decideAuthorizeRequest(requestId, decision);
      if (!isSafeRedirectTarget(redirectTo)) {
        throw new ApiError(502, 'invalid_response', 'O servidor respondeu algo inesperado. Tente de novo em instantes.');
      }
      // A API manda a URL pronta; o web só navega, sem montar nem alterar.
      window.location.assign(redirectTo);
    } catch (error) {
      setDeciding(null);
      if (error instanceof ApiError && REQUEST_ERROR_CODES.has(error.code)) {
        setProblemCode(error.code);
        return;
      }
      notify.error(error instanceof ApiError ? error.message : 'Não deu para responder agora. Tente de novo.');
    }
  };

  const switchAccount = async () => {
    try {
      await deleteSession();
    } catch (error) {
      notify.error(error instanceof ApiError ? error.message : 'Não deu para trocar de conta agora.');
      return;
    }
    queryClient.clear();
    navigate(`/sign-in?return=${encodeURIComponent(returnTo)}`, { replace: true });
  };

  return (
    <AuthLayout
      headline="Você decide quem lê seus dados."
      subline="Só leitura. Dá para revogar quando quiser."
      below={<AccountLine email={me.data.email ?? 'sua conta'} onSwitch={() => void switchAccount()} />}
    >
      <ClientRequest name={client.name} logo={logo} verified={client.verified} returnDomain={client.domain} />
      {sources ? <SourcesList items={sources} /> : null}
      {hints.map((hint) => (
        <Notice key={hint.key} tone="info">
          {hint.text}{' '}
          {/* As conexões ficam no painel (outro app): link de página inteira, com a origem fixa do build. */}
          <a className="web-link" href={panelUrl('/connections')}>
            {hint.link}
          </a>
        </Notice>
      ))}
      <div className="web-stack">
        <Button
          className="web-full"
          isPending={deciding === 'approve'}
          isDisabled={deciding !== null}
          onPress={() => void decide('approve')}
        >
          Autorizar
        </Button>
        <Button
          className="web-full"
          variant="danger-text"
          isPending={deciding === 'deny'}
          isDisabled={deciding !== null}
          onPress={() => void decide('deny')}
        >
          Recusar
        </Button>
      </div>
    </AuthLayout>
  );
}
