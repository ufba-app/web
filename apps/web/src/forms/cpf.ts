import { cpf } from 'cpf-cnpj-validator';

const NON_DIGITS = /\D/g;

/** Só os dígitos. É o formato que vai para a API (o backend manda o login igual ao SIGAA e conta tentativas por login). */
export function cpfDigits(value: string): string {
  return value.replace(NON_DIGITS, '');
}

/**
 * Máscara progressiva: `52998224725` vira `529.982.247-25` conforme a pessoa digita. Aceita colar com ou sem
 * pontuação (ou com texto em volta) e guarda no máximo 11 dígitos.
 */
export function maskCpf(value: string): string {
  const digits = cpfDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** 11 dígitos com os dois dígitos verificadores certos (e fora das sequências repetidas, como 111.111.111-11). */
export function isValidCpf(value: string): boolean {
  const digits = cpfDigits(value);
  return digits.length === 11 && cpf.isValid(digits);
}

/**
 * Para mostrar um login já gravado: se for um CPF válido, só os dois últimos dígitos (`***.***.***-25`); o CPF inteiro
 * nunca aparece na tela. `null` se não for CPF. Conexões antigas podem ter
 * outro tipo de login, e esses aparecem como vieram.
 */
export function formatStoredCpf(login: string): string | null {
  return isValidCpf(login) ? `***.***.***-${cpfDigits(login).slice(9)}` : null;
}
