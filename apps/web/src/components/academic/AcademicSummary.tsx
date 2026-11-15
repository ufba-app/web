import { Button, Chip, Notice } from '@ufba-app/web-ui';
import { Link } from 'react-router';
import { useCurriculum } from '../../api/academic';
import type { AcademicState, Curriculum, CurriculumItem } from '../../contract';
import { EyeIcon, EyeOffIcon } from '../icons';
import './academic.css';
import { formatHours as hours, formatNumber, percentOf, termLabel } from './format';
import { useHideGrades } from './useHideGrades';

type Summary = NonNullable<AcademicState['summary']>;

function Masked({ show, children }: { show: boolean; children: string }) {
  // Escondido: o valor real nem entra no HTML.
  return show ? <>{children}</> : <span aria-label="Escondido" className="web-va-masked">•••</span>;
}

function Estimate() {
  return <Chip tone="neutral">Estimativa</Chip>;
}

function HoursBar({ label, required, completed, pending }: { label: string; required: number; completed: number; pending: number }) {
  const percent = percentOf(completed, required);
  return (
    <div className="web-va-hours">
      <h3>{label}</h3>
      <progress value={percent} max={100} aria-label={`${label}: ${percent}% feito`} />
      <p>
        Feitas <b>{hours(completed)}</b> · Faltam <b>{hours(pending)}</b> · de {hours(required)}
      </p>
    </div>
  );
}

