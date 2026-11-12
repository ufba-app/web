import { useQueryClient } from '@tanstack/react-query';
import { AccountRow, Button, Chip, Notice, PageHeader, ServiceIcon, SourceCard } from '@ufba-app/web-ui';
import { Suspense, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ApiError } from '../api/client';
import {
  classroomStartUrl,
  disconnectMoodle,
  disconnectSigaa,
  removeClassroomAccount,
  type ClassroomApp,
} from '../api/connections';
import { meQueryKey } from '../api/me';
import { useSession } from '../components/AppLayout';
import type { DisconnectSource } from '../components/DisconnectDialog';
import { DisconnectDialog, MoodleDialog, preloadDialogs, SigaaDialog } from '../components/lazyDialogs';
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
  const [flash, setFlash] = useState<Flash | null>(() => flashFromQuery(params));
  const [sigaaOpen, setSigaaOpen] = useState(false);
  const [moodleOpen, setMoodleOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState<DisconnectSource | null>(null);
  const [mounted, setMounted] = useState({ sigaa: false, moodle: false, disconnect: false });
  const [disconnectPending, setDisconnectPending] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  // Os diálogos ficam fora da primeira carga; baixam quando o navegador está ocioso.
  useEffect(preloadDialogs, []);

  // O aviso já foi lido: tira a query da barra de endereço e atualiza o estado das conexões.
  useEffect(() => {
    if (params.has('connected') || params.has('error') || params.has('message')) {
      navigate('/connections', { replace: true });
      void queryClient.invalidateQueries({ queryKey: meQueryKey });
    }
  }, [params, navigate, queryClient]);

  const { sigaa, moodle, classroom } = me.connections;
  const classroomConnected = classroom.accounts.some((a) => a.status === 'connected');
  const total = classroom.available ? 3 : 2;
  const connected = [sigaa.status === 'connected', moodle.status === 'connected', classroom.available && classroomConnected].filter(Boolean).length;

  const removeAccount = async (email: string) => {
    setFlash(null);
    try {
      await removeClassroomAccount(email);
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
    } catch (error) {
      setFlash({ tone: 'danger', text: error instanceof ApiError ? error.message : 'Não deu para remover a conta agora.' });
    }
  };

  const confirmDisconnect = async () => {
    if (!disconnecting) return;
    setDisconnectPending(true);
    setDisconnectError(null);
    try {
      await (disconnecting === 'sigaa' ? disconnectSigaa() : disconnectMoodle());
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      setFlash({ tone: 'info', text: `${disconnecting === 'sigaa' ? 'SIGAA' : 'Moodle'} desconectado.` });
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

  const sigaaDescription =
    sigaa.status === 'password_required'
      ? 'Digite a senha de novo para voltar a ler seus dados.'
      : sigaa.login
        ? `Usuário ${sigaa.login} · só leitura`
        : 'Usuário e senha · só leitura';

  return (
    <>
      <PageHeader
        title="Conexões"
        description="Conecte uma vez. Vale para todo app que você autorizar."
        aside={<Chip tone="highlight">{`${connected} de ${total} conectadas`}</Chip>}
      />
      {flash ? <Notice tone={flash.tone}>{flash.text}</Notice> : null}

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
            ) : undefined
          }
          action={
            sigaa.status === 'connected' ? (
              <Button variant="ghost" size="sm" aria-label="Desconectar o SIGAA" onPress={() => askDisconnect('sigaa')}>
                Desconectar
              </Button>
            ) : (
              <Button size="sm" onPress={openSigaa}>
                {sigaa.status === 'password_required' ? 'Digitar senha' : 'Conectar'}
              </Button>
            )
          }
        />

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
      </div>

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
            onConnected={() => setFlash({ tone: 'info', text: 'SIGAA conectado.' })}
          />
        ) : null}
        {mounted.moodle ? (
          <MoodleDialog
            isOpen={moodleOpen}
            onOpenChange={setMoodleOpen}
            onConnected={() => setFlash({ tone: 'info', text: 'Moodle conectado.' })}
          />
        ) : null}
      </Suspense>
    </>
  );
}
