import type { MyCalendar } from '../../contract';

/**
 * Painel: o que o calendário pinta. Tudo aqui é função pura sobre datas ISO (`AAAA-MM-DD`), sem React e sem fuso do
 * computador: "hoje" e o dia de um item são sempre em America/Bahia (o fuso da UFBA), senão um prazo às 23:59
 * apareceria no dia seguinte para quem está em outro fuso. Quem COMPILA o calendário (aulas, prazos, feriados, a
 * exclusão das aulas nos feriados) é a API; aqui só se desenha o que ela entrega.
 */
export const PANEL_TIME_ZONE = 'America/Bahia';

/**
 * O que o calendário do Painel mostra (decisão do André): `holiday` = feriado ou dia sem aula (calendário acadêmico da
 * UFBA); `class` = aula (recorrência do SIGAA, nunca em dia sem aula); `session` = sessão da clínica marcada no SIASB (só
 * para quem tem acesso a ele); `exam` = prova e `deadline` = prazo (entrega de trabalho, questionário etc.), ambos do SIGAA. NADA de prazos e provas
 * do Moodle e do Classroom.
 */
export type EventKind = 'holiday' | 'class' | 'session' | 'exam' | 'deadline';
export type EventSource = 'sigaa' | 'moodle' | 'classroom' | 'siasb';

/** O nome da fonte para o leitor de tela e o rótulo (o `web-ui` não conhece o SIASB). */
export const SOURCE_NAME: Record<EventSource, string> = { sigaa: 'SIGAA', moodle: 'Moodle', classroom: 'Classroom', siasb: 'SIASB' };

export type PanelEvent = {
  id: string;
  /** Dia (ISO) em que aparece. */
  date: string;
  kind: EventKind;
  title: string;
  /** Linha de apoio ("08:00–10:00 · Sala 304"). */
  detail: string | null;
  /** De onde vem; feriado e dia sem aula não têm fonte. */
  source: EventSource | null;
  /** Para ordenar dentro do dia (horário de início). */
  at: string;
};

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: PANEL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: PANEL_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** O dia (ISO) de um instante, em America/Bahia. */
export function isoDay(instant: Date): string {
  return dayFormat.format(instant);
}

/** Hora e minuto ("23:59") de um instante, em America/Bahia. */
export function clock(instant: Date): string {
  return timeFormat.format(instant);
}

const parts = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return { year, month, day };
};

const toUtc = (iso: string) => {
  const { year, month, day } = parts(iso);
  return Date.UTC(year, month - 1, day);
};

const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (iso: string, days: number): string => fromUtc(toUtc(iso) + days * 86_400_000);

/** 0 = domingo … 6 = sábado. */
export const weekday = (iso: string): number => new Date(toUtc(iso)).getUTCDay();

export const monthOf = (iso: string): string => iso.slice(0, 7);

