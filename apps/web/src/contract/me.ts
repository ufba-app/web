import { z } from 'zod/mini';

export const sourceSchema = z.enum(['sigaa', 'moodle', 'classroom']);
export type Source = z.infer<typeof sourceSchema>;

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
    }),
    moodle: z.object({
      status: z.enum(['connected', 'disconnected', 'reconnect_required']),
      account: z.nullable(z.string()),
    }),
    classroom: z.object({
      /** false: o servidor não tem Google configurado, e o bloco some. */
      available: z.boolean(),
      apps: z.array(z.enum(['ufba', 'guest'])),
      accounts: z.array(
        z.object({
          email: z.string(),
          status: z.enum(['connected', 'reconnect_required']),
        }),
      ),
    }),
  }),
});

export type Me = z.infer<typeof meSchema>;
