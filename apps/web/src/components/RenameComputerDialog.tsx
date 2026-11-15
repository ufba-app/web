import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Dialog, Notice } from '@ufba-app/web-ui';
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '../api/client';
import { renameMemoryComputer } from '../api/memory';
import type { MemoryComputer } from '../contract';
import { computerNameFormSchema, type ComputerNameFormInput, type ComputerNameFormValues } from '../forms/computerName';

export type RenameComputerDialogProps = {
  /** Computador a renomear; `null` mantém o diálogo fechado. */
  computer: MemoryComputer | null;
  onClose: () => void;
  onRenamed: (name: string) => void;
};

/** Renomear um computador conectado (1 a 60 caracteres). */
export function RenameComputerDialog({ computer, onClose, onRenamed }: RenameComputerDialogProps) {
  const formId = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ComputerNameFormInput, unknown, ComputerNameFormValues>({
    resolver: zodResolver(computerNameFormSchema),
    defaultValues: { name: '' },
  });

  useEffect(() => {
    reset({ name: computer?.name ?? '' });
    setError(null);
    setPending(false);
  }, [computer, reset]);

  const submit = handleSubmit(async ({ name }) => {
    if (!computer) return;
    setError(null);
    setPending(true);
    try {
      await renameMemoryComputer(computer.id, name);
      onRenamed(name);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não deu para renomear agora. Tente de novo.');
    } finally {
      setPending(false);
    }
  });

  return (
    <Dialog
      isOpen={computer !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      title="Renomear computador"
      actions={
        <>
          <Button type="submit" form={formId} isPending={pending}>
            Salvar
          </Button>
          <Button variant="outline" isDisabled={pending} onPress={onClose}>
            Cancelar
          </Button>
        </>
      }
    >
      <form id={formId} className="web-fields" onSubmit={(e) => void submit(e)} noValidate>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="web-field">
          <label className="web-label">
            Nome do computador
            <input
              className="ufba-field"
              type="text"
              autoComplete="off"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${formId}-name-error` : undefined}
              {...register('name')}
            />
          </label>
          {errors.name ? (
            <span id={`${formId}-name-error`} className="web-field-error">
              {errors.name.message}
            </span>
          ) : null}
        </div>
      </form>
    </Dialog>
  );
}
