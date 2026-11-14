import { z } from 'zod/mini';
import { cpfDigits, isValidCpf } from './cpf';

/**
 * Formulário de conectar o SIGAA. O login do SIGAA é sempre o CPF: a pessoa digita com máscara, e a API recebe só os
 * 11 dígitos (combinado com o backend). As mensagens são o que a pessoa lê, por isso ficam em pt-BR aqui.
 * A senha nunca é alterada: espaços podem fazer parte dela.
 * Nunca ligar `reportInput` ao validar: ele colocaria a senha digitada dentro dos erros.
 */
export const sigaaFormSchema = z.object({
  login: z.pipe(
    z.string().check(
      z.trim(),
      z.minLength(1, { error: 'Digite o CPF.', abort: true }),
      z.refine((value) => isValidCpf(value), 'CPF inválido. Confira os 11 números.'),
    ),
    z.transform((value) => cpfDigits(value)),
  ),
  password: z.string().check(z.minLength(1, 'Digite a senha do SIGAA.')),
});

export type SigaaFormInput = z.input<typeof sigaaFormSchema>;
export type SigaaFormValues = z.output<typeof sigaaFormSchema>;
