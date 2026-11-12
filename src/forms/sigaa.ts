import { z } from 'zod/mini';

/**
 * Formulário de conectar o SIGAA. As mensagens são o que a pessoa lê, por isso ficam em pt-BR aqui.
 * O usuário é aparado antes de ir à API. A senha nunca é alterada: espaços podem fazer parte dela.
 * Nunca ligar `reportInput` ao validar: ele colocaria a senha digitada dentro dos erros.
 */
export const sigaaFormSchema = z.object({
  login: z.string().check(z.trim(), z.minLength(1, 'Digite o usuário do SIGAA.')),
  password: z.string().check(z.minLength(1, 'Digite a senha do SIGAA.')),
});

export type SigaaFormInput = z.input<typeof sigaaFormSchema>;
export type SigaaFormValues = z.output<typeof sigaaFormSchema>;
