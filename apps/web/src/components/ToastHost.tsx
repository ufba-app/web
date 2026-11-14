import { Toast } from '@ufba-app/web-ui';

/**
 * Onde os toasts aparecem (uma vez por app). Fica num componente à parte para os testes de unidade poderem trocá-lo
 * por nada: o `react-stately/toast` vem num build CJS que carrega o React do design system (React duplicado no jsdom).
 * O toast de verdade é coberto pelos testes no navegador (e2e), que não têm esse problema.
 */
export function ToastHost() {
  return <Toast.Provider />;
}
