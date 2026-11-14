import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, Notice, ServiceIcon, StepList, type Step } from '@ufba-app/web-ui';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { ApiError } from '../api/client';
import { captureMoodle, startMoodle } from '../api/connections';
import { meQueryKey, useMe } from '../api/me';
import { moodleLinkFormSchema, type MoodleLinkFormInput, type MoodleLinkFormValues } from '../forms/moodleLink';

/** Esquema do contrato (WEB-API.md); a resposta de /connections/moodle/start confirma qual é de fato. */
export const MOODLE_SCHEME = 'web+ufba';
const HANDLER_FLAG = 'ufba.moodle.handler';

export function captureUrlTemplate(origin: string): string {
  return `${origin}/connections/moodle/capture?u=%s`;
}

function readHandlerFlag(): boolean {
  try {
    return window.localStorage.getItem(HANDLER_FLAG) === '1';
  } catch {
    return false;
  }
}

function writeHandlerFlag(): void {
  try {
    window.localStorage.setItem(HANDLER_FLAG, '1');
  } catch {
    // é só uma conveniência: sem armazenamento, o passo aparece de novo
  }
}

function registerHandler(scheme: string): boolean {
  if (typeof navigator.registerProtocolHandler !== 'function') return false;
  try {
    navigator.registerProtocolHandler(scheme, captureUrlTemplate(window.location.origin));
    writeHandlerFlag();
    return true;
  } catch {
    return false;
  }
}

export type MoodleDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConnected: () => void;
};

/**
 * Conectar o Moodle: o login institucional acontece no navegador da pessoa, e o AVA termina num link
 * `web+ufba://…` que o navegador abre em /connections/moodle/capture. Enquanto isso, esta tela espera a volta
 * consultando /me. Plano B do contrato: colar o link num campo.
 */
export function MoodleDialog({ isOpen, onOpenChange, onConnected }: MoodleDialogProps) {
  const queryClient = useQueryClient();
  const [waiting, setWaiting] = useState(false);
  const [registered, setRegistered] = useState(readHandlerFlag);
  const [unsupported, setUnsupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const me = useMe({ refetchInterval: isOpen && waiting ? 2000 : false });
  const doneRef = useRef(false);
  const linkId = useId();
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<MoodleLinkFormInput, unknown, MoodleLinkFormValues>({
    resolver: zodResolver(moodleLinkFormSchema),
    defaultValues: { link: '' },
  });
  const linkValue = useWatch({ control, name: 'link' });

  useEffect(() => {
    if (!isOpen) {
      setWaiting(false);
      setError(null);
      reset();
      setPending(false);
      doneRef.current = false;
    }
  }, [isOpen, reset]);

  const connected = me.data?.connections.moodle.status === 'connected';
  useEffect(() => {
    if (isOpen && waiting && connected && !doneRef.current) {
      doneRef.current = true;
      onConnected();
      onOpenChange(false);
    }
  }, [isOpen, waiting, connected, onConnected, onOpenChange]);

  const allow = () => {
    const ok = registerHandler(MOODLE_SCHEME);
    setRegistered(ok);
    setUnsupported(!ok);
  };

  const open = async () => {
    setError(null);
    setPending(true);
    // A aba abre já, no clique, para o navegador não bloquear o pop-up; o endereço entra quando a API responder.
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
      const { launchUrl, scheme } = await startMoodle();
      if (scheme !== MOODLE_SCHEME) registerHandler(scheme);
      if (tab) tab.location.href = launchUrl;
      else window.location.assign(launchUrl);
      setWaiting(true);
    } catch (cause) {
      tab?.close();
      setError(cause instanceof ApiError ? cause.message : 'Não deu para abrir o Moodle agora. Tente de novo.');
    } finally {
      setPending(false);
    }
  };

  const submitLink = handleSubmit(async ({ link }) => {
    setError(null);
    setPending(true);
    try {
      await captureMoodle(link);
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não deu para conectar agora. Tente de novo.');
    } finally {
      setPending(false);
    }
  });

  const steps: Step[] = registered
    ? [
        { text: 'Navegador já permite os links do Moodle.', done: true },
        { text: 'Entre no AVA com a sua conta da UFBA.' },
        { text: 'Pronto, você volta para cá.' },
      ]
    : [
        {
          text: 'Deixe o navegador abrir links do Moodle no ufba.app.',
          action: (
            <Button variant="outline" size="sm" onPress={allow}>
              Permitir
            </Button>
          ),
        },
        { text: 'Confirme quando o navegador perguntar.' },
        { text: 'Entre no AVA com a sua conta da UFBA.' },
        { text: 'Pronto, você volta para cá.' },
      ];

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      icon={<ServiceIcon service="moodle" size={26} />}
      title="Conectar o Moodle"
      actions={
        waiting ? (
          <>
            <Button variant="outline" onPress={allow}>
              Permitir de novo
            </Button>
            <Button variant="ghost" onPress={() => onOpenChange(false)}>
              Cancelar
            </Button>
          </>
        ) : (
          <>
            <Button isPending={pending} onPress={() => void open()}>
              Abrir o Moodle
            </Button>
            <Button variant="outline" onPress={() => onOpenChange(false)}>
              Cancelar
            </Button>
          </>
        )
      }
    >
      <div className="web-fields">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {unsupported ? (
          <Notice tone="warning">
            Este navegador não deixa registrar o link do Moodle. Cole o link no campo abaixo depois de entrar no AVA.
          </Notice>
        ) : null}
        {waiting ? (
          <>
            <div className="web-status-line" role="status">
              <span className="web-spinner" aria-hidden="true" />
              Esperando o Moodle…
            </div>
            <p className="web-muted">Não voltou para cá? Permita os links do Moodle e tente de novo.</p>
            <form className="web-fields" onSubmit={(e) => void submitLink(e)} noValidate>
              <div className="web-field">
                <label className="web-label">
                  Ou cole o link que o Moodle mostrou
                  <input
                    className="ufba-field"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={errors.link ? true : undefined}
                    aria-describedby={errors.link ? `${linkId}-error` : undefined}
                    {...register('link')}
                  />
                </label>
                {errors.link ? (
                  <span id={`${linkId}-error`} className="web-field-error">
                    {errors.link.message}
                  </span>
                ) : null}
              </div>
              <Button type="submit" variant="outline" isPending={pending} isDisabled={!linkValue?.trim()}>
                Conectar com o link
              </Button>
            </form>
          </>
        ) : (
          <>
            {registered ? null : <p className="web-muted">Primeira vez neste navegador? Comece pelo passo 1.</p>}
            <StepList steps={steps} />
          </>
        )}
      </div>
    </Dialog>
  );
}
