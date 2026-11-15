import type { PushSubscriptionInput } from '../contract';

/**
 * Web Push no navegador: suporte, permissão e assinatura. O service worker (`public/sw.js`) só é registrado quando a
 * pessoa pede para ativar os avisos, nunca na abertura do painel.
 */

/** Onde o `id` do aparelho fica guardado, só para marcar "Este aparelho" na lista (a API nunca devolve o endpoint). */
const THIS_DEVICE_KEY = 'ufba.push.deviceId';

export type PushSupport = 'supported' | 'unsupported';

export function pushSupport(): PushSupport {
  return typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
    ? 'supported'
    : 'unsupported';
}

/** iPhone e iPad (o iPadOS novo se diz Mac, mas tem tela de toque). */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Painel aberto pelo ícone da tela de início (no iOS, só assim o Web Push existe). */
export function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  const standaloneFlag = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standaloneFlag || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** `applicationServerKey` vem da API em base64url; o navegador quer bytes. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export type EnableResult =
  | { kind: 'subscribed'; subscription: PushSubscriptionInput }
  | { kind: 'denied' }
  | { kind: 'dismissed' };

/**
 * Pede a permissão, registra o service worker e assina o aparelho. Tem que rodar no CLIQUE (o navegador só pergunta
 * por gesto). `publicKey` é a chave pública VAPID (GET /push/config). Nada é guardado nem logado aqui.
 */
export async function enablePush(publicKey: string): Promise<EnableResult> {
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return { kind: 'denied' };
  if (permission !== 'granted') return { kind: 'dismissed' };

  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  const ready = await navigator.serviceWorker.ready;
  const worker = ready.pushManager ?? registration.pushManager;
  const subscription =
    (await worker.getSubscription()) ??
    (await worker.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));

  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) throw new Error('push_subscription_invalid');
  return { kind: 'subscribed', subscription: { endpoint: json.endpoint, keys: { p256dh, auth } } };
}

/** Cancela a assinatura DESTE aparelho no navegador (ao remover o aparelho na lista). Falha em silêncio. */
export async function dropLocalSubscription(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration('/');
    await (await registration?.pushManager.getSubscription())?.unsubscribe();
  } catch {
    /* sem assinatura local a cancelar */
  }
}

export function rememberThisDevice(id: string): void {
  try {
    localStorage.setItem(THIS_DEVICE_KEY, id);
  } catch {
    /* sem armazenamento: só não marca "Este aparelho" */
  }
}

export function thisDeviceId(): string | null {
  try {
    return localStorage.getItem(THIS_DEVICE_KEY);
  } catch {
    return null;
  }
}

export function forgetThisDevice(): void {
  try {
    localStorage.removeItem(THIS_DEVICE_KEY);
  } catch {
    /* nada a esquecer */
  }
}
