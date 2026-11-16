import { useQueryClient } from '@tanstack/react-query';
import { Button, Chip, EmptyState, Notice, PageHeader } from '@ufba-app/web-ui';
import { useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router';
import {
  academicQueryKey,
  confirmAcademicImport,
  discardAcademicDraft,
  setAcademicConsent,
  startAcademicImport,
  useAcademic,
} from '../api/academic';
import { ApiError } from '../api/client';
import type { AcademicFailure, AcademicState } from '../contract';
import { AcademicCurriculum } from '../components/academic/AcademicCurriculum';
import { AcademicDraftView } from '../components/academic/AcademicDraftView';
import { AcademicSettings } from '../components/academic/AcademicSettings';
import { AcademicSummary } from '../components/academic/AcademicSummary';
import '../components/academic/academic.css';
import { useSession } from '../components/AppLayout';
import { PageSkeleton } from '../components/Skeletons';
import { notify } from '../lib/notify';
import { useDocumentTitle } from '../lib/useDocumentTitle';

/** Falha durante a importação: vem como `status=FAILED` + código (nunca mensagem). Os textos são do handoff da Alicerce. */
const FAILURE_TEXT: Record<AcademicFailure, string> = {
  SIGAA_UNAVAILABLE: 'Não conseguimos pegar o histórico no SIGAA agora.',
  PDF_INVALID: 'Isso não parece um histórico escolar.',
  REDACTION_REFUSED:
    'Por segurança, não enviamos nada: não conseguimos garantir que seus dados pessoais ficariam de fora.',
  READER_FAILED: 'Não conseguimos ler o histórico agora.',
  // Sem tela no canvas: texto meu, a confirmar.
  SESSION_EXPIRED: 'A sessão do SIGAA expirou no meio da importação. Abra o SIGAA de novo e tente outra vez.',
  TIMEOUT: 'A importação demorou demais e foi interrompida.',
};

/** Erros do POST /me/academic/import que a tela explica em vez de mostrar a mensagem crua. */
function startErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'too_many_attempts') return 'Você já tentou 3 vezes hoje. Tente amanhã.';
    if (error.code === 'import_unavailable') return 'A importação está indisponível no momento. Tente mais tarde.';
    return error.message;
  }
  return 'Não deu para começar a importação agora. Tente de novo.';
}

export function AcademicPage() {
  useDocumentTitle('Vida acadêmica');
  const { data, error, isPending, refetch } = useAcademic();

  return (
    <>
      <PageHeader title="Vida acadêmica" description="O que você já fez e o que falta no curso." />
      {isPending ? <PageSkeleton /> : null}
      {error ? (
        <Notice tone="danger">
          {error instanceof ApiError ? error.message : 'Não deu para carregar sua vida acadêmica agora.'}{' '}
          <button type="button" className="web-link" onClick={() => void refetch()}>
            Tentar de novo
          </button>
        </Notice>
      ) : null}
      {data ? <AcademicBody state={data} /> : null}
    </>
  );
}

