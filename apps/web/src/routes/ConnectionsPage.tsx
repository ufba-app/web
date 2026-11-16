import { useQueryClient } from '@tanstack/react-query';
import { AccountRow, Button, Chip, PageHeader, ServiceIcon, SourceCard } from '@ufba-app/web-ui';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ApiError } from '../api/client';
import {
  classroomStartUrl,
  disconnectMoodle,
  disconnectSiasb,
  disconnectSigaa,
  removeClassroomAccount,
  type ClassroomApp,
} from '../api/connections';
import { meQueryKey } from '../api/me';
import { useSession } from '../components/AppLayout';
import { NotificationsSection } from '../components/notifications/NotificationsSection';
import { PermissionsSection } from '../components/permissions/PermissionsSection';
import type { DisconnectSource } from '../components/DisconnectDialog';
import { DisconnectDialog, MoodleDialog, preloadDialogs, SiasbDialog, SigaaDialog } from '../components/lazyDialogs';
import { SiasbSection } from '../components/siasb/SiasbSection';
import '../components/passkey/passkey.css';
import { ActivatePasskey, QrUnlockBlock, UnlockWithFingerprint } from '../components/passkey/lazyPasskey';
import { formatStoredCpf } from '../forms/cpf';
import { notify } from '../lib/notify';
import { openSigaaLoggedIn } from '../lib/openSigaa';
import { dismissOffer, isOfferDismissed } from '../lib/passkey/offer';
import { hasWebAuthn, looksLikePhone } from '../lib/passkey/webauthn';
import { useDocumentTitle } from '../lib/useDocumentTitle';

type Flash = { tone: 'info' | 'danger'; text: string };

/** Volta do Classroom: a API redireciona para /connections?connected=classroom ou ?error=<code>&message=<texto>. */
function flashFromQuery(params: URLSearchParams): Flash | null {
  if (params.get('connected') === 'classroom') return { tone: 'info', text: 'Conta do Classroom conectada.' };
  if (params.get('error')) {
    return {
      tone: 'danger',
      text: params.get('message')?.trim() || 'Não deu para conectar o Classroom. Tente de novo.',
    };
  }
  return null;
}

const DISCONNECT_NAME: Record<DisconnectSource, string> = { sigaa: 'SIGAA', moodle: 'Moodle', siasb: 'SIASB' };

const CLASSROOM_BUTTON: Record<ClassroomApp, string> = {
  ufba: 'Conectar conta @ufba.br',
  guest: 'Conectar outra conta',
};

