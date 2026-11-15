import '../components/passkey/passkey.css';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, formatDay, initials, UFBA_TIME_ZONE } from '@ufba-app/web-ui';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '../api/client';
import { useMe } from '../api/me';
import { getPairingInfo } from '../api/passkey';
import { deleteSession } from '../api/session';
import { CheckIcon, ClockIcon, CopyIcon, FingerprintIcon, GlobeIcon, LockIcon, PhoneIcon, WarnIcon, XCircleIcon } from '../components/passkey/icons';
import { PkIcon, type PkTone } from '../components/passkey/PkIcon';
import type { Me } from '../contract';
import { notify } from '../lib/notify';
import { authUrl, getPanelOrigin } from '../lib/origins';
import { approvePairing } from '../lib/passkey/flows';
import { buildPairUrl, PAIR_PATH, parsePairFragment, type PairFragment } from '../lib/passkey/pairing';
import { clearStash, loadStash, saveStash } from '../lib/passkey/pairStash';
import { hasWebAuthn } from '../lib/passkey/webauthn';
import { useDocumentTitle } from '../lib/useDocumentTitle';

/**
 * Página que o CELULAR abre ao ler o QR do computador (`/pair#id.chave`). Fora do menu do painel: é uma tela cheia,
 * curta, sem distração. O desenho cobre: abrindo, não logado, pedido de outra conta, confirmação ("Liberar … ?"),
 * digital, sucesso e as falhas (cancelou, sem a senha guardada, navegador sem passkey, pedido vencido).
 * O que está sendo liberado (aparelho, cliente, horário) vem do SERVIDOR, não do texto do link.
 */

type After = 'review' | 'waiting' | 'done' | 'cancelled' | 'no_passkey' | 'failed' | 'expired';

function Brand() {
  return (
    <span className="web-brand">
      <img src="/brasao.svg" alt="" width="28" height="28" />
      ufba.app
    </span>
  );
}

function Screen({ tone, icon, ring, title, children, actions }: { tone: PkTone; icon: ReactNode; ring?: boolean; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <section className="web-pk-card web-pk-card--center" aria-live="polite">
      <PkIcon tone={tone} size="lg" ring={ring}>
        {icon}
      </PkIcon>
      <h1>{title}</h1>
      {children}
      {actions ? <div className="web-pk-actions">{actions}</div> : null}
    </section>
  );
}

function Account({ me }: { me: Me }) {
  const name = me.name ?? me.email ?? 'Conta ufba.app';
  return (
    <span className="web-pk-account">
      <span className="web-pk-account__avatar" aria-hidden="true">
        {initials(name)}
      </span>
      {me.email ?? name}
    </span>
  );
}

/** "Hoje, 14:32" (ou "4 nov, 14:32"), no fuso da UFBA. */
export function formatPairTime(date: Date, now: Date = new Date()): string {
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: UFBA_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  const sameDay = formatDay(date) === formatDay(now);
  return `${sameDay ? 'Hoje' : formatDay(date)}, ${time}`;
}

function PairSkeleton() {
  return (
    <section className="web-pk-card" aria-busy="true" aria-label="Abrindo o pedido">
      <div className="web-sk web-sk--title skeleton skeleton--shimmer web-sk-onwhite" />
      <div className="web-sk web-sk--line skeleton skeleton--shimmer web-sk-onwhite" />
      <div className="web-sk web-sk--card skeleton skeleton--shimmer web-sk-onwhite" />
    </section>
  );
}

