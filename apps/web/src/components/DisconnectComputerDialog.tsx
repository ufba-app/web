import { Button, Dialog, Notice } from '@ufba-app/web-ui';
import type { MemoryComputer } from '../contract';

export type DisconnectComputerDialogProps = {
  /** Computador a desconectar; `null` mantém o diálogo fechado. */
  computer: MemoryComputer | null;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Confirmação antes de revogar a chave de um computador. O efeito é imediato. */
export function DisconnectComputerDialog({ computer, pending, error, onConfirm, onCancel }: DisconnectComputerDialogProps) {
  return (
    <Dialog
      isOpen={computer !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
      title={`Desconectar ${computer?.name ?? 'o computador'}?`}
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
        <p className="web-muted">
          A chave deste computador para de funcionar na hora, e os hooks dele passam a falhar até você reconectar.
        </p>
      </div>
    </Dialog>
  );
}