/** Obrigatórias que ainda faltam (a cursar ou bloqueadas), agrupadas por semestre do currículo. */
function missingByTerm(curriculum: Curriculum): Array<[string, CurriculumItem[]]> {
  const groups = new Map<number | null, CurriculumItem[]>();
  for (const item of curriculum.required) {
    if (item.state !== 'AVAILABLE' && item.state !== 'BLOCKED') continue;
    groups.set(item.term, [...(groups.get(item.term) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a ?? Number.MAX_SAFE_INTEGER) - (b ?? Number.MAX_SAFE_INTEGER))
    .map(([term, items]) => [termLabel(term), items]);
}

function canTakeNow(curriculum: Curriculum): CurriculumItem[] {
  return [...curriculum.required, ...curriculum.electives].filter((item) => item.state === 'AVAILABLE');
}

function WhatIsMissing({ curriculum, summary }: { curriculum: Curriculum | undefined; summary: Summary }) {
  const electivePending = curriculum?.hours.elective.remaining ?? summary.hours.elective.pending;
  const electiveNeeded = curriculum?.hours.elective.needed ?? summary.hours.elective.required;
  const complementaryPending = curriculum?.hours.complementary.remaining ?? summary.hours.complementary.pending;
  const complementaryNeeded = curriculum?.hours.complementary.needed ?? summary.hours.complementary.required;

  return (
    <section className="web-va-card" aria-labelledby="va-falta">
      <div className="web-va-card__head">
        <h2 id="va-falta">O que falta</h2>
        <Estimate />
      </div>
      {curriculum ? (
        missingByTerm(curriculum).map(([label, items]) => (
          <div key={label} role="group" aria-label={label}>
            <h3 className="web-va-term">{label}</h3>
            <ul className="web-va-list">
              {items.map((item) => (
                <li key={item.code}>
                  <span className="web-va-code">{item.code}</span>
                  <span className="web-va-name">
                    <b>{item.name}</b>
                    <small>{hours(item.hours)}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))
      ) : (
        <Notice tone="warning">
          <b>O que falta depende da grade do curso.</b> Vai aparecer aqui quando a grade ficar pronta.
        </Notice>
      )}
      <h3 className="web-va-term">Horas</h3>
      <ul className="web-va-list">
        {electivePending > 0 ? (
          <li>
            <span className="web-va-name">
              <b>{hours(electivePending)} de optativas</b>
              <small>Faltam para fechar as {hours(electiveNeeded)}</small>
            </span>
          </li>
        ) : null}
        {complementaryPending > 0 ? (
          <li>
            <span className="web-va-name">
              <b>{hours(complementaryPending)} de complementares</b>
              <small>Faltam para fechar as {hours(complementaryNeeded)}</small>
            </span>
          </li>
        ) : null}
        {electivePending <= 0 && complementaryPending <= 0 ? (
          <li>
            <span className="web-va-name">
              <small>Nenhuma hora de optativa ou complementar pendente.</small>
            </span>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function CanTakeNow({ curriculum }: { curriculum: Curriculum | undefined }) {
  return (
    <section className="web-va-card" aria-labelledby="va-agora">
      <h2 id="va-agora">O que posso cursar agora</h2>
      {curriculum ? (
        <>
          <p className="web-muted">Falta e já tem os pré-requisitos atendidos.</p>
          {canTakeNow(curriculum).length === 0 ? <p className="web-muted">Nada disponível agora.</p> : null}
          <ul className="web-va-list">
            {canTakeNow(curriculum).map((item) => (
              <li key={item.code}>
                <span className="web-va-code">{item.code}</span>
                <span className="web-va-name">
                  <b>{item.name}</b>
                  <small>
                    {hours(item.hours)}
                    {item.prerequisiteExpr ? ` · pré-requisitos: ${item.prerequisiteExpr}` : ''}
                    {item.nature === 'ELECTIVE' ? ' · optativa' : ''}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="web-muted">Disponível quando a grade do curso estiver pronta.</p>
      )}
    </section>
  );
}

/** Aba "Resumo": curso, índices, horas, o que falta e o que dá para cursar agora. */
export function AcademicSummary({ state }: { state: AcademicState }) {
  const [hideGrades, toggleGrades] = useHideGrades();
  const curriculumReady = state.curriculumStatus === 'READY';
  const { data: curriculum } = useCurriculum(curriculumReady);
  const summary = state.summary;

  if (!summary) return <Notice tone="warning">Não encontramos o resumo da sua vida acadêmica. Importe de novo.</Notice>;

  // Sem a grade, a porcentagem sai das horas do próprio histórico (também estimativa).
  const percent = curriculum?.percentComplete ?? percentOf(summary.hours.total.completed, summary.hours.total.required);
  const gradeAction = (
    <Button variant="outline" onPress={toggleGrades} aria-pressed={hideGrades}>
      {hideGrades ? <EyeIcon /> : <EyeOffIcon />}
      {hideGrades ? 'Mostrar notas' : 'Esconder notas'}
    </Button>
  );

  return (
    <div className="web-va-draft">
      {state.curriculumStatus !== 'READY' ? (
        <Notice tone="warning">
          <b>Grade ainda indisponível.</b>{' '}
          {state.curriculumStatus === 'IMPORTING'
            ? 'Estamos montando a grade do seu curso. Enquanto isso, a área mostra só o histórico.'
            : 'Não conseguimos montar a grade do seu curso agora. Enquanto isso, a área mostra só o histórico.'}
        </Notice>
      ) : null}

      <section className="web-va-course" aria-labelledby="va-curso">
        <p className="web-va-course__kicker">Seu curso</p>
        <h2 id="va-curso">{summary.programName}</h2>
        <div className="web-va-course__line">
          <span>
            Período atual: <b>{summary.currentTerm}º</b>
          </span>
          <span>
            Prazo padrão: <b>{summary.completionDeadline.standard}</b>
          </span>
          <span>
            Prazo máximo: <b>{summary.completionDeadline.maximum}</b>
          </span>
        </div>
        <div className="web-va-course__pct">
          <b>{percent}%</b>
          <span>integralizado</span>
          {/* Sobre o fundo azul o selo do design system some (herda a cor clara): este usa a cor do texto. */}
          <span className="web-va-estim">Estimativa</span>
        </div>
        <progress value={percent} max={100} aria-label={`${percent}% do curso integralizado`} />
      </section>

      <div className="web-va-actions">{gradeAction}</div>

      <div className="web-va-stats">
        <div>
          <small>CR</small>
          <b>
            <Masked show={!hideGrades}>{formatNumber(summary.indices.cr, 1)}</Masked>
          </b>
          <span>Coeficiente de rendimento</span>
        </div>
        <div>
          <small>IAP</small>
          <b>
            <Masked show={!hideGrades}>{formatNumber(summary.indices.iap)}</Masked>
          </b>
          <span>Índice de aproveitamento</span>
        </div>
        <div>
          <small>Horas feitas</small>
          <b>{hours(summary.hours.total.completed)}</b>
          <span>de {hours(summary.hours.total.required)}</span>
        </div>
        <div>
          <small>Faltam</small>
          <b>{hours(summary.hours.total.pending)}</b>
          <span>obrigatórias, optativas e complementares</span>
        </div>
      </div>

      <div className="web-va-hours-grid">
        <h2 className="ufba-visually-hidden">Horas por natureza</h2>
        <HoursBar label="Obrigatórias" {...summary.hours.mandatory} />
        <HoursBar label="Optativas" {...summary.hours.elective} />
        <HoursBar label="Complementares" {...summary.hours.complementary} />
      </div>

      <div className="web-va-two">
        <WhatIsMissing curriculum={curriculum} summary={summary} />
        <CanTakeNow curriculum={curriculum} />
      </div>

      <Notice tone="info">
        <b>Sobre a estimativa.</b> O histórico é a fonte oficial do que você fez. O que falta é um cálculo nosso com o
        currículo mais novo, usando equivalências, então pode divergir do SIGAA.
      </Notice>
      <div className="web-va-actions">
        <Link className="web-link" to="/academic/curriculum">
          Ver a grade do curso
        </Link>
        <Link className="web-link" to="/academic/settings">
          Atualizar ou apagar
        </Link>
      </div>
    </div>
  );
}
