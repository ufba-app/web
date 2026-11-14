import { useQueryClient } from '@tanstack/react-query';
import { AppRow, Button, Chip, Dialog, EmptyState, Notice, PageHeader } from '@ufba-app/web-ui';
import { useState } from 'react';
import { API_URL, ApiError } from '../api/client';
import { authorizedAppsQueryKey, revokeAuthorizedApp, useAuthorizedApps } from '../api/authorizedApps';
import type { AuthorizedApp } from '../contract';
import { AppRowsSkeleton } from '../components/Skeletons';
import { isTrustedLogoUrl } from '../lib/safe';
import { useDocumentTitle } from '../lib/useDocumentTitle';

const appName = (app: AuthorizedApp) => app.name?.trim() || app.domain;

export function AuthorizedAppsPage() {
  useDocumentTitle('Apps autorizados');
  const queryClient = useQueryClient();
  const { data, error, isPending, refetch } = useAuthorizedApps();
  const [toRevoke, setToRevoke] = useState<AuthorizedApp | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

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
              onRevoke={() => {
                setRevokeError(null);
                setToRevoke(app);
              }}
            />
          ))}
        </div>
      ) : null}

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
