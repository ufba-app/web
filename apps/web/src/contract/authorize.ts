import { z } from 'zod/mini';
import { offeredPermissionSchema } from './permissions';

/** As fontes do pedido de autorização: as três de sempre mais o SIASB (só aparece para quem tem acesso a ele). */
export const authorizeSourceSchema = z.enum(['sigaa', 'moodle', 'classroom', 'siasb']);
export type AuthorizeSource = z.infer<typeof authorizeSourceSchema>;

export const authorizeSourceStatusSchema = z.enum([
  'connected',
  'disconnected',
  'password_required',
  'reconnect_required',
  'locked',
]);
export type AuthorizeSourceStatus = z.infer<typeof authorizeSourceStatusSchema>;

export const authorizeClientSchema = z.object({
  /** Host do redirect_uri, sempre em ASCII (punycode). Mostrar exatamente como vem. */
  domain: z.string(),
  redirectUri: z.string(),
  /** A API marca clientes que rodam na própria máquina da pessoa (localhost). Ainda sem tela: só declarado para o contrato. */
  local: z.optional(z.boolean()),
  name: z.nullable(z.string()),
  logoUrl: z.nullable(z.string()),
  verified: z.boolean(),
  metadata: z.enum(['present', 'absent']),
});
export type AuthorizeClient = z.infer<typeof authorizeClientSchema>;

/**
 * GET /authorize/requests/{id}. Sem sessão a API devolve `signedIn: false` e `sources: null`
 * (acordado com o backend; o WEB-API.md ainda descreve só o caso com sessão). Aceitamos as duas formas.
 */
export const authorizeRequestSchema = z.pipe(
  z.object({
    id: z.string(),
    client: authorizeClientSchema,
    signedIn: z.optional(z.boolean()),
    sources: z.nullish(z.array(z.object({ source: authorizeSourceSchema, status: authorizeSourceStatusSchema }))),
    /** As permissões que este pedido pode conceder (só de fontes a que a pessoa tem acesso); `null` sem sessão. */
    permissions: z.nullish(z.array(offeredPermissionSchema)),
    expiresAt: z.string(),
  }),
  z.transform((r) => ({
    id: r.id,
    client: r.client,
    expiresAt: r.expiresAt,
    sources: r.sources ?? null,
    permissions: r.permissions ?? [],
    signedIn: r.signedIn ?? r.sources != null,
  })),
);

export type AuthorizeRequest = z.infer<typeof authorizeRequestSchema>;

export const authorizeDecisionSchema = z.object({ redirectTo: z.string() });
export type AuthorizeDecision = z.infer<typeof authorizeDecisionSchema>;
