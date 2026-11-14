import { Chip, type ChipTone } from '../Chip';
import { Button } from '../Button';

export type AccountStatus = 'connected' | 'pending' | 'expired';

const statusView: Record<AccountStatus, { label: string; tone: ChipTone }> = {
  connected: { label: 'Conectada', tone: 'success' },
  pending: { label: 'Aguardando liberação', tone: 'warning' },
  expired: { label: 'Acesso expirou', tone: 'danger' },
};

export type AccountRowProps = {
  email: string;
  status: AccountStatus;
  /** Linha de apoio curta (ex.: "Avisamos quando liberar."). */
  note?: string;
  onRemove?: () => void;
};

/** Uma conta Google pessoal ligada ao Classroom. */
export function AccountRow({ email, status, note, onRemove }: AccountRowProps) {
  const view = statusView[status];
  return (
    <div className="ufba-account">
      <div className="ufba-account__text">
        <span className="ufba-account__email">{email}</span>
        {note ? <span className="ufba-account__note">{note}</span> : null}
      </div>
      <Chip tone={view.tone}>{view.label}</Chip>
      {onRemove ? (
        <Button variant="ghost" size="sm" aria-label={`Remover ${email}`} onPress={onRemove}>
          Remover
        </Button>
      ) : null}
    </div>
  );
}
