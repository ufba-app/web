import { Button, Dialog, Notice, ServiceIcon } from '@ufba-app/web-ui';
import { SiasbIcon } from './siasb/SiasbIcon';

export type DisconnectSource = 'sigaa' | 'moodle' | 'siasb';

const NAME: Record<DisconnectSource, string> = { sigaa: 'SIGAA', moodle: 'Moodle', siasb: 'SIASB' };

export type DisconnectDialogProps = {
  /** Fonte a desconectar; `null` mantém o diálogo fechado. */
  source: DisconnectSource | null;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Confirmação antes de desconectar uma fonte. Não existe no design (acrescentada a pedido do backend). */
export function DisconnectDialog({ source, pending, error, onConfirm, onCancel }: DisconnectDialogProps) {
  const name = source ? NAME[source] : '';
  return (
    <Dialog
      isOpen={source !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
      icon={source === 'siasb' ? <SiasbIcon size={26} /> : source ? <ServiceIcon service={source} size={26} /> : undefined}
      title={`Desconectar o ${name}?`}
      actions={
        <>
          <Button variant="danger" isPending={pending} onPress={onConfirm}>
            Desconectar
          </Button>
          <Button variant="outline" isDisabled={pending} onPress={onCancel}>
            Cancelar
          </Button>
        </>
      }
    >
      <div className="web-fields">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <p className="web-muted">{`Para voltar a ler o ${name}, você precisa conectar de novo.`}</p>
      </div>
    </Dialog>
  );
}
