import { goToPanel } from '../auth/destination';
import { ErrorScreen } from '../components/ErrorScreen';
import { useDocumentTitle } from '../lib/useDocumentTitle';

/** 404 do auth. Mesma tela do painel; a saída leva ao painel (outro app). */
export function AuthNotFoundPage() {
  useDocumentTitle('Página não encontrada');
  return (
    <ErrorScreen
      title="Página não encontrada"
      message="Esse endereço não existe no ufba.app."
      primary={{ label: 'Ir para o painel', onPress: () => goToPanel('/') }}
    />
  );
}