export function ConnectionsPage() {
  useDocumentTitle('Conexões');
  const me = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const queryNoticeShown = useRef(false);
  const [sigaaOpen, setSigaaOpen] = useState(false);
  const [moodleOpen, setMoodleOpen] = useState(false);
  const [siasbOpen, setSiasbOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState<DisconnectSource | null>(null);
  const [mounted, setMounted] = useState({ sigaa: false, moodle: false, siasb: false, disconnect: false });
  const [disconnectPending, setDisconnectPending] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  // Celular que aceita liberar outros aparelhos: só quem "parece celular" vê a oferta de ativar (nunca o PC).
  const [phone] = useState(looksLikePhone);
  const [offerDismissed, setOfferDismissed] = useState(isOfferDismissed);

  // Os diálogos ficam fora da primeira carga; baixam quando o navegador está ocioso.
  useEffect(preloadDialogs, []);

  // O aviso já foi lido: tira a query da barra de endereço e atualiza o estado das conexões.
  useEffect(() => {
    if (params.has('connected') || params.has('error') || params.has('message')) {
      // O retorno do Classroom vem na URL: vira um toast uma vez só (o StrictMode roda o efeito duas vezes em dev).
      if (!queryNoticeShown.current) {
        queryNoticeShown.current = true;
        const notice = flashFromQuery(params);
        if (notice) (notice.tone === 'danger' ? notify.error : notify.success)(notice.text);
      }
      navigate('/connections', { replace: true });
      void queryClient.invalidateQueries({ queryKey: meQueryKey });
    }
  }, [params, navigate, queryClient]);

  const { sigaa, moodle, classroom, siasb } = me.connections;
  const classroomConnected = classroom.accounts.some((a) => a.status === 'connected');
  // O SIASB só conta quando a API o oferece.
  const total = (classroom.available ? 3 : 2) + (siasb.offered ? 1 : 0);
  const connected = [
    sigaa.status === 'connected',
    moodle.status === 'connected',
    classroom.available && classroomConnected,
    siasb.offered && siasb.status === 'connected',
  ].filter(Boolean).length;

  const removeAccount = async (email: string) => {
    try {
      await removeClassroomAccount(email);
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
    } catch (error) {
      notify.error(error instanceof ApiError ? error.message : 'Não deu para remover a conta agora.');
    }
  };

  const confirmDisconnect = async () => {
    if (!disconnecting) return;
    setDisconnectPending(true);
    setDisconnectError(null);
    try {
      // Ao desconectar, o `/me` recarrega e a lista de permissões acompanha (o status do SIASB entra na chave dela).
      if (disconnecting === 'sigaa') await disconnectSigaa();
      else if (disconnecting === 'siasb') await disconnectSiasb();
      else await disconnectMoodle();
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      notify.success(`${DISCONNECT_NAME[disconnecting]} desconectado.`);
      setDisconnecting(null);
    } catch (error) {
      setDisconnectError(error instanceof ApiError ? error.message : 'Não deu para desconectar agora. Tente de novo.');
    } finally {
      setDisconnectPending(false);
    }
  };

  const askDisconnect = (source: DisconnectSource) => {
    setDisconnectError(null);
    setMounted((m) => ({ ...m, disconnect: true }));
    setDisconnecting(source);
  };

  const openSigaa = () => {
    setMounted((m) => ({ ...m, sigaa: true }));
    setSigaaOpen(true);
  };

  const openMoodle = () => {
    setMounted((m) => ({ ...m, moodle: true }));
    setMoodleOpen(true);
  };

  const openSiasb = () => {
    setMounted((m) => ({ ...m, siasb: true }));
    setSiasbOpen(true);
  };

  // O login do SIGAA é o CPF: com máscara quando for válido. Conexões antigas com outro login aparecem como vieram.
  const sigaaCpf = sigaa.login ? formatStoredCpf(sigaa.login) : null;
  const locked = sigaa.status === 'locked';
  // No computador, com o SIGAA fechado (trancado, sem sessão ou ainda sem cofre), o QR do celular vem sempre, com a
  // senha logo abaixo. No celular, só o trancado tem o bloco (a digital); o resto segue com "Conectar".
  const showQr = !phone && sigaa.status !== 'connected';
  const sigaaDescription =
    sigaa.status === 'password_required'
      ? 'Digite a senha de novo para voltar a ler seus dados.'
      : locked
        ? phone
          ? 'Trancado neste aparelho.'
          : 'Trancado neste navegador. Libere com o celular ou digite a senha.'
        : sigaa.login
          ? `${sigaaCpf ? `CPF ${sigaaCpf}` : `Usuário ${sigaa.login}`} · só leitura`
          : 'CPF e senha · só leitura';

  const refreshMe = () => queryClient.invalidateQueries({ queryKey: meQueryKey });
  // Oferta de ativar: celular, SIGAA aberto, nenhuma passkey ainda e a pessoa não disse "Agora não".
  const passkeyAvailable = hasWebAuthn();
  const canOffer = phone && sigaa.status === 'connected' && sigaa.passkey.slots === 0 && !offerDismissed;

  return (
    <>
      <PageHeader
        title="Conexões"
        description="Conecte uma vez. Vale para todo app que você autorizar."
        aside={<Chip tone="highlight">{`${connected} de ${total} conectadas`}</Chip>}
      />

      <div className="web-list">
        {/* Os cartões do design system usam <h3>; este título mantém a ordem dos níveis (h1, h2, h3) para leitor de tela. */}
        <h2 className="ufba-visually-hidden">Fontes de dados</h2>
        <SourceCard
          icon={<ServiceIcon service="sigaa" size={26} />}
          title="SIGAA"
          description={sigaaDescription}
          status={
            sigaa.status === 'connected' ? (
              <Chip tone="success">Conectado</Chip>
            ) : sigaa.status === 'password_required' ? (
              <Chip tone="danger">Sessão expirou</Chip>
            ) : locked ? (
              <Chip tone="warning">Trancado</Chip>
            ) : undefined
          }
          action={
            sigaa.status === 'connected' ? (
              <>
                {/* Abre a aba no clique; quem pede o link e segue para o SIGAA é a própria aba (lib/openSigaa.ts). */}
                <Button size="sm" onPress={openSigaaLoggedIn}>
                  Abrir o SIGAA
                </Button>
                <Button variant="ghost" size="sm" aria-label="Desconectar o SIGAA" onPress={() => askDisconnect('sigaa')}>
                  Desconectar
                </Button>
              </>
            ) : locked || showQr ? undefined : (
              <Button size="sm" onPress={openSigaa}>
                {sigaa.status === 'password_required' ? 'Digitar senha' : 'Conectar'}
              </Button>
            )
          }
        >
          {locked || showQr ? (
            <Suspense fallback={<div className="web-sk web-sk--card skeleton skeleton--shimmer web-sk-onwhite" aria-hidden="true" />}>
              {phone ? (
                <UnlockWithFingerprint userId={me.id} onUnlocked={() => void refreshMe()} onUsePassword={openSigaa} />
              ) : (
                <QrUnlockBlock
                  locked={locked}
                  onUnlocked={() => {
                    notify.success('SIGAA liberado pelo celular.');
                    void refreshMe();
                  }}
                  onUsePassword={openSigaa}
                />
              )}
            </Suspense>
          ) : null}
        </SourceCard>

        {canOffer && passkeyAvailable ? (
          <Suspense fallback={<div className="web-sk web-sk--card skeleton skeleton--shimmer web-sk-onwhite" aria-hidden="true" />}>
            <ActivatePasskey
              me={me}
              onDismiss={() => {
                dismissOffer();
                setOfferDismissed(true);
              }}
              onDone={() => void refreshMe()}
            />
          </Suspense>
        ) : null}

        {phone && !passkeyAvailable && sigaa.status === 'connected' && sigaa.passkey.slots === 0 ? (
          <div className="web-pk-note">
            <span>Este celular não suporta liberar outros aparelhos com a digital. O SIGAA continua funcionando com a senha.</span>
          </div>
        ) : null}

        <SourceCard
          icon={<ServiceIcon service="moodle" size={26} />}
          title="Moodle"
          description={moodle.account ?? 'ava.ufba.br'}
          status={
            moodle.status === 'connected' ? (
              <Chip tone="success">Conectado</Chip>
            ) : moodle.status === 'reconnect_required' ? (
              <Chip tone="danger">Sessão expirou</Chip>
            ) : undefined
          }
          action={
            moodle.status === 'connected' ? (
              <Button variant="ghost" size="sm" aria-label="Desconectar o Moodle" onPress={() => askDisconnect('moodle')}>
                Desconectar
              </Button>
            ) : (
              <Button size="sm" onPress={openMoodle}>
                {moodle.status === 'reconnect_required' ? 'Reconectar' : 'Conectar'}
              </Button>
            )
          }
        />

        {classroom.available ? (
          <SourceCard
            icon={<ServiceIcon service="classroom" size={26} />}
            title="Classroom"
            description="Turmas das suas contas Google"
            status={classroomConnected ? <Chip tone="success">Conectado</Chip> : undefined}
          >
            <div className="web-list">
              {classroom.accounts.map((account) => (
                <AccountRow
                  key={account.email}
                  email={account.email}
                  status={account.status === 'connected' ? 'connected' : 'expired'}
                  onRemove={() => void removeAccount(account.email)}
                />
              ))}
              <div className="web-inline">
                {classroom.apps.map((app) => (
                  <Button
                    key={app}
                    variant={classroom.accounts.length === 0 && app === 'ufba' ? 'primary' : 'outline'}
                    size="sm"
                    onPress={() => window.location.assign(classroomStartUrl(app))}
                  >
                    {CLASSROOM_BUTTON[app]}
                  </Button>
                ))}
              </div>
            </div>
          </SourceCard>
        ) : null}

        <SiasbSection siasb={siasb} onConnect={openSiasb} onDisconnect={() => askDisconnect('siasb')} />
      </div>

      {/* O que o Claude pode fazer em nome da pessoa, por fonte. Tudo vem da API; some se nenhuma fonte tem permissão. */}
      <PermissionsSection />

      {/* Avisos no aparelho (Web Push): aparelhos e um interruptor por tipo. Some se a API não tem avisos. */}
      <NotificationsSection />

      <Suspense fallback={null}>
        {mounted.disconnect ? (
          <DisconnectDialog
            source={disconnecting}
            pending={disconnectPending}
            error={disconnectError}
            onConfirm={() => void confirmDisconnect()}
            onCancel={() => setDisconnecting(null)}
          />
        ) : null}
        {mounted.sigaa ? (
          <SigaaDialog
            isOpen={sigaaOpen}
            onOpenChange={setSigaaOpen}
            onConnected={() => {
              notify.success('SIGAA conectado.');
              // Recém-conectado: leva direto para a vida acadêmica (o convite para importar o histórico). O diálogo já
              // atualizou o `/me`, então a página nova já encontra o SIGAA aberto.
              void navigate('/academic');
            }}
          />
        ) : null}
        {mounted.moodle ? (
          <MoodleDialog
            isOpen={moodleOpen}
            onOpenChange={setMoodleOpen}
            onConnected={() => notify.success('Moodle conectado.')}
          />
        ) : null}
        {mounted.siasb ? <SiasbDialog isOpen={siasbOpen} onOpenChange={setSiasbOpen} expiresAt={siasb.expiresAt} /> : null}
      </Suspense>
    </>
  );
}
