import { z } from 'zod/mini';
import { sourceSchema } from './me';

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
    sources: z.nullish(z.array(z.object({ source: sourceSchema, status: authorizeSourceStatusSchema }))),
    expiresAt: z.string(),
  }),
  z.transform((r) => ({
    id: r.id,
    client: r.client,
    expiresAt: r.expiresAt,
    sources: r.sources ?? null,
    signedIn: r.signedIn ?? r.sources != null,
  })),
);

export type AuthorizeRequest = z.infer<typeof authorizeRequestSchema>;

export const authorizeDecisionSchema = z.object({ redirectTo: z.string() });
export type AuthorizeDecision = z.infer<typeof authorizeDecisionSchema>;
