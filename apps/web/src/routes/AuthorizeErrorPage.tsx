import { useSearchParams } from 'react-router';
import { goToPanel } from '../auth/destination';
import { startSignIn } from '../auth/signIn';
import { ErrorScreen } from '../components/ErrorScreen';
import { useDocumentTitle } from '../lib/useDocumentTitle';

/**
 * Quando a API não manda `message`, o texto é NEUTRO de propósito: não diz qual foi a causa. O texto antigo ("o endereço
 * de retorno do app não confere") afirmava uma causa que ninguém sabia, o mesmo tipo de chute que escondeu um erro real.
 */
const DEFAULT_MESSAGE = 'Não foi possível continuar o login. Volte ao app e tente de novo.';

/**
 * Quando a API diz que a TRANSAÇÃO de login/autorização expirou ou sumiu (já usada, vencida), a causa mais comum é
 * deixar a tela do Google aberta por muito tempo, e a tela explica isso em vez do texto curto da API.
 */
const EXPIRED_MESSAGE =
  'Este pedido de login expirou ou não é mais válido. Isso acontece, por exemplo, quando a tela do Google fica aberta por muito tempo. Entre de novo para recomeçar.';

/** Começos das mensagens que a API usa para uma transação vencida ou inexistente ("transação expirada ou inválida…"). */
const TRANSACTION_MESSAGE_STARTS = ['transação expirada', 'transação não encontrada'];

/**
 * `invalid_request` NÃO quer dizer "expirou": a API usa o mesmo código para a transação vencida e também para um cliente
 * ou `redirect_uri` não registrado, que nada têm a ver com tempo. Dizer "expirou" para tudo escondeu a causa real de um
 * erro de verdade. Por isso só a MENSAGEM decide: o texto de "expirou" aparece apenas quando ela é de transação.
 * Compara sem diferença de maiúsculas nem de forma de acentuação (NFC/NFD).
 */
function isTransactionProblem(code: string | null, message: string): boolean {
  if (code !== 'invalid_request') return false;
  const text = message.normalize('NFC').toLowerCase();
  return TRANSACTION_MESSAGE_STARTS.some((start) => text.startsWith(start));
}

/**
 * Pedido inválido (cliente desconhecido, redirect_uri não registrado, transação expirada): a API não redireciona
 * para o app e manda para cá com `?error=<code>&message=<texto pt-BR>`. O texto da API é mostrado só como texto.
 * "Entrar de novo" recomeça o login do painel (PKCE novo); "Ir para o painel" fica como alternativa.
 */
export function AuthorizeErrorPage() {
  useDocumentTitle('Pedido inválido');
  const [params] = useSearchParams();
  const apiMessage = params.get('message')?.trim() ?? '';
  const expired = isTransactionProblem(params.get('error'), apiMessage);
  const message = expired ? EXPIRED_MESSAGE : apiMessage || DEFAULT_MESSAGE;
  return (
    <ErrorScreen
      title={expired ? 'O pedido expirou' : 'Pedido inválido'}
      message={message}
      primary={{ label: 'Entrar de novo', onPress: () => void startSignIn('/') }}
      secondary={{ label: 'Ir para o painel', onPress: () => goToPanel('/') }}
    />
  );
}
