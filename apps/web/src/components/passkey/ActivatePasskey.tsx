import { Button, Notice } from '@ufba-app/web-ui';
import { useState } from 'react';
import type { Me } from '../../contract';
import { activatePasskey, type ActivateResult } from '../../lib/passkey/flows';
import { deviceLabel } from '../../lib/passkey/pairing';
import { CheckIcon, FingerprintIcon, PhoneIcon, WarnIcon } from './icons';
import { PkIcon } from './PkIcon';

type Phase = 'offer' | 'creating' | 'checking' | 'done' | 'cancelled' | 'unsupported' | 'limit' | 'failed' | 'not_connected';

const FAILURE_PHASE: Record<Extract<ActivateResult, { ok: false }>['reason'], Phase> = {
  cancelled: 'cancelled',
  unsupported: 'unsupported',
  limit: 'limit',
  not_connected: 'not_connected',
  failed: 'failed',
};

function Steps({ current }: { current: 1 | 2 }) {
  const items = ['1 Digital', '2 Conferir', '3 Pronto'];
  return (
    <ol className="web-pk-steps" aria-label="Passos">
      {items.map((item, index) => (
        <li key={item} aria-current={index + 1 === current ? 'step' : undefined}>
          {item}
        </li>
      ))}
    </ol>
  );
}

/**
 * Oferta de "Usar este celular para liberar outros aparelhos": ativar cria a passkey, guarda a chave do cofre sob ela
 * e confere que abre (duas confirmações com a digital). Nada da senha passa por aqui. Estados do desenho: oferta,
 * criando, conferindo, ativado, cancelou, sem suporte.
 */
export function ActivatePasskey({
  me,
  onDismiss,
  onDone,
  heading = 'Usar este celular para liberar outros aparelhos',
}: {
  me: Me;
  /** "Agora não". Sem isso o botão não aparece (a lista de celulares oferece só "Ativar"). */
  onDismiss?: () => void;
  /** Depois do "Concluir": quem chama atualiza o `/me` e a lista de celulares. */
  onDone: () => void;
  heading?: string;
}) {
  const [phase, setPhase] = useState<Phase>('offer');

  const start = async () => {
    setPhase('creating');
    const result = await activatePasskey({
      userId: me.id,
      userName: me.email ?? me.id,
      displayName: me.name ?? me.email ?? 'ufba.app',
      label: deviceLabel(),
      onChecking: () => setPhase('checking'),
    });
    setPhase(result.ok ? 'done' : FAILURE_PHASE[result.reason]);
  };

  if (phase === 'creating') {
    return (
      <section className="web-pk-card web-pk-card--center" aria-live="polite">
        <PkIcon tone="primary" size="lg" ring>
          <FingerprintIcon />
        </PkIcon>
        <h2>Confirme com a digital</h2>
        <p>É só para ativar este celular. Nada sai dele.</p>
        <Steps current={1} />
      </section>
    );
  }

  if (phase === 'checking') {
    return (
      <section className="web-pk-card web-pk-card--center" aria-live="polite">
        <span className="web-spinner" aria-hidden="true" />
        <h2>Conferindo…</h2>
        <p>Estamos guardando a chave deste celular.</p>
        <Steps current={2} />
      </section>
    );
  }

  if (phase === 'done') {
    return (
      <section className="web-pk-card web-pk-card--center">
        <PkIcon tone="ok" size="lg">
          <CheckIcon />
        </PkIcon>
        <h2>Celular ativado</h2>
        <p>Agora este celular libera o SIGAA em outros aparelhos com a sua digital.</p>
        <div className="web-pk-actions">
          <Button onPress={onDone}>Concluir</Button>
        </div>
      </section>
    );
  }

  if (phase === 'unsupported') {
    return (
      <div className="web-pk-note">
        <PhoneIcon size={18} />
        <span>Este celular não suporta liberar outros aparelhos com a digital. O SIGAA continua funcionando com a senha.</span>
      </div>
    );
  }

  const problem: Partial<Record<Phase, { tone: 'warning' | 'danger'; text: string }>> = {
    cancelled: { tone: 'warning', text: 'A digital foi cancelada. Nada foi ativado.' },
    limit: { tone: 'warning', text: 'Você chegou ao limite de 5 celulares. Remova um para ativar outro.' },
    not_connected: { tone: 'warning', text: 'Conecte o SIGAA neste navegador antes de ativar o celular.' },
    failed: { tone: 'danger', text: 'Não deu para ativar agora. Tente de novo.' },
  };
  const notice = problem[phase];
  const blocked = phase === 'limit' || phase === 'not_connected';

  return (
    <section className="web-pk-card">
      {notice ? (
        <Notice tone={notice.tone} icon={<WarnIcon size={20} />}>
          {notice.text}
        </Notice>
      ) : (
        <PkIcon tone="soft" size="md">
          <FingerprintIcon />
        </PkIcon>
      )}
      <h2>{heading}</h2>
      {!notice ? <p>Quando o SIGAA trancar no computador, você libera aqui com a digital, sem digitar a senha.</p> : null}
      <div className="web-pk-actions">
        {!blocked ? <Button onPress={() => void start()}>{phase === 'offer' ? 'Ativar' : 'Tentar de novo'}</Button> : null}
        {onDismiss ? (
          <Button variant="outline" onPress={onDismiss}>
            Agora não
          </Button>
        ) : null}
      </div>
    </section>
  );
}
