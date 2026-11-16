import { Button } from '@ufba-app/web-ui';
import type { AppPermission } from '../contract';
import './appPermissions.css';

/**
 * "Autorizado com:" de um app em Apps autorizados (desenho: canvas, seção 4). Leitura é sempre o ponto de partida; abaixo,
 * cada permissão que a pessoa liberou para ESTE app, que dá para retirar sem revogar o app. Os textos vêm da API.
 */
export function AppPermissions({
  appName,
  permissions,
  busyKey,
  onRevoke,
}: {
  appName: string;
  permissions: AppPermission[];
  /** A permissão que está sendo retirada agora (desativa o botão dela). */
  busyKey: string | null;
  onRevoke: (permission: AppPermission) => void;
}) {
  return (
    <div className="web-appperm">
      <p className="web-appperm__rot">
        <span>Autorizado com:</span>
        <em>Leitura</em>
      </p>
      {permissions.length > 0 ? (
        <ul className="web-appperm__list" aria-label={`Permissões liberadas para ${appName}`}>
          {permissions.map((permission) => (
            <li key={permission.key}>
              <div>
                <b>{permission.title}</b>
                <small>{permission.description}</small>
              </div>
              <Button
                variant="danger-text"
                size="sm"
                isDisabled={busyKey === permission.key}
                aria-label={`Retirar: ${permission.title}, de ${appName}`}
                onPress={() => onRevoke(permission)}
              >
                Retirar
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
