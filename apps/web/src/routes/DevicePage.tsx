import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, Notice, PageHeader } from '@ufba-app/web-ui';
import { useEffect, useId, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import { ApiError } from '../api/client';
import { decideDevice, lookupDevice, memoryComputersQueryKey, memoryStatusQueryKey } from '../api/memory';
import { AlertIcon } from '../components/icons';
import { AuthorizeRequestSkeleton } from '../components/Skeletons';
import type { DeviceLookup } from '../contract';
import {
  deviceCodeFormSchema,
  formatDeviceCode,
  normalizeDeviceCode,
  type DeviceCodeFormInput,
  type DeviceCodeFormValues,
} from '../forms/deviceCode';
import { osLabel, timeLabel } from '../lib/memoryLabels';
import { notify } from '../lib/notify';
import { useDocumentTitle } from '../lib/useDocumentTitle';

/** Erros que são do campo do código (não viram toast). */
const CODE_FIELD_ERRORS = new Set(['device_code_invalid', 'device_code_expired', 'too_many_attempts']);

type Stage =
  | { kind: 'form' }
  | { kind: 'looking' }
  | { kind: 'review'; code: string; request: DeviceLookup }
  | { kind: 'done'; decision: 'approve' | 'deny' };

/**
 * Aprovar o computador que pediu para gravar na memória da conta. A pessoa chega por `/device` ou por
 * `/device?user_code=XXXX-XXXX`; o código é lido uma vez e a URL é limpa na hora. Ele só trafega no corpo de POST.
 */
export function DevicePage() {
  useDocumentTitle('Conectar computador');
  const formId = useId();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [stage, setStage] = useState<Stage>({ kind: 'form' });
  const [deciding, setDeciding] = useState<'approve' | 'deny' | null>(null);
  const handledUrlCode = useRef(false);
  const {
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm<DeviceCodeFormInput, unknown, DeviceCodeFormValues>({
    resolver: zodResolver(deviceCodeFormSchema),
    defaultValues: { userCode: '' },
  });

  const fieldError = (cause: unknown) => {
    const message = cause instanceof ApiError ? cause.message : 'Não deu para conferir o código agora. Tente de novo.';
    setError('userCode', { type: 'server', message });
  };

  const lookup = async (code: string) => {
    setStage({ kind: 'looking' });
    try {
      const request = await lookupDevice(code);
      setStage({ kind: 'review', code, request });
    } catch (cause) {
      setStage({ kind: 'form' });
      if (cause instanceof ApiError && !CODE_FIELD_ERRORS.has(cause.code)) {
        notify.error(cause.message);
        return;
      }
      fieldError(cause);
    }
  };

  // Código vindo do link: lê uma vez, tira da barra de endereço (e do histórico) e consulta por POST.
  useEffect(() => {
    if (handledUrlCode.current) return;
    handledUrlCode.current = true;
    const fromUrl = params.get('user_code');
    if (fromUrl === null) return;
    window.history.replaceState(window.history.state, '', window.location.pathname);
    const length = normalizeDeviceCode(fromUrl).length;
    if (length === 0) return;
    if (length !== 8) {
      setValue('userCode', formatDeviceCode(fromUrl));
      setError('userCode', { type: 'server', message: 'O código do link está incompleto. Digite o que apareceu no terminal.' });
      return;
    }
    // O campo recebe o código do link já na chegada: se a API recusar (inválido ou vencido), a pessoa vê qual código
    // falhou e corrige; se valer, a conferência abre direto e o campo nem aparece.
    setValue('userCode', formatDeviceCode(fromUrl));
    void lookup(formatDeviceCode(fromUrl));
    // Roda uma vez, na chegada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = handleSubmit(({ userCode }) => lookup(userCode));

  const decide = async (decision: 'approve' | 'deny') => {
    if (stage.kind !== 'review') return;
    setDeciding(decision);
    try {
      await decideDevice(stage.code, decision);
      if (decision === 'approve') {
        notify.success('Computador conectado. Pode voltar ao terminal.');
        void queryClient.invalidateQueries({ queryKey: memoryComputersQueryKey });
        void queryClient.invalidateQueries({ queryKey: memoryStatusQueryKey });
      } else {
        notify.info('Pedido negado.');
      }
      setStage({ kind: 'done', decision });
    } catch (cause) {
      if (cause instanceof ApiError && CODE_FIELD_ERRORS.has(cause.code)) {
        // O código venceu ou foi recusado: volta ao formulário com a mensagem no campo.
        setStage({ kind: 'form' });
        setValue('userCode', '');
        fieldError(cause);
      } else {
        notify.error(cause instanceof ApiError ? cause.message : 'Não deu para registrar sua decisão agora. Tente de novo.');
      }
    } finally {
      setDeciding(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Conectar computador"
        description="Aprove só o computador que você mesmo está conectando agora."
      />

      {stage.kind === 'looking' ? <AuthorizeRequestSkeleton /> : null}

      {stage.kind === 'form' ? (
        <form className="web-card web-fields" onSubmit={(e) => void submit(e)} noValidate>
          <p className="web-muted">Digite o código que apareceu no terminal do instalador.</p>
          <div className="web-field">
            <label className="web-label">
              Código do computador
              <Controller
                name="userCode"
                control={control}
                render={({ field }) => (
                  <input
                    className="ufba-field web-code-input"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    enterKeyHint="go"
                    placeholder="ABCD-1234"
                    spellCheck={false}
                    aria-invalid={errors.userCode ? true : undefined}
                    aria-describedby={errors.userCode ? `${formId}-error` : undefined}
                    name={field.name}
                    ref={field.ref}
                    value={field.value}
                    onBlur={field.onBlur}
                    onChange={(event) => field.onChange(formatDeviceCode(event.target.value))}
                  />
                )}
              />
            </label>
            {errors.userCode ? (
              <span id={`${formId}-error`} className="web-field-error" role="alert">
                {errors.userCode.message}
              </span>
            ) : null}
          </div>
          <div>
            <Button type="submit">Continuar</Button>
          </div>
        </form>
      ) : null}

      {stage.kind === 'review' ? (
        <section className="web-fields" aria-labelledby={`${formId}-who`}>
          <div className="web-card web-fields">
            <h2 id={`${formId}-who`} className="web-card-title">
              Quem pediu
            </h2>
            <dl className="web-facts">
              <div>
                <dt>Código</dt>
                <dd>{stage.code}</dd>
              </div>
              <div>
                <dt>Computador</dt>
                <dd>{stage.request.computerName ?? 'Nome não informado'}</dd>
              </div>
              <div>
                <dt>Aplicativo</dt>
                <dd>{stage.request.clientName}</dd>
              </div>
              <div>
                <dt>Sistema</dt>
                <dd>{osLabel(stage.request.os)}</dd>
              </div>
              <div>
                <dt>Pedido em</dt>
                <dd>{timeLabel(new Date(stage.request.requestedAt))}</dd>
              </div>
              <div>
                <dt>Rede aproximada</dt>
                <dd>{stage.request.approxLocation ?? 'Não identificada'}</dd>
              </div>
              <div>
                <dt>O que será concedido</dt>
                <dd>Gravar a memória desta máquina na sua conta.</dd>
              </div>
            </dl>
          </div>
          {stage.request.ipDiffers ? (
            <Notice tone="danger" icon={<AlertIcon />}>
              A rede de quem aprova é bem diferente da de quem pediu. Se não foi você, negue.
            </Notice>
          ) : null}
          <Notice tone="warning" icon={<AlertIcon />}>
            Só aprove se este código apareceu agora no SEU terminal.
          </Notice>
          <div className="web-inline">
            <Button isPending={deciding === 'approve'} isDisabled={deciding === 'deny'} onPress={() => void decide('approve')}>
              Aprovar
            </Button>
            <Button
              variant="outline"
              isPending={deciding === 'deny'}
              isDisabled={deciding === 'approve'}
              onPress={() => void decide('deny')}
            >
              Negar
            </Button>
          </div>
        </section>
      ) : null}

      {stage.kind === 'done' ? (
        stage.decision === 'approve' ? (
          <EmptyState
            title="Computador conectado"
            description="Pode voltar ao terminal: ele já recebeu a permissão."
            action={
              <Link className="web-link" to="/memory/computers">
                Ver computadores conectados
              </Link>
            }
          />
        ) : (
          <EmptyState title="Pedido negado" description="Nada foi liberado. Pode fechar esta página." />
        )
      ) : null}
    </>
  );
}
