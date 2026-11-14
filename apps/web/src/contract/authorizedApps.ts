import { z } from 'zod/mini';

export const authorizedAppSchema = z.object({
  clientId: z.string(),
  domain: z.string(),
  name: z.nullable(z.string()),
  logoUrl: z.nullable(z.string()),
  verified: z.boolean(),
  authorizedAt: z.string(),
  lastUsedAt: z.nullable(z.string()),
  /** O app recebeu a senha do SIGAA (ou seja, lê o SIGAA). */
  sigaa: z.boolean(),
});
export type AuthorizedApp = z.infer<typeof authorizedAppSchema>;

export const authorizedAppsSchema = z.object({ apps: z.array(authorizedAppSchema) });
export type AuthorizedApps = z.infer<typeof authorizedAppsSchema>;
