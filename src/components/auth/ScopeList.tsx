import { Chip } from '../Chip';
import { ServiceIcon, serviceName, type Service } from './ServiceIcon';

export type ScopeListProps = {
  items: Array<{ service: Exclude<Service, 'google'>; connected: boolean }>;
};

/** "Vai ver": as fontes que o app vai ler, cada uma com o estado da conexão. */
export function ScopeList({ items }: ScopeListProps) {
  return (
    <div className="ufba-scope">
      <p className="ufba-scope__label">Vai ver</p>
      <ul className="ufba-scope__list">
        {items.map(({ service, connected }) => {
          const state = connected ? 'Conectado' : 'Não conectado';
          return (
            <li key={service} aria-label={`${serviceName[service]}: ${state}`}>
              <span className="ufba-scope__icon">
                <ServiceIcon service={service} size={20} />
              </span>
              <span className="ufba-scope__name">{serviceName[service]}</span>
              <Chip tone={connected ? 'success' : 'neutral'}>{state}</Chip>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
