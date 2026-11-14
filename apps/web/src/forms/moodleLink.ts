import { z } from 'zod/mini';

/** Plano B do Moodle: colar o link `web+ufba://…` que o AVA mostrou. A API é quem valida o conteúdo do link. */
export const moodleLinkFormSchema = z.object({
  link: z.string().check(z.trim(), z.minLength(1, 'Cole o link que o Moodle mostrou.')),
});

export type MoodleLinkFormInput = z.input<typeof moodleLinkFormSchema>;
export type MoodleLinkFormValues = z.output<typeof moodleLinkFormSchema>;
