import { Button, Notice, serviceName, type Service } from '@ufba-app/web-ui';
// Entrada à parte do design system: o interruptor não entra na primeira carga do painel (ver web-ui/src/switch.ts).
import { Switch } from '@ufba-app/web-ui/switch';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  addPushDevice,
  getPushConfig,
  pushDevicesKey,
  removePushDevice,
  sendPushTest,
  useNotificationSettings,
  usePushConfig,
  usePushDevices,
  useSetNotificationSetting,
} from '../../api/notifications';
import { ApiError } from '../../api/client';
import type { NotificationSetting, PushDevice } from '../../contract';
import { notify } from '../../lib/notify';
import { isSourceOffered } from '../../lib/offeredSource';
import {
  dropLocalSubscription,
  enablePush,
  forgetThisDevice,
  isInstalledApp,
  isIos,
  notificationPermission,
  pushSupport,
  rememberThisDevice,
  thisDeviceId,
} from '../../lib/push';
import { useSession } from '../AppLayout';
import './notifications.css';

const GENERIC_ERROR = 'Algo deu errado. Tente de novo em instantes.';

/** Nome da fonte para o título do grupo. Fonte que o design system ainda não conhece (SIASB) usa a própria chave. */
function sourceName(source: string): string {
  return source in serviceName ? serviceName[source as Service] : source.toUpperCase();
}

function groupBySource(items: NotificationSetting[]): Array<[string, NotificationSetting[]]> {
  const groups = new Map<string, NotificationSetting[]>();
  for (const item of items) groups.set(item.source, [...(groups.get(item.source) ?? []), item]);
  return [...groups.entries()];
}

function errorText(cause: unknown): string {
  return cause instanceof ApiError && cause.status !== 0 ? cause.message : GENERIC_ERROR;
}

function formatWhen(value: string): string {
  return new Date(value).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '');
}

/**
 * "Avisos": notificações no aparelho (Web Push), genéricas (qualquer fonte pode usar). Duas partes:
 * 1) os aparelhos desta pessoa (ativar neste, enviar teste, remover) e 2) os avisos por tipo, um interruptor por chave.
 * Os textos dos tipos vêm da API (`title`, `description`); aqui só entram as notas de estado combinadas na spec.
 * Nenhum aviso leva dado de paciente (quem envia garante). O service worker (`public/sw.js`) só nasce ao ativar.
 */
