import { Button, Dialog, Notice, serviceName, type Service } from '@ufba-app/web-ui';
// Entrada à parte do design system: o interruptor não entra na primeira carga do painel (ver web-ui/src/switch.ts).
import { Switch } from '@ufba-app/web-ui/switch';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { usePermissions, useSetPermission } from '../../api/permissions';
import type { Permission } from '../../contract';
import { notify } from '../../lib/notify';
import { isSourceOffered } from '../../lib/offeredSource';
import { useSession } from '../AppLayout';
import './permissions.css';

/** Nome da fonte para o título do grupo. Fonte que o design system ainda não conhece (SIASB) usa a própria chave. */
function sourceName(source: string): string {
  return source in serviceName ? serviceName[source as Service] : source.toUpperCase();
}

/** Agrupa por `source` mantendo a ordem em que a API devolveu. */
function groupBySource(items: Permission[]): Array<[string, Permission[]]> {
  const groups = new Map<string, Permission[]>();
  for (const item of items) groups.set(item.source, [...(groups.get(item.source) ?? []), item]);
  return [...groups.entries()];
}

const GENERIC_ERROR = 'Algo deu errado. Tente de novo em instantes.';

/**
 * "Permissões": o que o Claude pode fazer em nome da pessoa, uma lista de interruptores por fonte. Todo texto vem da
 * API (`title`, `description`); aqui só entram o nome da fonte e as notas de estado combinadas na spec.
 * Todos nascem desligados. `risk=high` pede confirmação antes de LIGAR; desligar nunca pede.
 */
export function PermissionsSection() {
  const me = useSession();
  const { data: all, error, isPending, refetch } = usePermissions(me);
  // O que é de uma fonte que a pessoa não tem (SIASB sem acesso) nem aparece na lista.
  const data = all ? { items: all.items.filter((item) => isSourceOffered(me, item.source)) } : undefined;
  const [confirming, setConfirming] = useState<Permission | null>(null);
  const [inFlight, setInFlight] = useState<ReadonlySet<string>>(new Set());

  const mutation = useSetPermission(me, {
    onError: (cause) => {
      if (cause instanceof ApiError && cause.code === 'permission_unavailable') {
        notify.error('Conecte a fonte antes de ligar.');
      } else {
        notify.error(cause instanceof ApiError && cause.status !== 0 ? cause.message : GENERIC_ERROR);
      }
    },
  });

  const change = (permission: Permission, enabled: boolean) => {
    setInFlight((current) => new Set(current).add(permission.key));
    mutation.mutate(
      { permission, enabled },
      {
        onSettled: () =>
          setInFlight((current) => {
            const next = new Set(current);
            next.delete(permission.key);
            return next;
          }),
      },
    );
  };

  /** Interruptor tocado: ligar um item de risco alto abre a confirmação; o resto vai direto. */
  const toggle = (permission: Permission, enabled: boolean) => {
    if (enabled && permission.risk === 'high') setConfirming(permission);
    else change(permission, enabled);
  };

  // A seção pode nem existir (nenhuma fonte com permissão, ou a API ainda sem a rota). Por isso não há skeleton: um
  // título com esqueleto que depois some piscaria em toda visita a Conexões. Ela entra quando a lista chega.
  if (isPending) return null;
  // Sem nada para mostrar (nenhuma fonte tem permissão), a seção some em vez de abrir um bloco vazio.
  if (!error && data && data.items.length === 0) return null;
  // Enquanto a API ainda não publica a rota (404), a seção também some: Conexões não ganha um erro à toa.
  if (error instanceof ApiError && error.status === 404 && !data) return null;

  return (
    <section className="web-perm" aria-labelledby="web-perm-title">
      <h2 id="web-perm-title" className="web-perm__title">
        Permissões
      </h2>

      {error && !data ? (
        <Notice tone="danger">
          {error instanceof ApiError ? error.message : 'Não deu para carregar as permissões agora.'}{' '}
          <button type="button" className="web-link" onClick={() => void refetch()}>
            Tentar de novo
          </button>
        </Notice>
      ) : null}

      {data
        ? groupBySource(data.items).map(([source, items]) => (
            <div key={source} className="web-perm__group" role="group" aria-label={sourceName(source)}>
              <h3 className="web-perm__source">{sourceName(source)}</h3>
              <ul className="web-perm__list">
                {items.map((permission) => (
                  <li key={permission.key} className="web-perm__item">
                    <div className="web-perm__text">
                      <b>{permission.title}</b>
                      <p>{permission.description}</p>
                      {!permission.available ? (
                        <p className="web-perm__note">Conecte o {sourceName(permission.source)} para liberar</p>
                      ) : null}
                    </div>
                    <Switch
                      aria-label={permission.title}
                      isSelected={permission.enabled}
                      isDisabled={!permission.available || inFlight.has(permission.key)}
                      onChange={(enabled) => toggle(permission, enabled)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))
        : null}

      <Dialog
        isOpen={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title={confirming?.title ?? 'Ligar permissão'}
        actions={
          <>
            <Button
              onPress={() => {
                if (confirming) change(confirming, true);
                setConfirming(null);
              }}
            >
              Ligar
            </Button>
            <Button variant="outline" onPress={() => setConfirming(null)}>
              Cancelar
            </Button>
          </>
        }
      >
        <p className="web-muted">{confirming?.description}</p>
      </Dialog>
    </section>
  );
}
