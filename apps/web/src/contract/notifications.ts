import { z } from 'zod/mini';

/**
 * Avisos (Web Push) genéricos: GET /push/config, /me/push-devices e /me/notification-settings. Spec:
 * handoffs/notificacoes-genericas.md. O formato é conferido com o `openapi.json` em `openapi.contract.test.ts`.
 *
 * `title` e `description` dos ajustes vêm da API em pt-BR (a tela nunca escreve esse texto). `key` é texto livre pelo
 * mesmo motivo das permissões: uma chave nova não pode quebrar a lista inteira em quem ainda não atualizou o web.
 */

/** GET /push/config. 503 `push_unavailable` quando o canal está desligado no ambiente. */
export const pushConfigSchema = z.object({ publicKey: z.string() });
export type PushConfig = z.infer<typeof pushConfigSchema>;

/** Um aparelho da pessoa com avisos ligados. A API nunca devolve o endpoint nem as chaves. */
export const pushDeviceSchema = z.object({
  id: z.string(),
  label: z.nullable(z.string()),
  createdAt: z.string(),
  lastSuccessAt: z.nullable(z.string()),
});
export type PushDevice = z.infer<typeof pushDeviceSchema>;

export const pushDevicesSchema = z.object({ items: z.array(pushDeviceSchema) });
export type PushDevices = z.infer<typeof pushDevicesSchema>;

/** POST /me/push-devices (201). Idempotente por endpoint: o mesmo aparelho volta com o mesmo `id`. */
export const createdPushDeviceSchema = z.object({ id: z.string() });

export const notificationSettingSchema = z.object({
  key: z.string(),
  /** Fonte dona do aviso (ex.: `siasb`). */
  source: z.string(),
  title: z.string(),
  description: z.string(),
  enabled: z.boolean(),
});
export type NotificationSetting = z.infer<typeof notificationSettingSchema>;

export const notificationSettingsSchema = z.object({ items: z.array(notificationSettingSchema) });
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

/** Corpo do POST /me/push-devices: a assinatura do navegador (`PushSubscription.toJSON()`) já validada. */
export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};
