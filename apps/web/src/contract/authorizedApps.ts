import { z } from 'zod/mini';

export const authorizedAppSchema = z.object({
  clientId: z.string(),
  domain: z.string(),
  name: z.nullable(z.string()),
  logoUrl: z.nullable(z.string()),
  verified: z.boolean(),
  authorizedAt: z.string(),
  lastUsedAt: z.nullable(z.string()),
  /** A API marca apps que rodam na própria máquina da pessoa (localhost). Ainda sem tela: só declarado para o contrato. */
  local: z.optional(z.boolean()),
  /** O app recebeu a senha do SIGAA (ou seja, lê o SIGAA). */
  sigaa: z.boolean(),
});
export type AuthorizedApp = z.infer<typeof authorizedAppSchema>;

export const authorizedAppsSchema = z.object({ apps: z.array(authorizedAppSchema) });
export type AuthorizedApps = z.infer<typeof authorizedAppsSchema>;
