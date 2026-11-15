import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod/mini';
import type { Me } from '../contract';
import { request } from './client';

/**
 * Permissões por fonte (o que o Claude pode fazer em nome da pessoa). Genérico: cada fonte traz as suas.
 * Spec: handoffs/permissoes-por-fonte.md, parte B.
 *
 * PROVISÓRIO: o contrato (`GET /me/permissions`, `PUT /me/permissions/{key}`) ainda está sendo escrito pela API.
 * Os schemas ficam aqui, no formato combinado, e NÃO em `src/contract` (nem no `openapi.json`) até a API publicar.
 * Quando existir: `pnpm contract:update`, mover para `src/contract/permissions.ts`, acrescentar `permission_unavailable`
 * ao enum de erros e conferir as rotas em `openapi.contract.test.ts`.
 *
 * `title` e `description` vêm da API em pt-BR: a tela nunca escreve texto de permissão.
 */

export const permissionSchema = z.object({
  /** Chave fechada no contrato (ex.: `siasb.schedule_write`). Vai na URL do PUT. */
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

/**
 * A lista depende do estado das conexões: conectar ou desconectar uma fonte muda o `available`. Entrando o estado das
 * conexões na chave, a lista recarrega sozinha quando o `/me` muda (sem cada tela lembrar de invalidar).
 */
export function connectionsFingerprint(me: Me): string {
  const { sigaa, moodle, classroom } = me.connections;
  return [sigaa.status, moodle.status, classroom.accounts.map((account) => `${account.email}:${account.status}`).join(',')].join('|');
}

export const permissionsQueryKey = (fingerprint: string) => ['permissions', fingerprint] as const;

/** GET /me/permissions. Mantém a lista antiga na tela enquanto recarrega (sem piscar o skeleton). */
export function usePermissions(me: Me) {
  return useQuery({
    queryKey: permissionsQueryKey(connectionsFingerprint(me)),
    queryFn: () => request('/me/permissions', { schema: permissionsSchema }),
    retry: false,
    placeholderData: keepPreviousData,
  });
}

/** PUT /me/permissions/{key} (204). 409 `permission_unavailable` ao ligar sem a conexão da fonte; desligar sempre vale. */
export function setPermission(key: string, enabled: boolean): Promise<void> {
  return request(`/me/permissions/${encodeURIComponent(key)}`, { method: 'PUT', body: { enabled } });
}

/**
 * Liga ou desliga uma permissão com atualização otimista: o interruptor muda na hora e volta ao estado anterior se o
 * PUT falhar. Ao terminar (certo ou errado), relê a lista para refletir o que a API realmente guardou.
 */
export function useSetPermission(me: Me, handlers: { onError: (error: unknown) => void }) {
  const queryClient = useQueryClient();
  const queryKey = permissionsQueryKey(connectionsFingerprint(me));

  return useMutation({
    mutationFn: ({ permission, enabled }: { permission: Permission; enabled: boolean }) => setPermission(permission.key, enabled),
    onMutate: async ({ permission, enabled }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PermissionsList>(queryKey);
      queryClient.setQueryData<PermissionsList>(queryKey, (current) =>
        current ? { items: current.items.map((item) => (item.key === permission.key ? { ...item, enabled } : item)) } : current,
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      handlers.onError(error);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['permissions'] }),
  });
}