function AcademicBody({ state }: { state: AcademicState }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useSession();
  const sigaaOpen = me.connections.sigaa.status === 'connected';
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // O API só descobre que o SIGAA está fechado ao importar (409 `source_not_connected`); a sessão do `/me` pode estar defasada.
  const [needsSigaa, setNeedsSigaa] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: academicQueryKey });

  /** Aceita (se ainda não aceitou) e importa. A tela depois acompanha por polling até sair de `RUNNING`. */
  const startImport = async () => {
    setBusy(true);
    setProblem(null);
    try {
      if (!state.consent) await setAcademicConsent(true);
      await startAcademicImport();
      await refresh();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'source_not_connected') setNeedsSigaa(true);
      else if (cause instanceof ApiError && cause.code === 'import_in_progress') await refresh();
      else setProblem(startErrorText(cause));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Volta ao histórico já salvo, descartando só a falha de um "Atualizar" (`DELETE /me/academic/draft`). Sem isso a
   * pessoa ficaria presa fora do próprio resumo até a próxima leitura dar certo.
   */
  const discard = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await discardAcademicDraft();
      setNeedsSigaa(false);
      notify.info('Voltei ao seu histórico.');
      await refresh();
    } catch (cause) {
      if (cause instanceof ApiError && (cause.code === 'import_not_found' || cause.code === 'import_in_progress')) {
        await refresh();
      } else {
        setProblem(cause instanceof ApiError ? cause.message : 'Não deu para voltar ao histórico agora. Tente de novo.');
      }
    } finally {
      setBusy(false);
    }
  };

  // Resumo, grade e configurações só existem com a importação pronta (`READY`). Fora disso, qualquer subcaminho volta.
  if (state.status !== 'READY' && location.pathname.replace(/\/+$/, '') !== '/academic') {
    return <Navigate to="/academic" replace />;
  }

  if (state.status === 'RUNNING') return <Running />;

  if (state.status === 'NEEDS_CONFIRMATION' && state.draft) {
    return (
      <Confirm
        draft={state.draft}
        hasPrevious={state.summary !== null}
        onChanged={refresh}
        onRetry={startImport}
        busy={busy}
        problem={problem}
      />
    );
  }

  if (state.status === 'READY') {
    return (
      <div className="web-fields">
        <nav className="web-va-tabs" aria-label="Vida acadêmica">
          <NavLink to="/academic" end>
            Resumo
          </NavLink>
          <NavLink to="/academic/curriculum">Trajetória</NavLink>
          <NavLink to="/academic/settings">Configurações</NavLink>
        </nav>
        <Routes>
          <Route index element={<AcademicSummary state={state} />} />
          <Route path="curriculum" element={<AcademicCurriculum state={state} />} />
          <Route path="settings" element={<AcademicSettings state={state} />} />
          <Route path="*" element={<Navigate to="/academic" replace />} />
        </Routes>
      </div>
    );
  }

  // Um "Atualizar" que falhou, com histórico já salvo: o histórico continua lá. A pessoa tenta de novo ou volta a ele.
  if (state.status === 'FAILED' && state.summary !== null) {
    const blocked = !sigaaOpen || needsSigaa;
    return (
      <div className="web-fields">
        {state.failure ? <Notice tone="danger">{FAILURE_TEXT[state.failure]}</Notice> : null}
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        {/* Sem tela no canvas: textos meus, a confirmar. */}
        <section className="web-va-card" aria-labelledby="va-falhou">
          <h2 id="va-falhou">Não deu para atualizar</h2>
          <p className="web-muted">O histórico que você já tinha continua salvo.</p>
          <div className="web-va-actions">
            {blocked ? (
              <Button onPress={() => void navigate('/connections')}>Abrir o SIGAA</Button>
            ) : (
              <Button isPending={busy} onPress={() => void startImport()}>
                Tentar de novo
              </Button>
            )}
            <Button variant="outline" isDisabled={busy} onPress={() => void discard()}>
              Voltar ao meu histórico
            </Button>
          </div>
        </section>
      </div>
    );
  }

  // NONE ou FAILED: a pessoa ainda pode (ou precisa) importar.
  if (!state.available) {
    return (
      <EmptyState
        title="Importação indisponível"
        description="A importação está indisponível no momento. Tente mais tarde."
      />
    );
  }

  if (!sigaaOpen || needsSigaa) {
    return (
      <EmptyState
        title="Abra o SIGAA primeiro"
        description="Para ler o histórico, o SIGAA precisa estar aberto nesta sessão. Abra o SIGAA em Conexões e volte aqui."
        action={<Button onPress={() => void navigate('/connections')}>Ir para Conexões</Button>}
      />
    );
  }

  return (
    <div className="web-fields">
      {state.status === 'FAILED' && state.failure ? <Notice tone="danger">{FAILURE_TEXT[state.failure]}</Notice> : null}
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      <Invite
        consented={state.consent}
        busy={busy}
        retrying={state.status === 'FAILED'}
        onImport={() => void startImport()}
        onLater={() => void navigate('/')}
      />
    </div>
  );
}

/** Convite e consentimento: o consentimento vem antes de qualquer leitura e diz para onde vão os dados. */
function Invite({
  consented,
  busy,
  retrying,
  onImport,
  onLater,
}: {
  consented: boolean;
  busy: boolean;
  retrying: boolean;
  onImport: () => void;
  onLater: () => void;
}) {
  return (
    <section className="web-va-card web-va-consent" aria-labelledby="va-convite">
      <div className="web-fields">
        <h2 id="va-convite">{retrying ? 'Quer tentar de novo?' : 'Quer ver sua vida acadêmica aqui?'}</h2>
        <p className="web-muted">
          Lemos o seu histórico escolar do SIGAA e mostramos o que você já cursou e o que falta no curso.
        </p>
        <div className="web-va-actions">
          <Button isPending={busy} onPress={onImport}>
            {retrying ? 'Tentar de novo' : 'Importar'}
          </Button>
          <Button variant="outline" isDisabled={busy} onPress={onLater}>
            Agora não
          </Button>
        </div>
      </div>
      <ul aria-label={consented ? 'O que você já aceitou' : 'O que acontece com seus dados'}>
        <li>
          Para ler o histórico, enviamos <b>as disciplinas e as notas</b> a um provedor de IA (Anthropic).{' '}
          <b>Não enviamos</b> nenhum destes dados:
          <ul className="web-va-never">
            {['Nome', 'Matrícula', 'CPF', 'Nascimento', 'Nomes de professores'].map((item) => (
              <li key={item}>
                <Chip tone="neutral">{item}</Chip>
              </li>
            ))}
          </ul>
        </li>
        <li>Os apps que você autorizar aqui (por exemplo, o Claude) poderão ver a sua vida acadêmica.</li>
        <li>Você pode apagar tudo quando quiser.</li>
      </ul>
    </section>
  );
}

