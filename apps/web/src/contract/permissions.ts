import { z } from 'zod/mini';

/**
 * Permissões POR APP (WEB-API.md, seção 5.3; api#57): o que a pessoa libera para UM app fazer em nome dela. São marcadas
 * na tela de autorizar (`GET /authorize/requests/{id}` traz as oferecidas e o `POST …/approve` leva as marcadas) e
 * revogadas em Apps autorizados (`DELETE /authorized-apps/{clientId}/permissions/{key}`). Genérico: cada fonte traz as
 * suas, e `title` e `description` vêm da API em pt-BR (a tela nunca escreve esse texto). Padrão: tudo NEGADO.
 *
 * `key` é texto livre aqui, de propósito: na API é um enum fechado (hoje `siasb.schedule_write` e
 * `siasb.procedures_write`), mas com enum fechado uma chave nova quebraria a tela inteira em quem ainda não atualizou o
 * web. A chave vai exatamente como a API devolveu.
 *
 * O `GET`/`PUT /me/permissions` (global, por pessoa) virou LEGADO e o web não o usa mais.
 */

/** Uma permissão que um pedido de autorização pode conceder. */
export const offeredPermissionSchema = z.object({
  key: z.string(),
  /** Fonte dona da permissão (ex.: `siasb`). A tela a mostra sob a fonte. */
  source: z.string(),
  title: z.string(),
  description: z.string(),
  /** `high`: antes de LIGAR, a tela pede confirmação. */
  risk: z.enum(['low', 'high']),
  /** `false`: a fonte não está conectada; o interruptor fica desativado. */
  available: z.boolean(),
  unavailableReason: z.nullable(z.enum(['source_not_connected'])),
  /**
   * Já concedida a ESTE app (api#59). A tela pré-marca por ele e manda sempre o conjunto no approve: o `approve` grava o
   * conjunto EXATO, então sem saber o que já valia, reautorizar apagaria permissões sem querer.
   */
  granted: z.boolean(),
});
export type OfferedPermission = z.infer<typeof offeredPermissionSchema>;

/** Uma permissão que a pessoa já liberou para um app (em Apps autorizados). */
export const appPermissionSchema = z.object({
  key: z.string(),
  source: z.string(),
  title: z.string(),
  description: z.string(),
  risk: z.enum(['low', 'high']),
});
export type AppPermission = z.infer<typeof appPermissionSchema>;
