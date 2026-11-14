import { useSearchParams } from 'react-router';
import { goToPanel } from '../auth/destination';
import { ErrorScreen } from '../components/ErrorScreen';
import { useDocumentTitle } from '../lib/useDocumentTitle';

const DEFAULT_MESSAGE = 'O endereço de retorno do app não confere. Volte ao app e tente de novo.';

/**
 * Pedido inválido (cliente desconhecido, redirect_uri não registrado): a API não redireciona para o app
 * e manda para cá com `?error=<code>&message=<texto pt-BR>`. O texto é mostrado só como texto.
 */
export function AuthorizeErrorPage() {
  useDocumentTitle('Pedido inválido');
  const [params] = useSearchParams();
  const message = params.get('message')?.trim() || DEFAULT_MESSAGE;
  return (
    <ErrorScreen
      title="Pedido inválido"
      message={message}
      primary={{ label: 'Ir para o painel', onPress: () => goToPanel('/') }}
    />
  );
}
