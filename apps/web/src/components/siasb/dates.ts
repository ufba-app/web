import { UFBA_TIME_ZONE } from '@ufba-app/web-ui';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Quantos dias faltam para `expiresAt`, arredondando para cima (faltando 2 h, é "1 dia"). Zero ou negativo vira 0.
 * `expiresAt` do SIASB é ESTIMATIVA (login + 30 dias): serve para avisar, nunca para decidir se está conectado.
 */
export function daysUntil(expiresAt: string, now: Date = new Date()): number {
  const diff = new Date(expiresAt).getTime() - now.getTime();
  if (Number.isNaN(diff)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.ceil(diff / DAY_MS));
}

/** "15 dez" (dia e mês curto, no fuso da UFBA). */
export function formatShortDate(value: string): string {
  return new Date(value)
    .toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', timeZone: UFBA_TIME_ZONE })
    .replace(' de ', ' ')
    .replace('.', '');
}

/** A partir de quantos dias a faixa de vencimento aparece (regra da Prontuário: 7 dias). */
export const EXPIRY_WARNING_DAYS = 7;
