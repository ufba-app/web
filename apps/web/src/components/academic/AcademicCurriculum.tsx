import { useQueryClient } from '@tanstack/react-query';
import { Button, Chip, Dialog, EmptyState, Notice } from '@ufba-app/web-ui';
import { useState } from 'react';
import { Link } from 'react-router';
import { academicQueryKey, useCurriculum } from '../../api/academic';
import { ApiError } from '../../api/client';
import type { AcademicState, Curriculum, CurriculumItem, CurriculumState } from '../../contract';
import { LockIcon } from '../icons';
import { PageSkeleton } from '../Skeletons';
import './academic.css';
import { formatHours as hours, percentOf, termLabel } from './format';

const STATE_LABEL: Record<CurriculumState, string> = {
  DONE: 'Cumprido',
  DONE_VIA_EQUIVALENCE: 'Cumprido via equivalência',
  ENROLLED: 'Matriculado',
  AVAILABLE: 'Pode cursar agora',
  BLOCKED: 'Bloqueado',
};

/** Texto do estado no detalhe (o canvas usa "Falta, pode cursar agora" e "Falta, bloqueado"). */
const STATE_DETAIL: Record<CurriculumState, string> = {
  DONE: 'Cumprido',
  DONE_VIA_EQUIVALENCE: 'Cumprido via equivalência',
  ENROLLED: 'Matriculado (em andamento)',
  AVAILABLE: 'Falta, pode cursar agora',
  BLOCKED: 'Falta, bloqueado',
};

const STATE_CLASS: Record<CurriculumState, string> = {
  DONE: 'ok',
  DONE_VIA_EQUIVALENCE: 'ok',
  ENROLLED: 'now',
  AVAILABLE: 'can',
  BLOCKED: 'blocked',
};

function StateTag({ item }: { item: CurriculumItem }) {
  return (
    <span className={`web-va-st web-va-st--${STATE_CLASS[item.state]}`}>
      {item.state === 'BLOCKED' ? <LockIcon /> : null}
      {STATE_LABEL[item.state]}
    </span>
  );
}

function ComponentCard({ item, onOpen }: { item: CurriculumItem; onOpen: (item: CurriculumItem) => void }) {
  return (
    <button type="button" className={`web-va-comp web-va-comp--${STATE_CLASS[item.state]}`} onClick={() => onOpen(item)}>
      <span className="web-va-comp__top">
        <span className="web-va-code">{item.code}</span>
        <StateTag item={item} />
      </span>
      <b>{item.name}</b>
      <small>{hours(item.hours)}</small>
      {item.state === 'DONE_VIA_EQUIVALENCE' && item.via.length > 0 ? <small>Cumprido via {item.via.join(', ')}</small> : null}
      {item.state === 'BLOCKED' && item.missingPrerequisites.length > 0 ? (
        <small>Falta: {item.missingPrerequisites.join(', ')}</small>
      ) : null}
    </button>
  );
}

function groupRequired(curriculum: Curriculum): Array<[number | null, CurriculumItem[]]> {
  const groups = new Map<number | null, CurriculumItem[]>();
  for (const item of curriculum.required) groups.set(item.term, [...(groups.get(item.term) ?? []), item]);
  return [...groups.entries()].sort(([a], [b]) => (a ?? Number.MAX_SAFE_INTEGER) - (b ?? Number.MAX_SAFE_INTEGER));
}

/**
 * Detalhe de um componente. O canvas também mostra co-requisitos e a unidade responsável, mas a API não entrega esses
 * dados: ficam de fora até existirem no contrato.
 */
