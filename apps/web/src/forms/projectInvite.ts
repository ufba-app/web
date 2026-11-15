import { z } from 'zod/mini';
import { memberLevels } from '../contract';

/** Convite: só e-mail institucional (@ufba.br). A API valida de novo (`invalid_email_domain`). */
export const projectInviteFormSchema = z.object({
  email: z
    .string()
    .check(
      z.trim(),
      z.minLength(1, { error: 'Digite o e-mail da pessoa.', abort: true }),
      z.refine((value) => /^[^\s@]+@ufba\.br$/i.test(value), 'Use um e-mail @ufba.br.'),
    ),
  level: z.enum(memberLevels),
});

export type ProjectInviteFormInput = z.input<typeof projectInviteFormSchema>;
export type ProjectInviteFormValues = z.output<typeof projectInviteFormSchema>;