/** Primeiro dia do mês seguinte/anterior ao de `iso`. */
export function shiftMonth(iso: string, delta: number): string {
  const { year, month } = parts(iso);
  const index = year * 12 + (month - 1) + delta;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}-01`;
}

/**
 * Os dias da grade do mês: de domingo (na ou antes do dia 1) a sábado (na ou depois do último dia). 5 ou 6 semanas.
 * Os dias de fora do mês entram, apagados, para a grade fechar.
 */
export function monthGrid(iso: string): string[] {
  const first = `${monthOf(iso)}-01`;
  const last = addDays(shiftMonth(first, 1), -1);
  const start = addDays(first, -weekday(first));
  const end = addDays(last, 6 - weekday(last));
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

/** Os 7 dias (domingo a sábado) da semana de `iso`. */
export function weekOf(iso: string): string[] {
  const start = addDays(iso, -weekday(iso));
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export type Mode = 'month' | 'week';

/** O intervalo visível (primeiro e último dia), que é o que se pede à API. */
export function visibleRange(selected: string, mode: Mode): { from: string; to: string } {
  const days = mode === 'month' ? monthGrid(selected) : weekOf(selected);
  return { from: days[0]!, to: days[days.length - 1]! };
}

/** Anterior ou próximo: um mês (cai em "hoje" se ele estiver lá, senão no dia 1) ou uma semana. */
export function navigate(selected: string, mode: Mode, direction: -1 | 1, today: string): string {
  if (mode === 'week') return addDays(selected, direction * 7);
  const target = shiftMonth(selected, direction);
  return monthOf(target) === monthOf(today) ? today : target;
}

const long = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const monthName = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'long' });

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "Terça, 17 de novembro" (sem o "-feira" que o Intl acrescenta, como no desenho). */
export function dayTitle(iso: string): string {
  return capitalize(long.format(new Date(toUtc(iso)))).replace('-feira', '');
}

/** "Novembro". */
export const monthTitle = (iso: string): string => capitalize(monthName.format(new Date(toUtc(iso))));

export const yearOf = (iso: string): number => parts(iso).year;
export const dayOfMonth = (iso: string): number => parts(iso).day;

/** Abreviação do dia da semana para o cabeçalho. */
export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

// --- Eventos ---------------------------------------------------------------------------------------------------------

const timeSpan = (startsAt: string | null, endsAt: string | null): string | null => {
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  if (start && !Number.isNaN(start.getTime()) && end && !Number.isNaN(end.getTime())) return `${clock(start)}–${clock(end)}`;
  // Só o início (uma sessão sem fim): "Às 08:00".
  if (start && !Number.isNaN(start.getTime())) return `Às ${clock(start)}`;
  return null;
};

/**
 * Do calendário já compilado pela API para o que a tela desenha. A API manda o tipo e a exclusão das aulas nos feriados;
 * aqui só viram eventos, com o dia que a API já resolveu (`days[].date`). Item sem horário nenhum não quebra: aparece sem
 * a linha de apoio.
 *
 * O Painel mostra feriado, aula, sessão da clínica e, do SIGAA, prova e prazo. Os tipos são os da API (`exam`, `deadline`).
 * Prova e prazo aparecem também em dia de feriado.
 */
const validDate = (iso: string | null): Date | null => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** A linha de apoio de cada tipo. Prova sem hora chega como 00:00 ("sem hora marcada"); prazo mostra o limite (`endsAt`). */
function detailOf(item: MyCalendar['days'][number]['items'][number]): string | null {
  // "SIGAA" em `place` só repete a fonte (que a tela já mostra): não vira texto.
  const place = item.place && item.place !== SOURCE_NAME.sigaa ? item.place : null;
  if (item.kind === 'exam') {
    const start = validDate(item.startsAt);
    const when = start ? (clock(start) === '00:00' ? 'Sem hora marcada' : `Às ${clock(start)}`) : null;
    return [when, place].filter(Boolean).join(' · ') || null;
  }
  if (item.kind === 'deadline') {
    const end = validDate(item.endsAt);
    return [end ? `Até ${clock(end)}` : null, place].filter(Boolean).join(' · ') || null;
  }
  return [timeSpan(item.startsAt, item.endsAt), place].filter(Boolean).join(' · ') || null;
}

export function eventsFromCalendar(calendar: MyCalendar | null | undefined): PanelEvent[] {
  if (!calendar) return [];
  return calendar.days.flatMap((day) => {
    const events: PanelEvent[] = [];
    if (day.nonTeaching) {
      events.push({ id: `holiday:${day.date}`, date: day.date, kind: 'holiday', title: day.nonTeaching.name, detail: null, source: null, at: '' });
    }
    for (const item of day.items) {
      events.push({
        id: item.id,
        date: day.date,
        kind: item.kind,
        title: item.title,
        detail: detailOf(item),
        source: item.source,
        at: (item.kind === 'deadline' ? item.endsAt : item.startsAt) ?? '',
      });
    }
    return events;
  });
}

const ORDER: Record<EventKind, number> = { exam: 0, deadline: 1, holiday: 2, session: 3, class: 4 };

/** Agrupa por dia; dentro do dia: provas, prazos, o feriado (que explica o dia), as sessões da clínica e as aulas, cada tipo por horário. */
export function groupByDay(events: PanelEvent[]): Map<string, PanelEvent[]> {
  const byDay = new Map<string, PanelEvent[]>();
  for (const event of events) byDay.set(event.date, [...(byDay.get(event.date) ?? []), event]);
  for (const list of byDay.values()) {
    list.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.at.localeCompare(b.at) || a.title.localeCompare(b.title, 'pt-BR'));
  }
  return byDay;
}

/** "Livre", "1 coisa" ou "2 coisas" (o cabeçalho do dia escolhido). */
export function countLabel(count: number): string {
  return count === 0 ? 'Livre' : count === 1 ? '1 coisa' : `${count} coisas`;
}
