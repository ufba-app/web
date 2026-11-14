import { toast } from '@ufba-app/web-ui';

/**
 * Aviso de evento (conectou, desconectou, falhou): sempre toast, nunca uma caixa que aparece no meio da página.
 * Fica inline só o que é estado ou parte de um formulário (erro de campo, erro dentro do diálogo, falha ao carregar
 * com "Tentar de novo"). O `Toast.Provider` é montado uma vez em cada app (App.tsx do painel).
 */
export const notify = {
  success: (message: string) => toast.success(message),
  info: (message: string) => toast.info(message),
  /** Erros ficam mais tempo na tela: a pessoa precisa de tempo para ler. */
  error: (message: string) => toast.danger(message, { timeout: 8000 }),
};
