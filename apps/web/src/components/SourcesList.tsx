import { useEffect, useRef } from 'react';
import { Button, Chip, ServiceIcon, serviceName, type ChipTone } from '@ufba-app/web-ui';
// Entrada à parte do design system: o interruptor não entra na primeira carga (ver web-ui/src/switch.ts).
import { Switch } from '@ufba-app/web-ui/switch';
import type { AuthorizeSource, AuthorizeSourceStatus, OfferedPermission } from '../contract';
import { panelUrl } from '../lib/origins';
import { SiasbIcon } from './siasb/SiasbIcon';
import './sourcesList.css';

const view: Record<AuthorizeSourceStatus, { label: string; tone: ChipTone }> = {
  connected: { label: 'Conectado', tone: 'success' },
  disconnected: { label: 'Não conectado', tone: 'neutral' },
  password_required: { label: 'Precisa da senha', tone: 'warning' },
  reconnect_required: { label: 'Precisa reconectar', tone: 'warning' },
  // Senha guardada sob a digital do celular: "Trancado" é a palavra do desenho (Conexões e autorizar).
  locked: { label: 'Trancado', tone: 'warning' },
};

/** O `web-ui` só tem vetores de SIGAA, Moodle e Classroom; o SIASB tem a marca do canvas, só no web. */
export const sourceLabel = (source: AuthorizeSource): string => (source === 'siasb' ? 'SIASB' : serviceName[source]);

function SourceMark({ source }: { source: AuthorizeSource }) {
  return source === 'siasb' ? <SiasbIcon size={20} /> : <ServiceIcon service={source} size={20} />;
}

export type PermissionsState = {
  /** O que o pedido oferece (já só de fontes a que a pessoa tem acesso). */
  offered: OfferedPermission[];
  /** As chaves marcadas na tela. Tudo nasce desligado. */
  granted: ReadonlySet<string>;
  /** A permissão de risco alto que está esperando a confirmação para ligar. */
  confirming: string | null;
  disabled: boolean;
  onToggle: (permission: OfferedPermission, on: boolean) => void;
  onConfirm: (permission: OfferedPermission) => void;
  onCancelConfirm: () => void;
};

export type SourcesListProps = {
  items: Array<{ source: AuthorizeSource; status: AuthorizeSourceStatus }>;
  permissions?: PermissionsState;
};

/**
 * Confirmação de uma permissão de risco alto, dentro da área rolável da fonte. Ao abrir, rola até ela (a área tem altura
 * fixa: sem isso a confirmação podia nascer fora da vista). O texto não promete nada que a API não prometa: o que cada
 * ação exige vem na descrição da permissão, que é da API.
 */
function ConfirmBlock({ title, onConfirm, onCancel }: { title: string; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  return (
    <div ref={ref} className="web-perm-confirm" role="group" aria-label={`Confirmar: ${title}`}>
      <p>
        <b>Esta permissão é sensível.</b> Ao ligar, o app poderá fazer isso em seu nome. Ligar mesmo assim?
      </p>
      <div className="web-perm-confirm__acoes">
        <Button size="sm" onPress={onConfirm}>
          Ligar
        </Button>
        <Button size="sm" variant="outline" onPress={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function PermissionGroup({ source, state }: { source: AuthorizeSource; state: PermissionsState }) {
  const own = state.offered.filter((permission) => permission.source === source);
  if (own.length === 0) return null;
  const name = sourceLabel(source);
  // Sem a fonte conectada nada pode ser ligado: só a nota e o caminho para conectar (como no desenho).
  const allUnavailable = own.every((permission) => !permission.available);
  const anyOn = own.some((permission) => state.granted.has(permission.key));

  if (allUnavailable) {
    return (
      <div className="web-perm-off">
        Conecte o {name} para o app poder usar estas permissões.{' '}
        <a className="web-link" href={panelUrl('/connections')}>
          Conectar agora
        </a>
      </div>
    );
  }

  return (
    // Altura FIXA, com rolagem própria (um cartão por fonte): ligar uma permissão, abrir a confirmação ou mostrar o aviso
    // nunca estica a tela, o conteúdo novo entra DENTRO da área. `tabIndex` deixa o teclado rolar a área.
    <div
      className={`web-perm-grp ${own.length === 1 ? 'web-perm-grp--one' : 'web-perm-grp--many'}`}
      role="group"
      aria-label={`Permissões do ${name}`}
      tabIndex={0}
    >
      {own.map((permission) => {
        const on = state.granted.has(permission.key);
        const confirming = state.confirming === permission.key;
        return (
          <div key={permission.key} className={`web-perm-it${on ? ' web-perm-it--on' : ''}`}>
            <div className="web-perm-it__row">
              <div className="web-perm-it__text">
                <b>{permission.title}</b>
                <small>{permission.description}</small>
              </div>
              <Switch
                aria-label={permission.title}
                isSelected={on}
                isDisabled={state.disabled || !permission.available}
                onChange={(next) => state.onToggle(permission, next)}
              />
            </div>
            {confirming ? (
              <ConfirmBlock title={permission.title} onConfirm={() => state.onConfirm(permission)} onCancel={state.onCancelConfirm} />
            ) : null}
          </div>
        );
      })}
      {anyOn ? (
        <p className="web-perm-aviso" role="status">
          <b>Este app poderá agir em seu nome no {name}.</b> Você vê isso depois em Apps autorizados.
        </p>
      ) : null}
    </div>
  );
}

/**
 * "Vai ver": as fontes que o app lê, com o estado de cada uma, e, sob cada fonte, as permissões que o pedido oferece
 * (interruptores, todos desligados; risco alto pede confirmação; sem a fonte conectada vem o caminho para conectar).
 * Provisório: o `ScopeList` do design system só conhece conectado ou não, e a API devolve quatro estados.
 * Usa as mesmas classes dele; sai daqui quando o `ScopeList` ganhar `status`.
 */
export function SourcesList({ items, permissions }: SourcesListProps) {
  return (
    <div className="ufba-scope">
      <p className="ufba-scope__label">Vai ver</p>
      <ul className="ufba-scope__list">
        {items.map(({ source, status }) => {
          const { label, tone } = view[status];
          return (
            <li key={source} className="web-src" aria-label={`${sourceLabel(source)}: ${label}`}>
              <div className="web-src__row">
                <span className="ufba-scope__icon">
                  <SourceMark source={source} />
                </span>
                <span className="ufba-scope__name">{sourceLabel(source)}</span>
                <Chip tone={tone}>{label}</Chip>
              </div>
              {permissions ? <PermissionGroup source={source} state={permissions} /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
