import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, Notice, ServiceIcon } from '@ufba-app/web-ui';
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '../api/client';
import { connectSigaa } from '../api/connections';
import { meQueryKey } from '../api/me';
import { sigaaFormSchema, type SigaaFormInput, type SigaaFormValues } from '../forms/sigaa';
import { LockIcon } from './icons';

/** Onde a senha é cifrada e guardada: o backend (repositório público). */
const SOURCE_CODE_URL = 'https://github.com/ufba-app/platform';

export type SigaaDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConnected: () => void;
};

/**
 * Conectar (ou reconectar) o SIGAA. A senha vai direto do navegador para a API: sem proxy, sem servidor do web.
 * Ela só existe neste formulário, é apagada do campo assim que sai, e nunca vai para log, URL ou mensagem de erro.
 */
export function SigaaDialog({ isOpen, onOpenChange, onConnected }: SigaaDialogProps) {
  const formId = useId();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    resetField,
    formState: { errors },
  } = useForm<SigaaFormInput, unknown, SigaaFormValues>({
    resolver: zodResolver(sigaaFormSchema),
    defaultValues: { login: '', password: '' },
  });

  useEffect(() => {
    if (!isOpen) {
      reset();
      setError(null);
      setPending(false);
    }
  }, [isOpen, reset]);

  const submit = handleSubmit(async ({ login, password }) => {
    // Some do campo (e do estado do formulário) antes da requisição; `password` só vive nesta função.
    resetField('password', { defaultValue: '' });
    setError(null);
    setPending(true);
    try {
      await connectSigaa({ login, password });
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      onConnected();
      onOpenChange(false);
    } catch (cause) {
      // A mensagem vem pronta da API (pt-BR) e nunca contém a senha.
      setError(cause instanceof ApiError ? cause.message : 'Não deu para conectar agora. Tente de novo.');
    } finally {
      setPending(false);
    }
  });

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      icon={<ServiceIcon service="sigaa" size={26} />}
      title="Conectar o SIGAA"
      actions={
        <>
          <Button type="submit" form={formId} isPending={pending}>
            Conectar
          </Button>
          <Button variant="outline" isDisabled={pending} onPress={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </>
      }
    >
      <form id={formId} className="web-fields" onSubmit={(e) => void submit(e)} noValidate>
        <p className="web-muted">Use o usuário e a senha do SIGAA.</p>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="web-field">
          <label className="web-label">
            Usuário do SIGAA
            <input
              className="ufba-field"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={errors.login ? true : undefined}
              aria-describedby={errors.login ? `${formId}-login-error` : `${formId}-hint`}
              {...register('login')}
            />
          </label>
          {errors.login ? (
            <span id={`${formId}-login-error`} className="web-field-error">
              {errors.login.message}
            </span>
          ) : (
            <span id={`${formId}-hint`} className="web-hint">
              o mesmo que você usa no site do SIGAA
            </span>
          )}
        </div>
        <div className="web-field">
          <label className="web-label">
            Senha do SIGAA
            <input
              className="ufba-field"
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? `${formId}-password-error` : undefined}
              {...register('password')}
            />
          </label>
          {errors.password ? (
            <span id={`${formId}-password-error`} className="web-field-error">
              {errors.password.message}
            </span>
          ) : null}
        </div>
        <Notice tone="info" icon={<LockIcon />}>
          A senha é cifrada com uma chave que o servidor sozinho não consegue abrir, e o código é aberto:{' '}
          <a href={SOURCE_CODE_URL} target="_blank" rel="noopener noreferrer">
            veja no GitHub
          </a>
          .
        </Notice>
      </form>
    </Dialog>
  );
}
