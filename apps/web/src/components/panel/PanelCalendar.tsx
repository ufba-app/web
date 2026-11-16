import { SourceIcon } from './SourceIcon';
import { useMemo } from 'react';
import { CalendarIcon, DeadlineIcon, ExamIcon, FlagIcon } from '../icons';
import {
  countLabel,
  dayOfMonth,
  dayTitle,
  groupByDay,
  monthGrid,
  monthOf,
  monthTitle,
  SOURCE_NAME,
  weekOf,
  WEEKDAYS,
  yearOf,
  type EventKind,
  type Mode,
  type PanelEvent,
} from './model';
import './panel.css';

const KIND_LABEL: Record<EventKind, string> = { holiday: 'Sem aula', class: 'Aula', session: 'Clínica', exam: 'Prova', deadline: 'Prazo' };

/** Quantos cartões cabem numa célula do mês (o resto vira "+N"). No celular só aparecem os pontos. */
const CHIPS_PER_DAY = 2;

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={direction === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  );
}

/** O que a pessoa ouve ao focar um dia: o dia e o que há nele (a cor nunca fala sozinha). */
function dayLabel(iso: string, events: PanelEvent[]): string {
  const base = `${dayOfMonth(iso)} de ${monthTitle(iso).toLowerCase()}`;
  return events.length === 0 ? `${base}, sem nada` : `${base}: ${events.map((event) => `${KIND_LABEL[event.kind]}, ${event.title}`).join('; ')}`;
}

const isWeekend = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay() % 6 === 0;

function SourceMark({ event }: { event: PanelEvent }) {
  return (
    <span className={`pn-ev__fonte pn-ev__fonte--${event.kind}`} title={event.source ? SOURCE_NAME[event.source] : 'Calendário acadêmico'}>
      {event.kind === 'exam' ? <ExamIcon /> : event.kind === 'deadline' ? <DeadlineIcon /> : event.source ? <SourceIcon source={event.source} size={24} /> : <FlagIcon />}
    </span>
  );
}

function DayDetail({ iso, events, loading }: { iso: string; events: PanelEvent[]; loading: boolean }) {
  return (
    <section className="pn-dd" aria-label={dayTitle(iso)}>
      <div className="pn-dd__topo">
        <h2>{dayTitle(iso)}</h2>
        {loading ? null : <span className="web-muted pn-dd__n">{countLabel(events.length)}</span>}
      </div>
      {events.map((event) => (
        <div key={event.id} className="pn-ev">
          <SourceMark event={event} />
          <div>
            <b>{event.title}</b>
            {event.detail ? <small>{event.detail}</small> : null}
          </div>
          <span className={`pn-selo pn-selo--${event.kind}`}>{KIND_LABEL[event.kind]}</span>
        </div>
      ))}
      {loading ? <div className="pn-ev__sk web-sk web-sk--card skeleton skeleton--shimmer web-sk-onwhite" aria-hidden="true" /> : null}
      {!loading && events.length === 0 ? (
        <div className="pn-livre">
          <CalendarIcon /> Nada marcado para esse dia.
        </div>
      ) : null}
    </section>
  );
}

type Props = {
  today: string;
  selected: string;
  mode: Mode;
  events: PanelEvent[];
  /** Os dados do intervalo ainda estão chegando (o dia mostra um esqueleto). */
  loading: boolean;
  onSelect: (iso: string) => void;
  onMode: (mode: Mode) => void;
  onNavigate: (direction: -1 | 1) => void;
  onToday: () => void;
};

/**
 * O calendário do Painel: mês ou semana, o dia escolhido embaixo (desenho: canvas, seção 13). É controlado: quem o usa
 * guarda o dia e o modo (para pedir à API o intervalo visível) e entrega os eventos já compilados.
 */
