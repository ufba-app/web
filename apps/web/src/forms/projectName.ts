import { z } from 'zod/mini';
import { PROJECT_NAME_MAX } from '../contract';

export const projectNameFormSchema = z.object({
  name: z
    .string()
    .check(
      z.trim(),
      z.minLength(1, { error: 'Digite um nome.', abort: true }),
      z.maxLength(PROJECT_NAME_MAX, `Use até ${PROJECT_NAME_MAX} caracteres.`),
    ),
});

export type ProjectNameFormInput = z.input<typeof projectNameFormSchema>;
export type ProjectNameFormValues = z.output<typeof projectNameFormSchema>;
