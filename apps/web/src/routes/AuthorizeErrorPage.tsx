import { useSearchParams } from 'react-router';
import { goToPanel } from '../auth/destination';
import { startSignIn } from '../auth/signIn';
import { ErrorScreen } from '../components/ErrorScreen';
import { useDocumentTitle } from '../lib/useDocumentTitle';

const DEFAULT_MESSAGE = 'O endereço de retorno do app não confere. Volte ao app e tente de novo.';

/**
 * `invalid_request` é o que a API manda quando o pedido de login/autorização não vale mais (transação expirada ou
 * já usada). A causa mais comum é deixar a tela do Google aberta por muito tempo, então a tela explica isso em vez
 * do texto curto da API.
 */
const EXPIRED_MESSAGE =
  'Este pedido de login expirou ou não é mais válido. Isso acontece, por exemplo, quando a tela do Google fica aberta por muito tempo. Entre de novo para recomeçar.';

/**
 * Pedido inválido (cliente desconhecido, redirect_uri não registrado, transação expirada): a API não redireciona
 * para o app e manda para cá com `?error=<code>&message=<texto pt-BR>`. O texto da API é mostrado só como texto.
 * "Entrar de novo" recomeça o login do painel (PKCE novo); "Ir para o painel" fica como alternativa.
 */
export function AuthorizeErrorPage() {
  useDocumentTitle('Pedido inválido');
  const [params] = useSearchParams();
  const expired = params.get('error') === 'invalid_request';
  const message = expired ? EXPIRED_MESSAGE : params.get('message')?.trim() || DEFAULT_MESSAGE;
  return (
    <ErrorScreen
      title={expired ? 'O pedido expirou' : 'Pedido inválido'}
      message={message}
      primary={{ label: 'Entrar de novo', onPress: () => void startSignIn('/') }}
      secondary={{ label: 'Ir para o painel', onPress: () => goToPanel('/') }}
    />
  );
}
