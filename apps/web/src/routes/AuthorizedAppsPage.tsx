import { useQueryClient } from '@tanstack/react-query';
import { AppRow, Button, Chip, Dialog, EmptyState, Notice, PageHeader } from '@ufba-app/web-ui';
import { Suspense, useState } from 'react';
import { API_URL, ApiError } from '../api/client';
import { authorizedAppsQueryKey, revokeAppPermission, revokeAuthorizedApp, useAuthorizedApps } from '../api/authorizedApps';
import type { AppPermission, AuthorizedApp } from '../contract';
import { AppPermissions } from '../components/AppPermissions';
import { useSession } from '../components/AppLayout';
import { PhonesSection } from '../components/passkey/lazyPasskey';
import { AppRowsSkeleton } from '../components/Skeletons';
import { notify } from '../lib/notify';
import { isTrustedLogoUrl } from '../lib/safe';
import { useDocumentTitle } from '../lib/useDocumentTitle';

const appName = (app: AuthorizedApp) => app.name?.trim() || app.domain;

export function AuthorizedAppsPage() {
  useDocumentTitle('Apps autorizados');
  const queryClient = useQueryClient();
  const me = useSession();
  const { data, error, isPending, refetch } = useAuthorizedApps();
  const [toRevoke, setToRevoke] = useState<AuthorizedApp | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [busyPermission, setBusyPermission] = useState<string | null>(null);

  const revoke = async () => {
    if (!toRevoke) return;
    setRevoking(true);
    setRevokeError(null);
    try {
      await revokeAuthorizedApp(toRevoke.clientId);
      await queryClient.invalidateQueries({ queryKey: authorizedAppsQueryKey });
      setToRevoke(null);
    } catch (cause) {
      setRevokeError(cause instanceof ApiError ? cause.message : 'Não deu para revogar agora. Tente de novo.');
    } finally {
      setRevoking(false);
    }
  };

  /** Retira UMA permissão de um app, sem revogar o app. Sempre relê a lista: a API é quem sabe o que ficou. */
  const revokePermission = async (app: AuthorizedApp, permission: AppPermission) => {
    setBusyPermission(`${app.clientId}:${permission.key}`);
    try {
      await revokeAppPermission(app.clientId, permission.key);
      notify.success('Permissão retirada.');
    } catch (cause) {
      notify.error(cause instanceof ApiError && cause.status !== 0 ? cause.message : 'Não deu para retirar agora. Tente de novo.');
    } finally {
      setBusyPermission(null);
      await queryClient.invalidateQueries({ queryKey: authorizedAppsQueryKey });
    }
  };

  const apps = data?.apps ?? [];

  return (
    <>
      <PageHeader
        title="Apps autorizados"
        description="Quem pode ler seus dados. Revogue quando quiser."
        aside={data ? <Chip tone="highlight">{apps.length === 1 ? '1 app' : `${apps.length} apps`}</Chip> : undefined}
      />

      {isPending ? <AppRowsSkeleton /> : null}

      {error ? (
        <Notice tone="danger">
          {error instanceof ApiError ? error.message : 'Não deu para carregar os apps agora.'}{' '}
          <button type="button" className="web-link" onClick={() => void refetch()}>
            Tentar de novo
          </button>
        </Notice>
      ) : null}

      {data && apps.length === 0 ? (
        <EmptyState
          title="Nenhum app autorizado"
          description="Quando você autorizar um app, como o Claude, ele aparece aqui."
        />
      ) : null}

      {apps.length > 0 ? (
        <div className="web-list">
          {/* Cada app usa <h3>; este título mantém a ordem dos níveis (h1, h2, h3) para leitor de tela. */}
          <h2 className="ufba-visually-hidden">Lista de apps</h2>
          {apps.map((app) => (
            <AppRow
              key={app.clientId}
              name={appName(app)}
              logo={
                isTrustedLogoUrl(app.logoUrl, API_URL) ? (
                  <img src={app.logoUrl} alt="" width={48} height={48} referrerPolicy="no-referrer" />
                ) : undefined
              }
              verified={app.verified}
              returnDomain={app.domain}
              authorizedAt={new Date(app.authorizedAt)}
              lastUsedAt={app.lastUsedAt ? new Date(app.lastUsedAt) : undefined}
              extra={
                <AppPermissions
                  appName={appName(app)}
                  permissions={app.permissions}
                  busyKey={busyPermission?.startsWith(`${app.clientId}:`) ? busyPermission.slice(app.clientId.length + 1) : null}
                  onRevoke={(permission) => void revokePermission(app, permission)}
                />
              }
              onRevoke={() => {
                setRevokeError(null);
                setToRevoke(app);
              }}
            />
          ))}
        </div>
      ) : null}

      {/* Celulares ativados para liberar o SIGAA em outros aparelhos: bloco sob demanda (criptografia e QR não entram na primeira carga). */}
      <Suspense fallback={<AppRowsSkeleton rows={1} />}>
        <PhonesSection me={me} />
      </Suspense>

      <Dialog
        isOpen={toRevoke !== null}
        onOpenChange={(open) => {
          if (!open && !revoking) setToRevoke(null);
        }}
        title={`Revogar o ${toRevoke ? appName(toRevoke) : 'app'}?`}
        actions={
          <>
            <Button variant="danger" isPending={revoking} onPress={() => void revoke()}>
              Revogar acesso
            </Button>
            <Button variant="outline" isDisabled={revoking} onPress={() => setToRevoke(null)}>
              Cancelar
            </Button>
          </>
        }
      >
        <div className="web-fields">
          {revokeError ? <Notice tone="danger">{revokeError}</Notice> : null}
          <p className="web-muted">Ele perde o acesso na hora. Para voltar, autorize de novo.</p>
        </div>
      </Dialog>
    </>
  );
}