export function NotificationsSection() {
  const me = useSession();
  const settings = useNotificationSettings();
  // Aviso de uma fonte que a pessoa não tem (SIASB sem acesso) nem aparece; sem nenhum aviso a seção inteira some.
  const visible = settings.data?.items.filter((item) => isSourceOffered(me, item.source));
  const hasSettings = visible !== undefined && visible.length > 0;
  const devices = usePushDevices(hasSettings);
  const queryClient = useQueryClient();
  const [inFlight, setInFlight] = useState<ReadonlySet<string>>(new Set());
  const [enabling, setEnabling] = useState(false);
  const [busyDevice, setBusyDevice] = useState<string | null>(null);
  // Relido a cada render de propósito: a permissão pode mudar nas configurações do navegador entre uma ação e outra.
  const permission = notificationPermission();
  const support = pushSupport();
  const [thisDevice, setThisDevice] = useState<string | null>(thisDeviceId);
  // O canal pode estar desligado no ambiente (503 `push_unavailable`, até o VAPID ser configurado). Sabendo antes do
  // clique, a tela explica em vez de oferecer um botão que só falha.
  const config = usePushConfig(hasSettings && support === 'supported');
  const channelOff = config.error instanceof ApiError && config.error.code === 'push_unavailable';

  const mutation = useSetNotificationSetting({ onError: (cause) => notify.error(errorText(cause)) });

  const change = (setting: NotificationSetting, enabled: boolean) => {
    setInFlight((current) => new Set(current).add(setting.key));
    mutation.mutate(
      { setting, enabled },
      {
        onSettled: () =>
          setInFlight((current) => {
            const next = new Set(current);
            next.delete(setting.key);
            return next;
          }),
      },
    );
  };

  /** Pede a permissão, assina o aparelho e manda para a API. Só no clique. */
  const activate = async () => {
    setEnabling(true);
    try {
      const { publicKey } = await getPushConfig();
      const result = await enablePush(publicKey);
      if (result.kind === 'denied') {
        notify.error('As notificações estão bloqueadas neste navegador. Libere nas configurações do site para ativar.');
        return;
      }
      if (result.kind === 'dismissed') return;
      const created = await addPushDevice(result.subscription);
      rememberThisDevice(created.id);
      setThisDevice(created.id);
      notify.success('Avisos ativados neste aparelho.');
      await queryClient.invalidateQueries({ queryKey: pushDevicesKey });
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'push_unavailable') {
        notify.error('Os avisos estão indisponíveis agora. Tente de novo mais tarde.');
      } else {
        notify.error(errorText(cause));
      }
    } finally {
      setEnabling(false);
    }
  };

  const remove = async (device: PushDevice) => {
    setBusyDevice(device.id);
    try {
      await removePushDevice(device.id);
      if (device.id === thisDevice) {
        await dropLocalSubscription();
        forgetThisDevice();
        setThisDevice(null);
      }
      notify.success('Aparelho removido.');
    } catch (cause) {
      notify.error(errorText(cause));
    } finally {
      setBusyDevice(null);
      await queryClient.invalidateQueries({ queryKey: pushDevicesKey });
    }
  };

  const test = async (device: PushDevice) => {
    setBusyDevice(device.id);
    try {
      await sendPushTest(device.id);
      notify.success('Aviso de teste enviado. Pode levar alguns segundos para chegar.');
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'push_device_gone') {
        notify.error('Este aparelho não recebe mais avisos e foi removido da lista. Ative de novo se quiser.');
        if (device.id === thisDevice) {
          forgetThisDevice();
          setThisDevice(null);
        }
        await queryClient.invalidateQueries({ queryKey: pushDevicesKey });
      } else {
        notify.error(errorText(cause));
      }
    } finally {
      setBusyDevice(null);
    }
  };

  // Sem skeleton: a seção pode nem existir (a API sem a rota, ou nenhum tipo de aviso). Ela entra quando a lista chega.
  if (settings.isPending) return null;
  if (settings.error instanceof ApiError && settings.error.status === 404 && !settings.data) return null;
  if (!settings.error && visible && visible.length === 0) return null;

  const list = devices.data?.items ?? [];
  const hasThisDevice = thisDevice !== null && list.some((device) => device.id === thisDevice);
  const iosNeedsInstall = isIos() && !isInstalledApp() && support === 'unsupported';
  const canActivate = support === 'supported' && permission !== 'denied' && !hasThisDevice && !channelOff;

  return (
    <section className="web-notif" aria-labelledby="web-notif-title">
      <h2 id="web-notif-title" className="web-notif__title">
        Avisos
      </h2>

      <div className="web-notif__group" role="group" aria-label="Aparelhos">
        <h3 className="web-notif__source">Aparelhos</h3>

        {devices.isPending ? (
          <div className="web-notif__skeleton web-sk web-sk--card skeleton skeleton--shimmer web-sk-onwhite" aria-busy="true" />
        ) : null}

        {devices.error ? (
          <Notice tone="danger">
            {errorText(devices.error)}{' '}
            <button type="button" className="web-link" onClick={() => void devices.refetch()}>
              Tentar de novo
            </button>
          </Notice>
        ) : null}

        {channelOff ? (
          <Notice tone="info">
            Os avisos ainda não estão disponíveis. Quando forem liberados, o botão para ativar aparece aqui.
          </Notice>
        ) : null}

        {devices.data && list.length === 0 && !channelOff ? (
          <Notice tone="warning">Você não vai receber avisos: nenhum aparelho está com os avisos ligados.</Notice>
        ) : null}

        {iosNeedsInstall ? (
          <p className="web-notif__note">
            No iPhone, os avisos só funcionam com o painel instalado na tela inicial (Compartilhar, depois “Adicionar à Tela
            de Início”), no iOS 16.4 ou mais novo. Abra o painel pelo ícone e volte aqui.
          </p>
        ) : null}
        {!iosNeedsInstall && support === 'unsupported' ? (
          <p className="web-notif__note">Este navegador não recebe avisos. Ative em outro aparelho ou navegador.</p>
        ) : null}
        {support === 'supported' && permission === 'denied' && !hasThisDevice ? (
          <p className="web-notif__note">
            As notificações estão bloqueadas neste navegador. Libere nas configurações do site para ativar os avisos aqui.
          </p>
        ) : null}

        {list.length > 0 ? (
          <ul className="web-notif__list">
            {list.map((device) => (
              <li key={device.id} className="web-notif__item">
                <div className="web-notif__text">
                  <b>
                    {device.label?.trim() || 'Aparelho sem nome'}
                    {device.id === thisDevice ? <span className="web-notif__badge">Este aparelho</span> : null}
                  </b>
                  <p>{device.lastSuccessAt ? `Último aviso entregue em ${formatWhen(device.lastSuccessAt)}` : 'Ainda sem aviso entregue'}</p>
                </div>
                <div className="web-notif__actions">
                  <Button
                    variant="outline"
                    size="sm"
                    isDisabled={busyDevice === device.id}
                    onPress={() => void test(device)}
                    aria-label={`Enviar teste para ${device.label?.trim() || 'o aparelho sem nome'}`}
                  >
                    Enviar teste
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    isDisabled={busyDevice === device.id}
                    onPress={() => void remove(device)}
                    aria-label={`Remover ${device.label?.trim() || 'o aparelho sem nome'}`}
                  >
                    Remover
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {canActivate ? (
          <div>
            <Button isDisabled={enabling} onPress={() => void activate()}>
              Ativar avisos neste aparelho
            </Button>
          </div>
        ) : null}
      </div>

      {visible
        ? groupBySource(visible).map(([source, items]) => (
            <div key={source} className="web-notif__group" role="group" aria-label={`Avisos: ${sourceName(source)}`}>
              <h3 className="web-notif__source">{sourceName(source)}</h3>
              <ul className="web-notif__list">
                {items.map((setting) => (
                  <li key={setting.key} className="web-notif__item">
                    <div className="web-notif__text">
                      <b>{setting.title}</b>
                      <p>{setting.description}</p>
                    </div>
                    <Switch
                      aria-label={setting.title}
                      isSelected={setting.enabled}
                      isDisabled={inFlight.has(setting.key)}
                      onChange={(enabled) => change(setting, enabled)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))
        : null}

      {settings.error && !settings.data ? (
        <Notice tone="danger">
          {errorText(settings.error)}{' '}
          <button type="button" className="web-link" onClick={() => void settings.refetch()}>
            Tentar de novo
          </button>
        </Notice>
      ) : null}
    </section>
  );
}
