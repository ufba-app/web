import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createdPushDeviceSchema,
  notificationSettingsSchema,
  pushConfigSchema,
  pushDevicesSchema,
  type NotificationSetting,
  type NotificationSettings,
  type PushSubscriptionInput,
} from '../contract';
import { request } from './client';

/**
 * Avisos (Web Push) genéricos. Spec: handoffs/notificacoes-genericas.md. Formatos em `src/contract/notifications.ts`.
 * `title` e `description` dos ajustes vêm da API: a tela nunca escreve texto de aviso.
 */

export const notificationSettingsKey = ['notification-settings'] as const;
export const pushDevicesKey = ['push-devices'] as const;

/** GET /me/notification-settings. Mantém a lista antiga na tela enquanto recarrega. */
export function useNotificationSettings() {
  return useQuery({
    queryKey: notificationSettingsKey,
    queryFn: () => request('/me/notification-settings', { schema: notificationSettingsSchema }),
    retry: false,
    placeholderData: keepPreviousData,
  });
}

/** PUT /me/notification-settings/{key} (204). Atualização otimista: o interruptor muda na hora e volta se falhar. */
export function useSetNotificationSetting(handlers: { onError: (error: unknown) => void }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ setting, enabled }: { setting: NotificationSetting; enabled: boolean }) =>
      request(`/me/notification-settings/${encodeURIComponent(setting.key)}`, { method: 'PUT', body: { enabled } }),
    onMutate: async ({ setting, enabled }) => {
      await queryClient.cancelQueries({ queryKey: notificationSettingsKey });
      const previous = queryClient.getQueryData<NotificationSettings>(notificationSettingsKey);
      queryClient.setQueryData<NotificationSettings>(notificationSettingsKey, (current) =>
        current ? { items: current.items.map((item) => (item.key === setting.key ? { ...item, enabled } : item)) } : current,
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(notificationSettingsKey, context.previous);
      handlers.onError(error);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationSettingsKey }),
  });
}

/** GET /me/push-devices (nunca traz endpoint nem chaves). */
export function usePushDevices(enabled = true) {
  return useQuery({
    queryKey: pushDevicesKey,
    queryFn: () => request('/me/push-devices', { schema: pushDevicesSchema }),
    enabled,
    retry: false,
  });
}

/** GET /push/config: a chave pública VAPID. 503 `push_unavailable` quando o canal está desligado. */
export function getPushConfig() {
  return request('/push/config', { schema: pushConfigSchema });
}

/** POST /me/push-devices (201). 409 `too_many_devices` (máx. 10), 503 `push_unavailable`. */
export function addPushDevice(subscription: PushSubscriptionInput) {
  return request('/me/push-devices', { method: 'POST', body: { subscription }, schema: createdPushDeviceSchema });
}

/** DELETE /me/push-devices/{id} (204). */
export function removePushDevice(id: string): Promise<void> {
  return request(`/me/push-devices/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** POST /me/push-devices/{id}/test (204). 409 `push_device_gone` (a API já removeu), 429 `too_many_attempts`. */
export function sendPushTest(id: string): Promise<void> {
  return request(`/me/push-devices/${encodeURIComponent(id)}/test`, { method: 'POST', body: {} });
}

/**
 * GET /push/config como consulta, só para a tela saber se o canal existe antes do clique. 503 `push_unavailable` não é
 * erro de rede: é "canal desligado neste ambiente" (sem VAPID configurado).
 */
export function usePushConfig(enabled: boolean) {
  return useQuery({ queryKey: ['push-config'], queryFn: getPushConfig, enabled, retry: false, staleTime: 5 * 60_000 });
}