export function PairPage() {
  useDocumentTitle('Liberar o SIGAA');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [fragment] = useState<PairFragment | null>(() => {
    const fromLink = parsePairFragment(window.location.hash);
    if (fromLink) {
      // O fragmento sai da barra de endereço e fica só neste navegador, por 5 minutos (ver pairStash.ts).
      saveStash(fromLink);
      window.history.replaceState(null, '', PAIR_PATH);
      return fromLink;
    }
    return loadStash();
  });
  const [after, setAfter] = useState<After>('review');
  const me = useMe();
  const signedOut = me.error instanceof ApiError && me.error.code === 'session_expired';
  const pairId = fragment?.pairId ?? '';
  const info = useQuery({
    queryKey: ['pairing-info', pairId],
    queryFn: () => getPairingInfo(pairId),
    enabled: !!fragment && !!me.data,
    retry: false,
    staleTime: 0,
  });

  const finish = () => {
    clearStash();
    navigate('/connections', { replace: true });
  };

  const goToSignIn = () => window.location.assign(authUrl(`/sign-in?return=${encodeURIComponent(PAIR_PATH)}`));

  const switchAccount = async () => {
    try {
      await deleteSession();
    } catch (cause) {
      notify.error(cause instanceof ApiError ? cause.message : 'Não deu para sair agora. Tente de novo.');
      return;
    }
    queryClient.clear();
    goToSignIn();
  };

  const copyLink = async () => {
    if (!fragment) return;
    try {
      await navigator.clipboard.writeText(buildPairUrl(getPanelOrigin(), fragment.pairId, fragment.computerPub, ''));
      notify.success('Link copiado.');
    } catch {
      notify.error('Não deu para copiar. Abra o ufba.app no Chrome ou no Safari e leia o QR de novo.');
    }
  };

  const release = async () => {
    if (!fragment || !me.data) return;
    setAfter('waiting');
    const result = await approvePairing({ userId: me.data.id, pairId: fragment.pairId, computerPub: fragment.computerPub });
    if (result.ok) {
      clearStash();
      setAfter('done');
      return;
    }
    if (result.reason === 'expired') clearStash();
    setAfter(
      { cancelled: 'cancelled', no_passkey: 'no_passkey', expired: 'expired', unsupported: 'failed', failed: 'failed' }[result.reason] as After,
    );
  };

  const body = (() => {
    if (!fragment) {
      return <Expired onHome={finish} />;
    }
    if (me.isPending) return <PairSkeleton />;
    if (signedOut) {
      return (
        <Screen
          tone="soft"
          icon={<PhoneIcon />}
          title="Entre para liberar o SIGAA"
          actions={
            <Button onPress={goToSignIn}>
              Entrar com Google
            </Button>
          }
        >
          <p>Use a mesma conta Google @ufba.br que você usa no computador.</p>
        </Screen>
      );
    }
    if (me.error || !me.data) {
      return (
        <Screen tone="err" icon={<WarnIcon />} title="Algo deu errado" actions={<Button onPress={() => void me.refetch()}>Tentar de novo</Button>}>
          <p>{me.error instanceof ApiError ? me.error.message : 'Não foi você. Tente de novo em instantes.'}</p>
        </Screen>
      );
    }
    const account = me.data;

    if (info.isPending) return <PairSkeleton />;
    if (info.error) {
      if (info.error instanceof ApiError && info.error.status === 404) {
        return (
          <Screen
            tone="err"
            icon={<XCircleIcon />}
            title="Este pedido não é desta conta"
            actions={
              <>
                <Button variant="outline" onPress={() => void switchAccount()}>
                  Trocar de conta
                </Button>
                <Button variant="ghost" onPress={finish}>
                  Ir para o painel
                </Button>
              </>
            }
          >
            <p>Ele é de outra conta ou já venceu. Confira se o computador e o celular estão na mesma conta.</p>
            <Account me={account} />
          </Screen>
        );
      }
      return (
        <Screen tone="err" icon={<WarnIcon />} title="Algo deu errado" actions={<Button onPress={() => void info.refetch()}>Tentar de novo</Button>}>
          <p>{info.error instanceof ApiError ? info.error.message : 'Não deu para abrir o pedido agora.'}</p>
        </Screen>
      );
    }

    const request = info.data;
    if (after === 'expired' || request.delivered || Date.parse(request.expiresAt) <= Date.now()) return <Expired onHome={finish} />;

    if (!hasWebAuthn()) {
      return (
        <Screen
          tone="soft"
          icon={<GlobeIcon />}
          title="Este navegador não libera com a digital"
          actions={
            <Button onPress={() => void copyLink()}>
              <CopyIcon size={18} />
              Copiar o link
            </Button>
          }
        >
          <p>Abra este link no Chrome ou no Safari.</p>
        </Screen>
      );
    }

    const label = request.label?.trim() || 'outro aparelho';
    const noPasskey = after === 'no_passkey' || account.connections.sigaa.passkey.slots === 0;

    if (noPasskey) {
      return (
        <Screen
          tone="warn"
          icon={<LockIcon />}
          title="Este celular não tem a senha guardada"
          actions={<Button onPress={() => { clearStash(); navigate('/connections', { replace: true }); }}>Ativar este celular</Button>}
        >
          <p>Ative este celular primeiro, ou digite a senha do SIGAA direto no computador.</p>
        </Screen>
      );
    }

    if (after === 'waiting') {
      return (
        <Screen
          tone="primary"
          ring
          icon={<FingerprintIcon />}
          title="Confirme com a digital"
          actions={
            <Button variant="ghost" onPress={finish}>
              Cancelar
            </Button>
          }
        >
          <p>
            Liberando <strong>{label}</strong>.
          </p>
        </Screen>
      );
    }

    if (after === 'done') {
      return (
        <Screen tone="ok" icon={<CheckIcon />} title="Pronto">
          <p>
            O SIGAA foi liberado no <strong>{label}</strong>. Volte ao computador.
          </p>
        </Screen>
      );
    }

    if (after === 'cancelled') {
      return (
        <Screen
          tone="warn"
          icon={<FingerprintIcon />}
          title="A digital foi cancelada"
          actions={
            <>
              <Button onPress={() => void release()}>Tentar de novo</Button>
              <Button variant="outline" onPress={finish}>
                Cancelar
              </Button>
            </>
          }
        >
          <p>Nada foi liberado. Dá para tentar de novo agora.</p>
        </Screen>
      );
    }

    if (after === 'failed') {
      return (
        <Screen
          tone="err"
          icon={<WarnIcon />}
          title="Não deu para liberar"
          actions={
            <>
              <Button onPress={() => void release()}>Tentar de novo</Button>
              <Button variant="outline" onPress={finish}>
                Cancelar
              </Button>
            </>
          }
        >
          <p>Algo falhou no caminho. Tente de novo ou digite a senha do SIGAA direto no computador.</p>
        </Screen>
      );
    }

    return (
      <section className="web-pk-card">
        <h1>
          Liberar <em className="web-pk-em">{label}</em>?
        </h1>
        <p>O SIGAA passa a funcionar nesse aparelho.</p>
        <ul className="web-pk-rows">
          <li className="web-pk-row">
            <div>
              <small>Aparelho</small>
              <b>{label}</b>
            </div>
          </li>
          {request.client ? (
            <li className="web-pk-row">
              <div>
                <small>Pedido por</small>
                <b>{request.client}</b>
              </div>
            </li>
          ) : null}
          <li className="web-pk-row">
            <div>
              <small>Horário</small>
              <b>{formatPairTime(new Date(request.createdAt))}</b>
            </div>
          </li>
        </ul>
        <Account me={account} />
        <div className="web-pk-warning" role="alert">
          <WarnIcon size={20} />
          <p>
            <strong>Só confirme se você acabou de pedir isso.</strong>
          </p>
        </div>
        <div className="web-pk-actions">
          <Button onPress={() => void release()}>Liberar</Button>
          <Button variant="outline" onPress={finish}>
            Cancelar
          </Button>
        </div>
      </section>
    );
  })();

  return (
    <main className="web-pk-phone-page">
      <Brand />
      {body}
    </main>
  );
}

function Expired({ onHome }: { onHome: () => void }) {
  return (
    <Screen
      tone="err"
      icon={<ClockIcon />}
      title="Pedido vencido ou já respondido"
      actions={
        <Button variant="outline" onPress={onHome}>
          Ir para o painel
        </Button>
      }
    >
      <p>Cada pedido vale 5 minutos e só pode ser usado uma vez. Gere um QR novo no computador.</p>
    </Screen>
  );
}
