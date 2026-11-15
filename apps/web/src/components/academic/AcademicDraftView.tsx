import { Chip } from '@ufba-app/web-ui';
import type { AcademicDraft } from '../../contract';
import './academic.css';

/** Número em pt-BR (vírgula decimal). `null` (o documento não trouxe) vira travessão. */
function formatNumber(value: number | null, digits = 2): string {
  if (value === null) return '—';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

const hours = (value: number) => `${value.toLocaleString('pt-BR')}h`;

/** `status` é texto livre do documento: só o tom do selo olha para ele; o texto mostrado é o que veio. */
function statusTone(status: string): 'success' | 'danger' | 'neutral' {
  const text = status.toLowerCase();
  if (/reprov/.test(text)) return 'danger';
  if (/aprov|cumpr|dispens|aproveit/.test(text)) return 'success';
  return 'neutral';
}

function HoursBar({ label, value }: { label: string; value: AcademicDraft['hours']['mandatory'] }) {
  const percent = value.required > 0 ? Math.min(100, Math.round((value.completed / value.required) * 100)) : 0;
  return (
    <div className="web-va-hours">
      <h3>{label}</h3>
      <progress value={percent} max={100} aria-label={`${label}: ${percent}% feito`} />
      <p>
        Feitas <b>{hours(value.completed)}</b> · Faltam <b>{hours(value.pending)}</b> · de {hours(value.required)}
      </p>
    </div>
  );
}

/** Agrupa mantendo a ordem em que o documento traz os semestres. */
function groupByTerm(components: AcademicDraft['components']) {
  const groups = new Map<string, AcademicDraft['components']>();
  for (const component of components) {
    const key = component.term.trim();
    groups.set(key, [...(groups.get(key) ?? []), component]);
  }
  return [...groups.entries()];
}

/**
 * "Confira o que lemos": o rascunho lido do histórico, só leitura. Não há edição linha a linha: se algo está errado, a
 * pessoa tenta de novo ou cancela. Nada aqui é identidade (nome, matrícula, CPF, professores não existem no contrato).
 */
export function AcademicDraftView({ draft }: { draft: AcademicDraft }) {
  const groups = groupByTerm(draft.components);
  return (
    <div className="web-va-draft">
      <div className="web-va-stats">
        <div>
          <small>Curso</small>
          <b>{draft.program.name}</b>
          <span>Período atual: {draft.program.currentTerm}º</span>
        </div>
        <div>
          <small>CR</small>
          <b>{formatNumber(draft.indices.cr, 1)}</b>
          <span>do documento</span>
        </div>
        <div>
          <small>IAP</small>
          <b>{formatNumber(draft.indices.iap)}</b>
          <span>do documento</span>
        </div>
        <div>
          <small>Horas feitas</small>
          <b>{hours(draft.hours.total.completed)}</b>
          <span>de {hours(draft.hours.total.required)}</span>
        </div>
      </div>

      <div className="web-va-hours-grid">
        {/* Cada barra usa <h3>; este título mantém a ordem dos níveis (h1, h2, h3) para leitor de tela. */}
        <h2 className="ufba-visually-hidden">Horas por natureza</h2>
        <HoursBar label="Obrigatórias" value={draft.hours.mandatory} />
        <HoursBar label="Optativas" value={draft.hours.elective} />
        <HoursBar label="Complementares" value={draft.hours.complementary} />
      </div>

      <section className="web-va-card" aria-labelledby="va-historico">
        <h2 id="va-historico">Seu histórico</h2>
        {groups.length === 0 ? <p className="web-muted">O documento não trouxe nenhuma disciplina.</p> : null}
        {groups.map(([term, items]) => (
          <div key={term || 'sem-semestre'} role="group" aria-label={term || 'Sem semestre'}>
            <h3 className="web-va-term">{term || 'Sem semestre'}</h3>
            <ul className="web-va-list">
              {items.map((item, index) => (
                <li key={`${item.code}-${index}`}>
                  <span className="web-va-code">{item.code}</span>
                  <span className="web-va-name">
                    <b>{item.name}</b>
                    <small>{hours(item.hours)}</small>
                  </span>
                  <span className="web-va-grade">{item.grade === null ? '--' : formatNumber(item.grade, 1)}</span>
                  <Chip tone={statusTone(item.status)}>{item.status}</Chip>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {draft.pendingMandatory.items.length > 0 || draft.pendingMandatory.declaredTotal > 0 ? (
        <section className="web-va-card" aria-labelledby="va-pendencias">
          <h2 id="va-pendencias">Pendências do documento</h2>
          <p className="web-muted">Obrigatórias que o histórico diz que faltam: {hours(draft.pendingMandatory.declaredTotal)}.</p>
          <ul className="web-va-list">
            {draft.pendingMandatory.items.map((item, index) => (
              <li key={`${item.code}-${index}`}>
                <span className="web-va-code">{item.code}</span>
                <span className="web-va-name">
                  <b>{item.name}</b>
                  <small>{hours(item.hours)}</small>
                </span>
                {item.enrolled ? <Chip tone="highlight">Matriculado</Chip> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {draft.notes.length > 0 || draft.equivalences.length > 0 ? (
        <section className="web-va-card" aria-labelledby="va-notas">
          <h2 id="va-notas">Observações do documento</h2>
          <ul className="web-va-notes">
            {[...draft.notes, ...draft.equivalences].map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
