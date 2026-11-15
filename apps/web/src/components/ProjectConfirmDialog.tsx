import { Button, Dialog, Notice } from '@ufba-app/web-ui';
import type { ReactNode } from 'react';

export type ProjectConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  confirmLabel: string;
  /** Ação destrutiva usa o botão vermelho. */
  danger?: boolean;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
};

/** Confirmação simples de uma ação sobre o projeto (transferir posse, sair do projeto). */
export function ProjectConfirmDialog({
  isOpen,
  title,
  confirmLabel,
  danger = false,
  pending,
  error,
  onConfirm,
  onCancel,
  children,
}: ProjectConfirmDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
      title={title}
      actions={
        <>
          <Button variant={danger ? 'danger' : 'primary'} isPending={pending} onPress={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="outline" isDisabled={pending} onPress={onCancel}>
            Cancelar
          </Button>
        </>
      }
    >
      <div className="web-fields">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <p className="web-muted">{children}</p>
      </div>
    </Dialog>
  );
}
