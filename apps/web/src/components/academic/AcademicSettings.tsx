import { useQueryClient } from '@tanstack/react-query';
import { Button, Chip, Dialog, Notice, UFBA_TIME_ZONE } from '@ufba-app/web-ui';
import { useState } from 'react';
import { Link } from 'react-router';
import { academicQueryKey, deleteAcademic, setAcademicConsent, startAcademicImport } from '../../api/academic';
import { ApiError } from '../../api/client';
import type { AcademicState } from '../../contract';
import { notify } from '../../lib/notify';
import './academic.css';

type Action = 'update' | 'revoke' | 'grant' | 'delete';

function importedAt(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: UFBA_TIME_ZONE });
}

/** Erros do POST /me/academic/import que a tela explica em vez de mostrar a mensagem crua. */
function updateErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'too_many_attempts') return 'Você já tentou 3 vezes hoje. Tente amanhã.';
    if (error.code === 'import_unavailable') return 'A importação está indisponível no momento. Tente mais tarde.';
    if (error.code === 'source_not_connected') return 'Abra o SIGAA em Conexões para atualizar o histórico.';
    return error.message;
  }
  return 'Não deu para atualizar agora. Tente de novo.';
}

/** Aba "Configurações": quando foi importado, atualizar, revogar o consentimento e apagar tudo. */
export function AcademicSettings({ state }: { state: AcademicState }) {
  const queryClient = useQueryClient();
  const [working, setWorking] = useState<Action | null>(null);
  const [confirming, setConfirming] = useState<'revoke' | 'delete' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: academicQueryKey });

  const run = async (action: Action, work: () => Promise<void>, onDone?: () => void) => {
    setWorking(action);
    setProblem(null);
    try {
      await work();
      await refresh();
      onDone?.();
    } catch (cause) {
      setProblem(action === 'update' ? updateErrorText(cause) : cause instanceof ApiError ? cause.message : 'Não deu para concluir agora. Tente de novo.');
    } finally {
      setWorking(null);
    }
  };

  const closeDialog = () => {
    if (working === null) setConfirming(null);
  };

  return (
    <div className="web-va-draft">
      {problem ? <Notice tone="danger">{problem}</Notice> : null}

      <section className="web-va-card" aria-labelledby="va-importacao">
        <h2 id="va-importacao">Sua importação</h2>
        <dl className="web-va-conf">
          <div>
            <dt>Importado em</dt>
            <dd>
              <b>{importedAt(state.importedAt)}</b>
            </dd>
          </div>
          <div>
            <dt>Como foi lido</dt>
            <dd>
              <Chip tone="neutral">{state.reader === 'ai' ? 'Lido com apoio de IA' : 'Lido sem apoio de IA'}</Chip>
            </dd>
          </div>
          <div>
            <dt>Números conferidos</dt>
            <dd>
              {state.verified === null ? '—' : <Chip tone={state.verified ? 'success' : 'warning'}>{state.verified ? 'Verificado' : 'Não verificado'}</Chip>}
            </dd>
          </div>
        </dl>
      </section>

      <section className="web-va-card" aria-labelledby="va-atualizar">
        <h2 id="va-atualizar">Atualizar histórico</h2>
        <p className="web-muted">
          Refaz a leitura com o histórico mais novo do SIGAA. Você pode tentar até 3 vezes por dia.
        </p>
        {!state.consent ? <p className="web-muted">Autorize de novo o consentimento para atualizar.</p> : null}
        <div className="web-va-actions">
          <Button
            variant="outline"
            isPending={working === 'update'}
            isDisabled={!state.consent || working !== null}
            onPress={() => void run('update', startAcademicImport)}
          >
            Atualizar histórico
          </Button>
        </div>
        {problem && /Conexões/.test(problem) ? (
          <Link className="web-link" to="/connections">
            Ir para Conexões
          </Link>
        ) : null}
      </section>

      <section className="web-va-card" aria-labelledby="va-consentimento">
        <h2 id="va-consentimento">Consentimento</h2>
        {state.consent ? (
          <>
            <p className="web-muted">
              Você autorizou o envio das disciplinas e das notas a um provedor de IA (Anthropic) e que os apps
              autorizados vejam a sua vida acadêmica.
            </p>
            <div className="web-va-actions">
              <Button variant="danger-text" isDisabled={working !== null} onPress={() => setConfirming('revoke')}>
                Revogar consentimento
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Sem tela no canvas: texto meu, a confirmar. */}
            <p className="web-muted">
              Você revogou o consentimento. Não enviamos nada à IA e os apps autorizados não veem a sua vida acadêmica.
              O que já foi importado continua salvo até você apagar.
            </p>
            <div className="web-va-actions">
              <Button
                variant="outline"
                isPending={working === 'grant'}
                isDisabled={working !== null}
                onPress={() => void run('grant', () => setAcademicConsent(true))}
              >
                Autorizar de novo
              </Button>
            </div>
          </>
        )}
      </section>

      <section className="web-va-card web-va-danger" aria-labelledby="va-apagar">
        <h2 id="va-apagar">Apagar minha vida acadêmica</h2>
        <p className="web-muted">
          Apaga o histórico e o perfil importados. Não dá para desfazer, mas você pode importar de novo.
        </p>
        <div className="web-va-actions">
          <Button variant="danger" isDisabled={working !== null} onPress={() => setConfirming('delete')}>
            Apagar minha vida acadêmica
          </Button>
        </div>
      </section>

      <Dialog
        isOpen={confirming === 'revoke'}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        title="Revogar o consentimento?"
        actions={
          <>
            <Button
              variant="danger"
              isPending={working === 'revoke'}
              onPress={() =>
                void run('revoke', () => setAcademicConsent(false), () => {
                  setConfirming(null);
                  notify.info('Consentimento revogado.');
                })
              }
            >
              Revogar consentimento
            </Button>
            <Button variant="outline" isDisabled={working === 'revoke'} onPress={closeDialog}>
              Cancelar
            </Button>
          </>
        }
      >
        <p className="web-muted">
          Deixamos de enviar dados à IA e os apps autorizados deixam de ver a sua vida acadêmica. O que já foi
          importado continua salvo até você apagar.
        </p>
      </Dialog>

      <Dialog
        isOpen={confirming === 'delete'}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        title="Apagar a vida acadêmica?"
        actions={
          <>
            <Button
              variant="danger"
              isPending={working === 'delete'}
              onPress={() =>
                void run('delete', deleteAcademic, () => {
                  setConfirming(null);
                  notify.info('Apaguei a sua vida acadêmica.');
                })
              }
            >
              Apagar tudo
            </Button>
            <Button variant="outline" isDisabled={working === 'delete'} onPress={closeDialog}>
              Cancelar
            </Button>
          </>
        }
      >
        <p className="web-muted">
          Apagamos o histórico e o perfil que importamos de você. Os apps autorizados deixam de ver essa parte. Não dá
          para desfazer.
        </p>
      </Dialog>
    </div>
  );
}
