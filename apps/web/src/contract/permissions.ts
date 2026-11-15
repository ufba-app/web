import { z } from 'zod/mini';

/**
 * Permissões por fonte: o que o Claude pode fazer em nome da pessoa (GET /me/permissions e PUT /me/permissions/{key}).
 * Genérico: cada fonte traz as suas, e `title` e `description` vêm da API em pt-BR (a tela nunca escreve esse texto).
 *
 * `key` é texto livre aqui, de propósito: no contrato da API ela é um enum fechado (hoje `siasb.schedule_write` e
 * `siasb.procedures_write`), mas com enum fechado uma chave nova quebraria a lista inteira em quem ainda não atualizou o
 * web. Ao PUT, a chave vai exatamente como a API devolveu.
 */
export const permissionSchema = z.object({
  /** Vai na URL do PUT. */
  key: z.string(),
  /** Fonte dona da permissão (ex.: `siasb`). A tela agrupa por ela. */
  source: z.string(),
  title: z.string(),
  description: z.string(),
  /** `high`: antes de LIGAR, a tela pede confirmação. */
  risk: z.enum(['low', 'high']),
  enabled: z.boolean(),
  /** `false`: a pessoa não tem conexão com a fonte; o interruptor fica desativado. */
  available: z.boolean(),
  unavailableReason: z.nullable(z.enum(['source_not_connected'])),
});
export type Permission = z.infer<typeof permissionSchema>;

export const permissionsSchema = z.object({ items: z.array(permissionSchema) });
export type PermissionsList = z.infer<typeof permissionsSchema>;
