import { z } from 'zod/mini';

export const sourceSchema = z.enum(['sigaa', 'moodle', 'classroom']);
export type Source = z.infer<typeof sourceSchema>;

/**
 * Saúde de uma conexão (api#79, campo ADITIVO em `Me.connections.*`; `null` se a conexão não existe). Vem do que já está
 * no banco, sem consultar a fonte, e dentro do `GET /me` que a tela já faz: SEM polling. `message` é uma frase pt-BR
 * fixa por motivo (nunca ecoa a fonte): a tela a mostra como veio. `action` diz o botão: `reconnect` abre o fluxo de
 * conectar, `unlock` desbloqueia o SIGAA, `retry` pede de novo. `since`: último sucesso (ok) ou última falha (degraded).
 * `reason` é texto livre aqui, de propósito: é enum fechado na API, mas um motivo novo não pode derrubar o `/me`
 * (a sessão inteira) de quem ainda não atualizou o web; a tela não depende dele (a divergência está aceita no teste).
 */
const healthObjectSchema = z.object({
  state: z.enum(['ok', 'degraded', 'action_required', 'unknown']),
  reason: z.nullable(z.string()),
  message: z.string(),
  action: z.nullable(z.enum(['reconnect', 'unlock', 'retry'])),
  since: z.nullable(z.string()),
});
/** Sigaa, Moodle e SIASB: `null` quando desconectado. */
export const healthSchema = z.nullable(healthObjectSchema);
export type Health = z.infer<typeof healthSchema>;
/** Cada conta do Classroom já está conectada: a saúde nunca é `null` (a API manda sempre o objeto). */
export const accountHealthSchema = healthObjectSchema;

export const meSchema = z.object({
  id: z.string(),
  email: z.nullable(z.string()),
  name: z.nullable(z.string()),
  connections: z.object({
    sigaa: z.object({
      /** `locked`: a senha está guardada sob passkey e precisa ser destravada (a tela ainda não existe). */
      status: z.enum(['connected', 'disconnected', 'password_required', 'locked']),
      login: z.nullable(z.string()),
      /** Quantas passkeys (slots) protegem a senha guardada. */
      passkey: z.object({ slots: z.number() }),
      health: healthSchema,
    }),
    moodle: z.object({
      status: z.enum(['connected', 'disconnected', 'reconnect_required']),
      account: z.nullable(z.string()),
      health: healthSchema,
    }),
    classroom: z.object({
      /** false: o servidor não tem Google configurado, e o bloco some. */
      available: z.boolean(),
      apps: z.array(z.enum(['ufba', 'guest'])),
      accounts: z.array(
        z.object({
          email: z.string(),
          status: z.enum(['connected', 'reconnect_required']),
          health: accountHealthSchema,
        }),
      ),
    }),
    /**
     * SIASB (clínica). `offered`: a pessoa pode conectar (tem matrícula no perfil). `expiresAt` é ESTIMATIVA (login + 30
     * dias): só avisa; quem manda no "expirou" é o `status`. `syncedAt`: quando a cópia sincronizada foi lida pela última
     * vez (nulo antes da primeira); nenhuma tela o mostra ainda.
     */
    siasb: z.object({
      offered: z.boolean(),
      status: z.enum(['connected', 'reconnect_required', 'disconnected']),
      expiresAt: z.nullable(z.string()),
      syncedAt: z.nullable(z.string()),
      health: healthSchema,
    }),
  }),
});

export type Me = z.infer<typeof meSchema>;
