import { Chip, ServiceIcon, serviceName, type ChipTone } from '@ufba-app/web-ui';
import type { AuthorizeSourceStatus, Source } from '../contract';

const view: Record<AuthorizeSourceStatus, { label: string; tone: ChipTone }> = {
  connected: { label: 'Conectado', tone: 'success' },
  disconnected: { label: 'Não conectado', tone: 'neutral' },
  password_required: { label: 'Precisa da senha', tone: 'warning' },
  reconnect_required: { label: 'Precisa reconectar', tone: 'warning' },
  // Provisório: o texto de `locked` (senha guardada sob passkey) ainda depende do desenho do André.
  locked: { label: 'Bloqueado', tone: 'warning' },
};

export type SourcesListProps = {
  items: Array<{ source: Source; status: AuthorizeSourceStatus }>;
};

/**
 * "Vai ver": as fontes que o app lê, com o estado de cada uma.
 * Provisório: o `ScopeList` do design system só conhece conectado ou não, e a API devolve quatro estados.
 * Usa as mesmas classes dele; sai daqui quando o `ScopeList` ganhar `status`.
 */
export function SourcesList({ items }: SourcesListProps) {
  return (
    <div className="ufba-scope">
      <p className="ufba-scope__label">Vai ver</p>
      <ul className="ufba-scope__list">
        {items.map(({ source, status }) => {
          const { label, tone } = view[status];
          return (
            <li key={source} aria-label={`${serviceName[source]}: ${label}`}>
              <span className="ufba-scope__icon">
                <ServiceIcon service={source} size={20} />
              </span>
              <span className="ufba-scope__name">{serviceName[source]}</span>
              <Chip tone={tone}>{label}</Chip>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
