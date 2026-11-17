import { Button, Chip, SourceCard } from '@ufba-app/web-ui';
import { useNavigate } from 'react-router';
import { useAcademic } from '../../api/academic';
import type { Me } from '../../contract';
import { ConnectionHealth } from '../health/ConnectionHealth';
import { daysUntil, EXPIRY_WARNING_DAYS, formatShortDate } from './dates';
import { SiasbIcon } from './SiasbIcon';

type Siasb = Me['connections']['siasb'];

const dayLabel = (days: number) => (days === 1 ? '1 dia' : `${days} dias`);

/**
 * O cartão do SIASB em Conexões. Só aparece quando a API oferece a conexão (`offered`). Sem ela, convida a importar a
 * vida acadêmica primeiro (a matrícula do SIASB vem do perfil, que só existe depois da importação confirmada).
 */
export function SiasbSection({
  siasb,
  onConnect,
  onDisconnect,
  onRetry,
}: {
  siasb: Siasb;
  onConnect: () => void;
  onDisconnect: () => void;
  /** "Tentar de novo" da saúde: relê o estado das conexões (um clique, sem polling). */
  onRetry: () => void;
}) {
  return siasb.offered ? <SiasbCard siasb={siasb} onConnect={onConnect} onDisconnect={onDisconnect} onRetry={onRetry} /> : <SiasbInvite />;
}

function SiasbCard({
  siasb,
  onConnect,
  onDisconnect,
  onRetry,
}: {
  siasb: Siasb;
  onConnect: () => void;
  onDisconnect: () => void;
  onRetry: () => void;
}) {
  // `expiresAt` é estimativa (login + 30 dias): só avisa. Quem manda no "expirou" é o `status` (o SIASB pode derrubar
  // o acesso a qualquer momento, antes da data).
  const left = siasb.status === 'connected' && siasb.expiresAt ? daysUntil(siasb.expiresAt) : null;
  const expiring = left !== null && left <= EXPIRY_WARNING_DAYS;

  let description: string;
  if (siasb.status === 'reconnect_required') {
    description = 'Reconecte o SIASB: digite a senha de novo para voltar a ler as suas sessões.';
  } else if (expiring) {
    description = `Seu acesso ao SIASB vence ${left === 0 ? 'hoje' : `em ${dayLabel(left)}`}. Reconecte com a sua senha para não perder o acesso.`;
  } else if (siasb.status === 'connected' && siasb.expiresAt) {
    description = `Acesso até ${formatShortDate(siasb.expiresAt)} · só leitura`;
  } else {
    description = 'Só leitura';
  }

  return (
    <SourceCard
      icon={<SiasbIcon size={26} />}
      title="SIASB"
      description={description}
      status={
        siasb.status === 'reconnect_required' ? (
          <Chip tone="danger">Acesso expirou</Chip>
        ) : expiring ? (
          <Chip tone="warning">{left === 0 ? 'Vence hoje' : `Vence em ${dayLabel(left)}`}</Chip>
        ) : siasb.status === 'connected' ? (
          <Chip tone="success">Conectado</Chip>
        ) : undefined
      }
      action={
        siasb.status === 'disconnected' ? (
          <Button size="sm" onPress={onConnect}>
            Conectar
          </Button>
        ) : (
          <>
            {siasb.status === 'reconnect_required' || expiring ? (
              <Button size="sm" onPress={onConnect}>
                Reconectar
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" aria-label="Desconectar o SIASB" onPress={onDisconnect}>
              Desconectar
            </Button>
          </>
        )
      }
    >
      {/* Reconectando ou vencendo, o cartão já tem o botão "Reconectar": a saúde só traz a frase. */}
      {siasb.health ? (
        <ConnectionHealth
          health={siasb.health}
          onAction={(action) => (action === 'retry' ? onRetry() : onConnect())}
          showAction={siasb.status === 'connected' && !expiring}
        />
      ) : null}
    </SourceCard>
  );
}

/** Sem a conexão oferecida: só convida a importar a vida acadêmica, e some se ela já foi confirmada ou não existe. */
function SiasbInvite() {
  const navigate = useNavigate();
  const { data } = useAcademic();
  // Sem a resposta, sem a importação disponível ou com a vida acadêmica já confirmada (aí o SIASB simplesmente não é
  // do curso da pessoa): não mostra nada.
  if (!data || !data.available || data.status === 'READY') return null;
  return (
    <SourceCard
      icon={<SiasbIcon size={26} />}
      title="SIASB"
      // Sem tela no canvas: texto meu, a confirmar.
      description="Importe a sua vida acadêmica para liberar a conexão com o SIASB."
      action={
        <Button variant="outline" size="sm" onPress={() => void navigate('/academic')}>
          Importar vida acadêmica
        </Button>
      }
    />
  );
}
