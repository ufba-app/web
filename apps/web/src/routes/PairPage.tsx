import '../components/passkey/passkey.css';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, formatDay, initials, UFBA_TIME_ZONE } from '@ufba-app/web-ui';
import { Suspense, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '../api/client';
import { meQueryKey, useMe } from '../api/me';
import { SigaaDialog } from '../components/lazyDialogs';
import { getPairingInfo } from '../api/passkey';
import { deleteSession } from '../api/session';
import { CheckIcon, ClockIcon, FingerprintIcon, PhoneIcon, WarnIcon, XCircleIcon } from '../components/passkey/icons';
import { PkIcon, type PkTone } from '../components/passkey/PkIcon';
import type { Me } from '../contract';
import { notify } from '../lib/notify';
import { authUrl } from '../lib/origins';
import { activatePasskey, approvePairing, approvePairingWithSession } from '../lib/passkey/flows';
import { deviceLabel, PAIR_PATH, parsePairFragment, type PairFragment } from '../lib/passkey/pairing';
import { clearStash, loadStash, saveStash } from '../lib/passkey/pairStash';
import { hasWebAuthn } from '../lib/passkey/webauthn';
import { useDocumentTitle } from '../lib/useDocumentTitle';

/**
 * Página que o CELULAR abre ao ler o QR do computador (`/pair#id.chave`). Fora do menu do painel: é uma tela cheia,
 * curta, sem distração. O desenho cobre: abrindo, não logado, pedido de outra conta, confirmação ("Liberar … ?"),
 * digital, sucesso e as falhas (cancelou, sem a senha guardada, navegador sem passkey, pedido vencido).
 * O que está sendo liberado vem do SERVIDOR, não do texto do link. A identificação confiável é o navegador e o
 * sistema que a API leu do User-Agent do computador (`seenBrowser`/`seenOs`) mais a hora do pedido; `label` e `client`
 * são o que o computador diz e aparecem só como tal (achado A1: um QR mandado por golpe traria um nome bonito).
 */

type After = 'review' | 'waiting' | 'sending' | 'done' | 'cancelled' | 'activate_cancelled' | 'no_passkey' | 'failed' | 'expired';

/** Como terminou a ativação da digital neste celular, para o texto do "Pronto". */
type Activation = 'yes' | 'no' | 'skipped';

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
  const [activated, setActivated] = useState<Activation>('skipped');
  const [passwordOpen, setPasswordOpen] = useState(false);
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

  // Com cópia da chave neste celular e WebAuthn, a digital abre a DK (como sempre). Sem isso (primeira vez, ou aparelho
  // sem PRF), a DK vem do SIGAA aberto NESTA sessão; se ainda não está aberto, a pessoa digita a senha aqui.
  const sigaaState = me.data?.connections.sigaa;
  const useDigital = (sigaaState?.passkey.slots ?? 0) > 0 && hasWebAuthn() && after !== 'no_passkey';
  const needPassword = !useDigital && !!sigaaState && sigaaState.status !== 'connected';

  const finishApprove = (result: Awaited<ReturnType<typeof approvePairing>>, activation: Activation) => {
    if (result.ok) {
      clearStash();
      setActivated(activation);
      setAfter('done');
      return;
    }
    if (result.reason === 'expired') clearStash();
    setAfter(
      { cancelled: 'cancelled', no_passkey: 'no_passkey', expired: 'expired', unsupported: 'failed', failed: 'failed' }[result.reason] as After,
    );
  };

  /** `justConnected`: a senha acabou de ser digitada aqui (a conta ainda mostra o estado antigo). */
  const release = async (options: { skipActivation?: boolean; justConnected?: boolean } = {}) => {
    if (!fragment || !me.data) return;
    if (useDigital && !options.justConnected) {
      setAfter('waiting');
      finishApprove(await approvePairing({ userId: me.data.id, pairId: fragment.pairId, computerPub: fragment.computerPub }), 'skipped');
      return;
    }
    // Sem a digital: ativa este celular se der (a pessoa já está aqui, com o SIGAA aberto) e libera com a DK da sessão.
    const slots = options.justConnected ? 0 : me.data.connections.sigaa.passkey.slots;
    let activation: Activation = 'skipped';
    if (hasWebAuthn() && slots === 0 && !options.skipActivation) {
      setAfter('waiting');
      const result = await activatePasskey({
        userId: me.data.id,
        userName: me.data.email ?? me.data.id,
        displayName: me.data.name ?? me.data.email ?? 'ufba.app',
        label: deviceLabel(),
      });
      if (result.ok) {
        activation = 'yes';
        void queryClient.invalidateQueries({ queryKey: meQueryKey });
      } else if (result.reason === 'cancelled') {
        setAfter('activate_cancelled');
        return;
      } else {
        // Sem PRF (ou falhou): segue sem a digital, liberando só o computador.
        activation = 'no';
      }
    }
    setAfter('sending');
    finishApprove(await approvePairingWithSession({ pairId: fragment.pairId, computerPub: fragment.computerPub }), activation);
  };

  const pressRelease = () => {
    if (needPassword) {
      setPasswordOpen(true);
      return;
    }
    void release();
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

    // Identificação confiável: navegador e sistema lidos pela API do User-Agent do computador, mais a hora do pedido.
    // `label` e `client` são texto que o computador escolheu: aparecem só como "o computador diz", nunca em destaque.
    const seen = [request.seenBrowser?.trim(), request.seenOs?.trim()].filter(Boolean) as string[];
    const seenDevice = request.seenBrowser?.trim() && request.seenOs?.trim() ? `${request.seenBrowser.trim()} no ${request.seenOs.trim()}` : seen[0];
    const claimedLabel = request.label?.trim();
    const claimedClient = request.client?.trim();
    if (after === 'sending') {
      return (
        <Screen tone="primary" ring icon={<FingerprintIcon />} title="Liberando…">
          <p>Liberando o SIGAA no computador{seenDevice ? <> (<strong>{seenDevice}</strong>)</> : null}.</p>
        </Screen>
      );
    }

    if (after === 'activate_cancelled') {
      return (
        <Screen
          tone="warn"
          icon={<FingerprintIcon />}
          title="A digital foi cancelada"
          actions={
            <>
              <Button onPress={() => void release()}>Tentar de novo</Button>
              <Button variant="outline" onPress={() => void release({ skipActivation: true })}>
                Liberar sem a digital
              </Button>
              <Button variant="ghost" onPress={finish}>
                Cancelar
              </Button>
            </>
          }
        >
          <p>Este celular ainda não guarda a chave com a digital. Dá para liberar o computador mesmo assim.</p>
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
          <p>Liberando o SIGAA no computador{seenDevice ? <> (<strong>{seenDevice}</strong>)</> : null}.</p>
        </Screen>
      );
    }

    if (after === 'done') {
      return (
        <Screen tone="ok" icon={<CheckIcon />} title="Pronto">
          <p>O SIGAA foi liberado no computador. Volte a ele.</p>
          {activated === 'yes' ? <p className="web-pk-fine">Este celular também ficou ativado: da próxima vez basta a digital.</p> : null}
          {activated === 'no' ? <p className="web-pk-fine">Este celular não guarda a chave com a digital, então liberei só o computador.</p> : null}
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
          Liberar o SIGAA <em className="web-pk-em">no computador</em>?
        </h1>
        <p>O SIGAA passa a funcionar nesse computador.</p>
        <ul className="web-pk-rows">
          <li className="web-pk-row">
            <div>
              <small>Navegador do computador</small>
              <b>{seenDevice ?? 'Não deu para identificar'}</b>
            </div>
          </li>
          <li className="web-pk-row">
            <div>
              <small>Horário do pedido</small>
              <b>{formatPairTime(new Date(request.createdAt))}</b>
            </div>
          </li>
        </ul>
        {claimedLabel || claimedClient ? (
          <p className="web-pk-claimed">
            O computador diz: {[claimedLabel, claimedClient].filter(Boolean).join(' · ')}. Esse texto vem do computador e não prova quem é.
          </p>
        ) : null}
        <Account me={account} />
        <div className="web-pk-warning" role="alert">
          <WarnIcon size={20} />
          <p>
            <strong>Só confirme se você acabou de pedir isso.</strong>
          </p>
        </div>
        {needPassword ? (
          <p className="web-pk-fine">
            O celular vai pedir a senha do SIGAA, uma vez só.
            {account.connections.sigaa.status !== 'disconnected'
              ? ' Como já havia uma senha guardada, digitar de novo desativa a digital dos outros celulares e dos apps.'
              : ''}
          </p>
        ) : null}
        <div className="web-pk-actions">
          <Button onPress={pressRelease}>Liberar</Button>
          <Button variant="outline" onPress={finish}>
            Cancelar
          </Button>
        </div>
        {passwordOpen ? (
          <Suspense fallback={null}>
            <SigaaDialog
              isOpen={passwordOpen}
              onOpenChange={setPasswordOpen}
              onConnected={() => void release({ justConnected: true })}
            />
          </Suspense>
        ) : null}
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
