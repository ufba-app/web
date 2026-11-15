import { z } from 'zod/mini';

/**
 * Formulário de conectar o SIASB: só a senha (a matrícula vem do perfil, nunca é pedida). A senha nunca é alterada:
 * espaços podem fazer parte dela. Nunca ligar `reportInput` ao validar: ele colocaria a senha digitada dentro dos erros.
 */
export const siasbFormSchema = z.object({
  password: z.string().check(z.minLength(1, 'Digite a senha do SIASB.')),
});

export type SiasbFormInput = z.input<typeof siasbFormSchema>;
export type SiasbFormValues = z.output<typeof siasbFormSchema>;