export function PanelCalendar({ today, selected, mode, events, loading, onSelect, onMode, onNavigate, onToday }: Props) {
  const byDay = useMemo(() => groupByDay(events), [events]);
  const dayEvents = (iso: string) => byDay.get(iso) ?? [];
  const days = mode === 'month' ? monthGrid(selected) : weekOf(selected);
  const thisMonth = monthOf(selected);
  // A legenda só cita Aula e Sessão na clínica quando há alguma: nada de explicar uma cor que não aparece.
  const kinds = useMemo(() => new Set(events.map((event) => event.kind)), [events]);

  return (
    <div className="pn-col">
      <section className="pn-cal" aria-label="Calendário">
        <div className="pn-cal__topo">
          <h2>
            {monthTitle(selected)}
            <small>{yearOf(selected)}</small>
          </h2>
          <div className="pn-modo" role="group" aria-label="Visualização">
            <button type="button" aria-pressed={mode === 'month'} onClick={() => onMode('month')}>
              Mês
            </button>
            <button type="button" aria-pressed={mode === 'week'} onClick={() => onMode('week')}>
              Semana
            </button>
          </div>
          <button type="button" className="pn-nav" aria-label={mode === 'month' ? 'Mês anterior' : 'Semana anterior'} onClick={() => onNavigate(-1)}>
            <Chevron direction="left" />
          </button>
          <button type="button" className="pn-hoje" onClick={onToday}>
            Hoje
          </button>
          <button type="button" className="pn-nav" aria-label={mode === 'month' ? 'Próximo mês' : 'Próxima semana'} onClick={() => onNavigate(1)}>
            <Chevron direction="right" />
          </button>
        </div>

        {mode === 'month' ? (
          <div className="pn-grade">
            <div className="pn-sem" aria-hidden="true">
              {WEEKDAYS.map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
            <div className="pn-dias">
              {days.map((iso) => {
                const list = dayEvents(iso);
                const className = [
                  'pn-dia',
                  isWeekend(iso) ? 'pn-dia--fim' : '',
                  monthOf(iso) !== thisMonth ? 'pn-dia--fora' : '',
                  iso === today ? 'pn-dia--hoje' : '',
                  iso === selected ? 'pn-dia--sel' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    key={iso}
                    type="button"
                    className={className}
                    aria-pressed={iso === selected}
                    aria-current={iso === today ? 'date' : undefined}
                    aria-label={dayLabel(iso, list)}
                    onClick={() => onSelect(iso)}
                  >
                    <span className="pn-n">{dayOfMonth(iso)}</span>
                    {list.slice(0, CHIPS_PER_DAY).map((event) => (
                      <span key={event.id} className={`pn-ch pn-ch--${event.kind}`}>
                        <i />
                        <span>{event.title}</span>
                      </span>
                    ))}
                    {list.length > CHIPS_PER_DAY ? <span className="pn-mais">+{list.length - CHIPS_PER_DAY}</span> : null}
                    <span className="pn-pts" aria-hidden="true">
                      {list.slice(0, 3).map((event) => (
                        <i key={event.id} className={`pn-pt--${event.kind}`} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="pn-semana">
            {days.map((iso) => {
              const list = dayEvents(iso);
              const className = ['pn-sd', isWeekend(iso) ? 'pn-sd--fim' : '', iso === today ? 'pn-sd--hoje' : '', iso === selected ? 'pn-sd--sel' : '']
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  key={iso}
                  type="button"
                  className={className}
                  aria-pressed={iso === selected}
                  aria-current={iso === today ? 'date' : undefined}
                  aria-label={dayLabel(iso, list)}
                  onClick={() => onSelect(iso)}
                >
                  <span className="pn-sd__cab">
                    <span>{WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()]}</span>
                    <span className="pn-n">{dayOfMonth(iso)}</span>
                  </span>
                  {list.length === 0 ? <span className="pn-sd__livre">Livre</span> : null}
                  {list.map((event) => (
                    <span key={event.id} className={`pn-se pn-se--${event.kind}`}>
                      <span className="pn-se__fonte" aria-hidden="true">
                        {event.source ? <SourceIcon source={event.source} size={13} /> : null}
                      </span>
                      <span>
                        <b>{event.title}</b>
                        {event.detail ? <small>{event.detail}</small> : null}
                      </span>
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        )}

        <div className="pn-legenda">
          {kinds.has('exam') ? (
            <span>
              <i className="p" /> Prova
            </span>
          ) : null}
          {kinds.has('deadline') ? (
            <span>
              <i className="e" /> Prazo
            </span>
          ) : null}
          {kinds.has('class') ? (
            <span>
              <i className="a" /> Aula
            </span>
          ) : null}
          <span>
            <i className="f" /> Feriado ou sem aula
          </span>
          {kinds.has('session') ? (
            <span>
              <i className="s" /> Sessão na clínica
            </span>
          ) : null}
        </div>
      </section>

      <DayDetail iso={selected} events={dayEvents(selected)} loading={loading} />
    </div>
  );
}
