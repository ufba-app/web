import { z } from 'zod/mini';

export const sourceSchema = z.enum(['sigaa', 'moodle', 'classroom']);
export type Source = z.infer<typeof sourceSchema>;

export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.nullable(z.string()),
  connections: z.object({
    sigaa: z.object({
      status: z.enum(['connected', 'disconnected', 'password_required']),
      login: z.nullable(z.string()),
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
