import { useNavigate } from 'react-router';
import { ErrorScreen } from '../components/ErrorScreen';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export function ErrorPage() {
  useDocumentTitle('Algo deu errado');
  const navigate = useNavigate();
  return (
    <ErrorScreen
      title="Algo deu errado"
      message="Não foi você. Tente de novo em instantes."
      primary={{ label: 'Tentar de novo', onPress: () => navigate(-1) }}
      secondary={{ label: 'Ir para o painel', onPress: () => navigate('/') }}
    />
  );
}

export function NotFoundPage() {
  useDocumentTitle('Página não encontrada');
  const navigate = useNavigate();
  return (
    <ErrorScreen
      title="Página não encontrada"
      message="Esse endereço não existe no ufba.app."
      primary={{ label: 'Ir para o painel', onPress: () => navigate('/') }}
    />
  );
}
