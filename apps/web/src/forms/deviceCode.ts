import { z } from 'zod/mini';

const CODE_LENGTH = 8;

/** Só letras e números, em maiúsculas: aceita minúsculas, sem hífen e com espaços. */
export const normalizeDeviceCode = (value: string): string => value.replace(/[^a-z0-9]/gi, '').toUpperCase();

/** "abcd1234" vira "ABCD-1234" (o formato que aparece no terminal). Usado ao digitar e ao enviar. */
export function formatDeviceCode(value: string): string {
  const code = normalizeDeviceCode(value).slice(0, CODE_LENGTH);
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export const deviceCodeFormSchema = z.object({
  userCode: z.pipe(
    z.string().check(
      z.trim(),
      z.minLength(1, { error: 'Digite o código que apareceu no terminal.', abort: true }),
      z.refine((value) => normalizeDeviceCode(value).length === CODE_LENGTH, 'O código tem 8 letras e números, como ABCD-1234.'),
    ),
    z.transform((value) => formatDeviceCode(value)),
  ),
});

export type DeviceCodeFormInput = z.input<typeof deviceCodeFormSchema>;
export type DeviceCodeFormValues = z.output<typeof deviceCodeFormSchema>;