function ComponentDialog({ item, onClose }: { item: CurriculumItem | null; onClose: () => void }) {
  return (
    <Dialog
      isOpen={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={item ? `${item.code} · ${item.name}` : 'Componente'}
      actions={
        <Button variant="outline" onPress={onClose}>
          Fechar
        </Button>
      }
    >
      {item ? (
        <div className="web-fields">
          <p className="web-muted">
            {hours(item.hours)}
            {item.term !== null ? ` · ${termLabel(item.term)}` : ''}
          </p>
          <Chip tone={item.state === 'BLOCKED' ? 'neutral' : item.state === 'AVAILABLE' ? 'highlight' : 'success'}>
            {STATE_DETAIL[item.state]}
          </Chip>
          {item.late ? <Notice tone="warning">Este componente está atrasado em relação ao seu período.</Notice> : null}

          <h3>Pré-requisitos</h3>
          {item.prerequisiteExpr ? <p>{item.prerequisiteExpr}</p> : <p className="web-muted">Nenhum.</p>}
          {item.missingPrerequisites.length > 0 ? (
            <Notice tone="warning">Falta cumprir: {item.missingPrerequisites.join(', ')}.</Notice>
          ) : null}
          {item.prerequisiteUnverifiable ? (
            <Notice tone="info">Não deu para conferir o pré-requisito com o seu histórico.</Notice>
          ) : null}

          <h3>Equivalências</h3>
          {item.equivalenceExpr ? <p>{item.equivalenceExpr}</p> : <p className="web-muted">Nenhuma.</p>}
          {item.via.length > 0 ? <p className="web-muted">Cumprido via {item.via.join(', ')}.</p> : null}
        </div>
      ) : null}
    </Dialog>
  );
}

function Grid({ curriculum }: { curriculum: Curriculum }) {
  const [open, setOpen] = useState<CurriculumItem | null>(null);
  const electives = curriculum.hours.elective;
  const complementary = curriculum.hours.complementary;
  return (
    <>
      <ul className="web-va-legend" aria-label="Legenda">
        <li className="web-va-st web-va-st--ok">Cumprido</li>
        <li className="web-va-st web-va-st--now">Matriculado</li>
        <li className="web-va-st web-va-st--can">Pode cursar agora</li>
        <li className="web-va-st web-va-st--blocked">Bloqueado</li>
      </ul>

      <div className="web-va-grade">
        {groupRequired(curriculum).map(([term, items]) => (
          <details key={term ?? 'sem'} className="web-va-sem" open>
            <summary>
              {termLabel(term)}
              <small>{items.length === 1 ? '1 componente' : `${items.length} componentes`}</small>
            </summary>
            <div className="web-va-comps">
              {items.map((item) => (
                <ComponentCard key={item.code} item={item} onOpen={setOpen} />
              ))}
            </div>
          </details>
        ))}
      </div>

      <section className="web-va-card" aria-labelledby="va-optativas">
        <div className="web-va-card__head">
          <h2 id="va-optativas">Optativas</h2>
          <Chip tone="neutral">
            Faltam {hours(electives.remaining)} de {hours(electives.needed)}
          </Chip>
        </div>
        {curriculum.electives.length === 0 ? <p className="web-muted">Nenhuma optativa para mostrar.</p> : null}
        <div className="web-va-comps">
          {curriculum.electives.map((item) => (
            <ComponentCard key={item.code} item={item} onOpen={setOpen} />
          ))}
        </div>
      </section>

      <section className="web-va-card" aria-labelledby="va-complementares">
        <div className="web-va-card__head">
          <h2 id="va-complementares">Complementares</h2>
          <Chip tone="neutral">
            Faltam {hours(complementary.remaining)} de {hours(complementary.needed)}
          </Chip>
        </div>
        <progress
          value={percentOf(complementary.completed, complementary.needed)}
          max={100}
          aria-label="Complementares feitas"
        />
        <ul className="web-va-list">
          {curriculum.complementary.map((item) => (
            <li key={item.code}>
              <span className="web-va-name">
                <b>{item.name}</b>
                <small>
                  {hours(item.hours)} · {item.state === 'DONE' || item.state === 'DONE_VIA_EQUIVALENCE' ? 'cumprida' : STATE_LABEL[item.state].toLowerCase()}
                </small>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <ComponentDialog item={open} onClose={() => setOpen(null)} />
    </>
  );
}

/** Aba "Grade do curso": o currículo mais recente marcado com o que a pessoa já fez. Sempre estimativa. */
export function AcademicCurriculum({ state }: { state: AcademicState }) {
  const queryClient = useQueryClient();
  const ready = state.curriculumStatus === 'READY';
  const { data, error, isPending, refetch } = useCurriculum(ready);
  const retry = () => void queryClient.invalidateQueries({ queryKey: academicQueryKey });

  if (state.curriculumStatus === 'IMPORTING') {
    return (
      <div className="web-fields">
        <Notice tone="info">
          <b>Quase lá.</b> Estamos montando a grade do seu curso. Isso leva até um minuto na primeira vez.
        </Notice>
        <EmptyState
          title="Montando a grade…"
          description="O resto da área continua funcionando só com o histórico."
          action={
            <Link className="web-link" to="/academic">
              Voltar ao resumo
            </Link>
          }
        />
      </div>
    );
  }

  const unavailable =
    !ready || (error instanceof ApiError && (error.code === 'curriculum_unavailable' || error.code === 'import_not_found'));
  if (unavailable) {
    return (
      <div className="web-fields">
        <Notice tone="warning">
          <b>Grade indisponível.</b> Não conseguimos montar a grade agora. Vamos tentar de novo sozinhos.
        </Notice>
        <EmptyState
          title="A grade não está disponível"
          description="O resto da área continua funcionando só com o histórico."
          action={
            <div className="web-va-actions">
              <Button onPress={retry}>Tentar de novo</Button>
              <Link className="web-link" to="/academic">
                Voltar ao resumo
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  if (isPending) return <PageSkeleton />;
  if (error || !data) {
    return (
      <Notice tone="danger">
        {error instanceof ApiError ? error.message : 'Não deu para carregar a grade agora.'}{' '}
        <button type="button" className="web-link" onClick={() => void refetch()}>
          Tentar de novo
        </button>
      </Notice>
    );
  }
  return <Grid curriculum={data} />;
}
