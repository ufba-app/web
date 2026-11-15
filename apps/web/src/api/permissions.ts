import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { permissionsSchema, type Me, type Permission, type PermissionsList } from '../contract';
import { request } from './client';

/**
 * Permissões por fonte (o que o Claude pode fazer em nome da pessoa). Genérico: cada fonte traz as suas.
 * Spec: handoffs/permissoes-por-fonte.md, parte B. O formato das respostas está em `src/contract/permissions.ts`.
 * `title` e `description` vêm da API em pt-BR: a tela nunca escreve texto de permissão.
 */

/**
 * A lista depende do estado das conexões: conectar ou desconectar uma fonte muda o `available`. Entrando o estado das
 * conexões na chave, a lista recarrega sozinha quando o `/me` muda (sem cada tela lembrar de invalidar).
 */
export function connectionsFingerprint(me: Me): string {
  const { sigaa, moodle, classroom, siasb } = me.connections;
  return [
    sigaa.status,
    moodle.status,
    classroom.accounts.map((account) => `${account.email}:${account.status}`).join(','),
    siasb.status,
  ].join('|');
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