/** A API não informa a etapa (só `RUNNING`): barra sem valor, sem fingir progresso. */
function Running() {
  return (
    <section className="web-va-card web-va-running" aria-labelledby="va-importando" aria-live="polite">
      <h2 id="va-importando">Importando</h2>
      <p className="web-muted">Pode sair desta tela e voltar. A importação continua.</p>
      <progress aria-label="Importando o histórico" />
      <p className="web-muted">Leva de alguns segundos a cerca de um minuto.</p>
    </section>
  );
}

/** "Confira o que lemos": só grava depois do clique; com números que não fecharam, o clique é obrigatório e explícito. */
function Confirm({
  draft,
  hasPrevious,
  onChanged,
  onRetry,
  busy,
  problem,
}: {
  draft: NonNullable<AcademicState['draft']>;
  /** Já havia uma importação salva (`summary` vem sempre que há histórico): cancelar volta a ela, sem apagá-la. */
  hasPrevious: boolean;
  onChanged: () => Promise<unknown>;
  onRetry: () => Promise<void>;
  busy: boolean;
  problem: string | null;
}) {
  const [working, setWorking] = useState<'confirm' | 'cancel' | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const { verified, warnings, reader } = draft.verification;
  const locked = working !== null || busy;

  const confirm = async () => {
    setWorking('confirm');
    setFailed(null);
    try {
      await confirmAcademicImport();
      notify.success('Histórico salvo.');
      await onChanged();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'import_not_found') {
        setFailed('Essa leitura venceu. Importe de novo.');
        await onChanged();
      } else {
        setFailed(cause instanceof ApiError ? cause.message : 'Não deu para salvar agora. Tente de novo.');
      }
    } finally {
      setWorking(null);
    }
  };

  const cancel = async () => {
    setWorking('cancel');
    setFailed(null);
    try {
      // Descarta só o rascunho: com histórico anterior volta a ele; sem histórico, volta ao convite.
      await discardAcademicDraft();
      notify.info(hasPrevious ? 'Voltei ao seu histórico.' : 'Descartei o que foi lido.');
      await onChanged();
    } catch (cause) {
      if (cause instanceof ApiError && (cause.code === 'import_not_found' || cause.code === 'import_in_progress')) {
        // Já não há rascunho (venceu) ou voltou a ler: só relê o estado.
        await onChanged();
      } else {
        setFailed(cause instanceof ApiError ? cause.message : 'Não deu para descartar agora. Tente de novo.');
      }
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="web-fields">
      <PageHeader
        title="Confira o que lemos"
        description="Só salvamos depois que você confirmar."
        aside={reader === 'ai' ? <Chip tone="neutral">Lido com apoio de IA</Chip> : undefined}
      />
      {!verified ? (
        <Notice tone="warning">
          <b>Os números não fecharam.</b> Confira com atenção antes de salvar.
          <ul className="web-va-warnings">
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <AcademicDraftView draft={draft} />

      {failed ? <Notice tone="danger">{failed}</Notice> : null}
      {problem ? <Notice tone="danger">{problem}</Notice> : null}

      {!verified ? (
        <label className="web-va-check">
          <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
          Conferi e quero salvar assim
        </label>
      ) : null}
      <div className="web-va-actions">
        <Button
          isPending={working === 'confirm'}
          isDisabled={locked || (!verified && !acknowledged)}
          onPress={() => void confirm()}
        >
          Confirmar
        </Button>
        <Button variant="outline" isDisabled={locked} onPress={() => void onRetry()}>
          Tentar de novo
        </Button>
        <Button
          variant="danger-text"
          isPending={working === 'cancel'}
          isDisabled={locked}
          onPress={() => void cancel()}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}
