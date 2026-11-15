import { z } from 'zod/mini';
import { COMPUTER_NAME_MAX } from '../contract';

export const computerNameFormSchema = z.object({
  name: z
    .string()
    .check(
      z.trim(),
      z.minLength(1, { error: 'Digite um nome.', abort: true }),
      z.maxLength(COMPUTER_NAME_MAX, `Use até ${COMPUTER_NAME_MAX} caracteres.`),
    ),
});

export type ComputerNameFormInput = z.input<typeof computerNameFormSchema>;
export type ComputerNameFormValues = z.output<typeof computerNameFormSchema>;
