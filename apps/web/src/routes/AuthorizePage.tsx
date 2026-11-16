import { useQueryClient } from '@tanstack/react-query';
import { AccountLine, AuthLayout, Button, ClientRequest, Notice } from '@ufba-app/web-ui';
import { Suspense, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { decideAuthorizeRequest, useAuthorizeRequest, type Decision } from '../api/authorize';
import { API_URL, ApiError } from '../api/client';
import { useMe } from '../api/me';
import { deleteSession } from '../api/session';
import { ErrorScreen } from '../components/ErrorScreen';
import { CheckIcon } from '../components/passkey/icons';
import { QrUnlockBlock, UnlockWithFingerprint } from '../components/passkey/lazyUnlock';
import { AuthorizePageSkeleton } from '../components/Skeletons';
import { SourcesList, sourceLabel, type PermissionsState } from '../components/SourcesList';
import type { AuthorizeSource, AuthorizeSourceStatus, OfferedPermission } from '../contract';
import { goToPanel } from '../auth/destination';
import { notify } from '../lib/notify';
import { panelUrl } from '../lib/origins';
import { isSafeRedirectTarget, isTrustedLogoUrl } from '../lib/safe';
import { looksLikePhone } from '../lib/passkey/webauthn';
import { useDocumentTitle } from '../lib/useDocumentTitle';


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
function sourceHints(sources: Array<{ source: AuthorizeSource; status: AuthorizeSourceStatus }>): Array<{ key: string; text: string; link: string }> {
  if (sources.every((s) => s.status === 'disconnected')) {
    return [{ key: 'none', text: 'Sem fontes conectadas, o app não vê nada ainda.', link: 'Conectar agora' }];
  }
  const hints: Array<{ key: string; text: string; link: string }> = [];
  for (const { source, status } of sources) {
    if (status === 'password_required') {
      hints.push({
        key: `${source}-password`,
        text: `O ${sourceLabel(source)} só vai aparecer para o app depois que você digitar a senha.`,
        link: 'Digitar senha',
      });
    } else if (status === 'reconnect_required') {
      hints.push({
        key: `${source}-reconnect`,
        text: `O ${sourceLabel(source)} precisa ser reconectado para o app poder ler.`,
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
  // SIGAA trancado: no celular um botão com a digital; no computador o QR. Ao liberar, o pedido é recarregado.
  const [phone] = useState(looksLikePhone);
  const [unlocked, setUnlocked] = useState(false);
  // Permissões por app (SIASB…): tudo nasce desligado. `touched` = a pessoa mexeu em algum interruptor: só então o conjunto
  // vai no approve (a API grava o conjunto EXATO; sem mexer, nada é enviado e o que o app já tinha continua valendo).
  const [granted, setGranted] = useState<ReadonlySet<string>>(new Set());
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

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
  const setGrant = (key: string, on: boolean) => {
    setTouched(true);
    setGranted((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };
  /** Ligar risco alto pede confirmação antes; desligar nunca pede. */
  const toggle = (permission: OfferedPermission, on: boolean) => {
    if (!on) {
      setConfirming(null);
      setGrant(permission.key, false);
    } else if (permission.risk === 'high') {
      setConfirming(permission.key);
    } else {
      setGrant(permission.key, true);
    }
  };
  const permissionsState: PermissionsState | undefined =
    data.permissions.length > 0
      ? {
          offered: data.permissions,
          granted,
          confirming,
          disabled: deciding !== null,
          onToggle: toggle,
          onConfirm: (permission) => {
            setConfirming(null);
            setGrant(permission.key, true);
          },
          onCancelConfirm: () => setConfirming(null),
        }
      : undefined;
  const logo = isTrustedLogoUrl(client.logoUrl, API_URL) ? (
    <img src={client.logoUrl} alt="" width={52} height={52} referrerPolicy="no-referrer" />
  ) : undefined;
  const sigaaStatus = sources?.find((item) => item.source === 'sigaa')?.status;
  const sigaaLocked = sigaaStatus === 'locked';
  // No computador, com o SIGAA fechado (trancado, sem sessão ou sem cofre), o QR do celular vem sempre; no celular,
  // só o trancado tem o bloco (a digital).
  const showQr = !phone && (sigaaLocked || sigaaStatus === 'disconnected' || sigaaStatus === 'password_required');
  const showUnlock = phone ? sigaaLocked : showQr;
  // Com o bloco na tela, ele já é o caminho de "digitar a senha": sem a dica repetida para o SIGAA.
  const hints = sourceHints(sources ?? []).filter((hint) => !(showQr && (hint.key === 'none' || hint.key === 'sigaa-password')));
  const onUnlocked = () => {
    setUnlocked(true);
    void request.refetch();
    void me.refetch();
  };

  const decide = async (decision: Decision) => {
    setDeciding(decision);
    try {
      const redirectTo = await decideAuthorizeRequest(requestId, decision, decision === 'approve' && touched ? [...granted] : undefined);
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
      {sources ? <SourcesList items={sources} permissions={permissionsState} /> : null}
      {showUnlock ? (
        // Bloco sob demanda (criptografia e QR não entram na primeira carga). A senha continua sendo a saída:
        // as conexões ficam no painel (outro app), então "digite a senha" é um link de página inteira.
        <Suspense fallback={<div className="web-sk web-sk--card skeleton skeleton--shimmer web-sk-onwhite" aria-hidden="true" />}>
          {phone ? (
            <UnlockWithFingerprint
              userId={me.data.id}
              onUnlocked={onUnlocked}
              onUsePassword={() => window.location.assign(panelUrl('/connections'))}
            />
          ) : (
            <QrUnlockBlock
              compact
              locked={sigaaLocked}
              client={client.name?.trim() || client.domain}
              onUnlocked={onUnlocked}
              onUsePassword={() => window.location.assign(panelUrl('/connections'))}
            />
          )}
        </Suspense>
      ) : null}
      {unlocked && !showUnlock ? (
        <Notice tone="info" icon={<CheckIcon size={20} />}>
          SIGAA liberado pelo seu celular. Pode autorizar.
        </Notice>
      ) : null}
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
