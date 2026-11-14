import { Button, Dialog, Notice } from '@ufba-app/web-ui';
import { useEffect, useId, useState } from 'react';

export type DeleteProjectDialogProps = {
  isOpen: boolean;
  title: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Apagar o projeto: confirmação forte. O botão só habilita depois de digitar o título exatamente. */
export function DeleteProjectDialog({ isOpen, title, pending, error, onConfirm, onCancel }: DeleteProjectDialogProps) {
  const inputId = useId();
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (isOpen) setTyped('');
  }, [isOpen]);

  const matches = typed.trim() === title.trim();

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
      title="Apagar projeto?"
      actions={
        <>
          <Button variant="danger" isDisabled={!matches} isPending={pending} onPress={onConfirm}>
            Apagar projeto
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
          Isso apaga o projeto e também todo o conteúdo dele no memory, para todo mundo que tem acesso. Não dá para
          desfazer.
        </p>
        <div className="web-field">
          <label className="web-label" htmlFor={inputId}>
            Para confirmar, digite o título do projeto: {title}
          </label>
          <input
            id={inputId}
            className="ufba-field"
            type="text"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}
