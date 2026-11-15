import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, Notice } from '@ufba-app/web-ui';
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '../api/client';
import { connectSiasb } from '../api/connections';
import { meQueryKey } from '../api/me';
import { siasbFormSchema, type SiasbFormInput, type SiasbFormValues } from '../forms/siasb';
import { notify } from '../lib/notify';
import { LockIcon } from './icons';
import { formatShortDate } from './siasb/dates';
import { SiasbIcon } from './siasb/SiasbIcon';

/** O site do SIASB, para quem ainda tem a senha antiga e precisa entrar lá uma vez. */
const SIASB_SITE_URL = 'https://www.siasb.ufba.br';

type Failure = 'credentials' | 'migration' | 'unavailable' | 'attempts' | 'other';

export type SiasbDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** `expiresAt` já atualizado (estimativa: login + 30 dias), para o aviso de "conectado". */
  expiresAt: string | null;
};

/**
 * Conectar (ou reconectar) o SIASB. Só a senha: a matrícula vem do perfil. A senha vai direto do navegador para a API,
 * é usada uma vez para entrar no SIASB e não fica guardada. Ela só existe neste formulário, é apagada do campo assim
 * que sai, e nunca vai para log, URL, estado persistente ou mensagem de erro.
 */
export function SiasbDialog({ isOpen, onOpenChange, expiresAt }: SiasbDialogProps) {
  const formId = useId();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<{ kind: Failure; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    resetField,
    setFocus,
    formState: { errors },
  } = useForm<SiasbFormInput, unknown, SiasbFormValues>({
    resolver: zodResolver(siasbFormSchema),
    defaultValues: { password: '' },
  });

  useEffect(() => {
    if (!isOpen) {
      reset();
      setFailure(null);
      setPending(false);
      setDone(false);
    }
  }, [isOpen, reset]);

  const submit = handleSubmit(async ({ password }) => {
    // Some do campo (e do estado do formulário) antes da requisição; `password` só vive nesta função.
    resetField('password', { defaultValue: '' });
    setFailure(null);
    setPending(true);
    try {
      await connectSiasb(password);
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      notify.success('SIASB conectado.');
      setDone(true);
    } catch (cause) {
      setFailure(describe(cause));
      // A senha foi apagada: volta o cursor ao campo para a pessoa digitar de novo.
      queueMicrotask(() => setFocus('password'));
    } finally {
      setPending(false);
    }
  });

  if (done) {
    return (
      <Dialog
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        icon={<SiasbIcon size={26} />}
        title="SIASB conectado"
        actions={<Button onPress={() => onOpenChange(false)}>Concluir</Button>}
      >
        <p className="web-muted">
          {expiresAt ? `Acesso válido por 30 dias, até ${formatShortDate(expiresAt)}.` : 'Acesso válido por 30 dias.'}
        </p>
      </Dialog>
    );
  }

  const retryLabel = failure?.kind === 'unavailable' || failure?.kind === 'migration' ? 'Tentar de novo' : 'Conectar';

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      icon={<SiasbIcon size={26} />}
      title="Conectar o SIASB"
      actions={
        <>
          <Button type="submit" form={formId} isPending={pending}>
            {retryLabel}
          </Button>
          <Button variant="outline" isDisabled={pending} onPress={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </>
      }
    >
      <form id={formId} className="web-fields" onSubmit={(e) => void submit(e)} noValidate>
        <p className="web-muted">A matrícula vem do seu perfil. Falta só a senha.</p>
        {failure ? (
          <Notice tone={failure.kind === 'migration' ? 'warning' : 'danger'}>
            {failure.message}
            {failure.kind === 'migration' ? (
              <>
                {' '}
                <a href={SIASB_SITE_URL} target="_blank" rel="noopener noreferrer">
                  Abrir o SIASB
                </a>
              </>
            ) : null}
          </Notice>
        ) : null}
        <div className="web-field">
          <label className="web-label">
            Senha do SIASB
            <input
              className="ufba-field"
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password || failure?.kind === 'credentials' ? true : undefined}
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
        {pending ? (
          <p className="web-muted" role="status">
            Entrando no SIASB…
          </p>
        ) : null}
        <Notice tone="info" icon={<LockIcon />}>
          Sua senha é usada uma vez para entrar no SIASB e não fica guardada. O acesso vale por 30 dias.
        </Notice>
      </form>
    </Dialog>
  );
}

/** Converte o erro da API no texto da tela. Nunca devolve a senha (ela nem chega aqui). */
function describe(cause: unknown): { kind: Failure; message: string } {
  if (cause instanceof ApiError) {
    if (cause.code === 'siasb_credentials_rejected') {
      return { kind: 'credentials', message: 'Senha incorreta. Confira e tente de novo.' };
    }
    if (cause.code === 'siasb_password_migration_required') {
      return {
        kind: 'migration',
        message: 'Sua senha ainda é a antiga do SIASB. Entre uma vez no SIASB para atualizar a senha e volte aqui.',
      };
    }
    if (cause.code === 'siasb_unavailable') {
      return { kind: 'unavailable', message: 'O SIASB está fora do ar. Tente de novo em alguns minutos.' };
    }
    if (cause.code === 'too_many_attempts') {
      // Sem tela no canvas: texto meu, a confirmar. A API limita a 5 tentativas em 10 minutos.
      return { kind: 'attempts', message: 'Muitas tentativas. Espere alguns minutos e tente de novo.' };
    }
    return { kind: 'other', message: cause.message };
  }
  return { kind: 'other', message: 'Não deu para conectar agora. Tente de novo.' };
}
