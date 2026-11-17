import { Button, Chip, type ChipTone } from '@ufba-app/web-ui';
import type { Health } from '../../contract';
import './connectionHealth.css';

type HealthState = NonNullable<Health>['state'];
type HealthAction = NonNullable<NonNullable<Health>['action']>;

/** O texto do selo (a cor nunca fala sozinha) e o tom: verde, alerta, vermelho e cinza. Nunca o amarelo da marca. */
export const HEALTH_LABEL: Record<HealthState, string> = {
  ok: 'Funcionando',
  degraded: 'Com problema',
  action_required: 'Precisa de você',
  unknown: 'Sem leitura ainda',
};
const HEALTH_TONE: Record<HealthState, ChipTone> = { ok: 'success', degraded: 'warning', action_required: 'danger', unknown: 'neutral' };

/** O botão de cada ação que a API manda. */
export const HEALTH_ACTION_LABEL: Record<HealthAction, string> = { reconnect: 'Reconectar', unlock: 'Desbloquear', retry: 'Tentar de novo' };

/**
 * A saúde de uma conexão (api#79) no cartão de Conexões: selo de estado, a frase da API como veio e, quando há `action`,
 * o botão. Sem saúde (`null`: conexão que não existe) não mostra nada. `onAction` faz o que cada fonte faz (abrir o fluxo
 * de conectar, desbloquear ou pedir de novo); `showAction={false}` quando o cartão já tem o botão equivalente.
 */
export function ConnectionHealth({
  health,
  onAction,
  showAction = true,
}: {
  health: Health;
  onAction: (action: HealthAction) => void;
  showAction?: boolean;
}) {
  if (!health) return null;
  const { action } = health;
  return (
    <div className={`web-health web-health--${health.state}`}>
      <Chip tone={HEALTH_TONE[health.state]}>
        <span className="ufba-visually-hidden">Saúde da conexão: </span>
        {HEALTH_LABEL[health.state]}
      </Chip>
      <p className="web-health__message">{health.message}</p>
      {showAction && action ? (
        <Button variant="outline" size="sm" onPress={() => onAction(action)}>
          {HEALTH_ACTION_LABEL[action]}
        </Button>
      ) : null}
    </div>
  );
}
