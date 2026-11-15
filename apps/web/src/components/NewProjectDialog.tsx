import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Dialog, Notice } from '@ufba-app/web-ui';
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '../api/client';
import { createMemoryProject } from '../api/memory';
import type { MemoryProject } from '../contract';
import { projectNameFormSchema, type ProjectNameFormInput, type ProjectNameFormValues } from '../forms/projectName';

export type NewProjectDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (project: MemoryProject) => void;
};

/** Criar um projeto (nome de 1 a 60 caracteres). Nome repetido aparece no campo. */
export function NewProjectDialog({ isOpen, onClose, onCreated }: NewProjectDialogProps) {
  const formId = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors },
  } = useForm<ProjectNameFormInput, unknown, ProjectNameFormValues>({
    resolver: zodResolver(projectNameFormSchema),
    defaultValues: { name: '' },
  });

  useEffect(() => {
    if (!isOpen) return;
    reset({ name: '' });
    setError(null);
    setPending(false);
  }, [isOpen, reset]);

  const submit = handleSubmit(async ({ name }) => {
    setError(null);
    setPending(true);
    try {
      onCreated(await createMemoryProject(name));
    } catch (cause) {
      if (cause instanceof ApiError && (cause.code === 'project_name_taken' || cause.code === 'invalid_request')) {
        setFieldError('name', { type: 'server', message: cause.message });
      } else {
        setError(cause instanceof ApiError ? cause.message : 'Não deu para criar o projeto agora. Tente de novo.');
      }
    } finally {
      setPending(false);
    }
  });

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      title="Novo projeto"
      actions={
        <>
          <Button type="submit" form={formId} isPending={pending}>
            Criar projeto
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
            Nome do projeto
            <input
              className="ufba-field"
              type="text"
              autoComplete="off"
              enterKeyHint="done"
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
