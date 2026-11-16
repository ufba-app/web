import type { CalendarItem, MyCalendar } from './myCalendar';

/**
 * DADOS FIXOS do calendário do Painel (exemplo, nenhuma pessoa real) no formato de `GET /me/calendar` (api#61): novembro de
 * 2026 com a grade completa (01/11 a 05/12), aulas de segunda a sexta (Anatomia seg e qua, Histologia ter e qui; a API
 * ainda não manda aulas, mas o formato as prevê), feriados (Finados, Consciência Negra) SEM aulas,
 * sessões da clínica (SIASB) e, do SIGAA, provas e prazos (`exam`/`deadline`, formato do handoff do Alicerce: prova com
 * `startsAt` e sem `endsAt`; prazo com `endsAt` = o prazo e sem `startsAt`; `place` "SIGAA"; prova e prazo valem
 * também no feriado). Serve aos testes e aos e2e.
 */
const HOLIDAYS: Record<string, string> = { '2026-11-02': 'Finados', '2026-11-20': 'Consciência Negra' };

/** Instante em America/Bahia (UTC-3, sem horário de verão). */
const at = (date: string, time: string) => `${date}T${time}:00-03:00`;

const klass = (date: string, title: string, code: string, start: string, end: string, place: string): CalendarItem => ({
  id: `class:${code}:${date}`,
  kind: 'class',
  source: 'sigaa',
  title,
  courseName: title,
  courseCode: code,
  startsAt: at(date, start),
  endsAt: at(date, end),
  place,
});

/** Sessão da clínica (SIASB): título fixo e sem dado de paciente, como a API entrega. */
const session = (date: string, start: string, end: string): CalendarItem => ({
  id: `session:${date}`,
  kind: 'session',
  source: 'siasb',
  title: 'Sessão na clínica',
  courseName: null,
  courseCode: null,
  startsAt: at(date, start),
  endsAt: at(date, end),
  place: null,
});

/** Prova do SIGAA: `startsAt` (00:00 = sem hora marcada), sem `endsAt`. */
const exam = (date: string, title: string, code: string, time: string): CalendarItem => ({
  id: `exam:${code}:${date}`,
  kind: 'exam',
  source: 'sigaa',
  title,
  courseName: null,
  courseCode: code,
  startsAt: at(date, time),
  endsAt: null,
  place: 'SIGAA',
});

/** Prazo do SIGAA: `endsAt` é o prazo, sem `startsAt`. */
const deadline = (date: string, title: string, code: string, time: string): CalendarItem => ({
  id: `deadline:${code}:${date}`,
  kind: 'deadline',
  source: 'sigaa',
  title,
  courseName: null,
  courseCode: code,
  startsAt: null,
  endsAt: at(date, time),
  place: 'SIGAA',
});

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function myCalendarFixture(overrides: Partial<MyCalendar> = {}): MyCalendar {
  // As sessões da clínica (SIASB), só para quem tem acesso; as aulas e os feriados vêm do laço abaixo.
  const extra: Record<string, CalendarItem[]> = {
    '2026-11-12': [session('2026-11-12', '14:00', '15:00')],
    '2026-11-24': [session('2026-11-24', '09:00', '10:00')],
    // Do SIGAA (só de hoje, 16/11, em diante): prova com hora, prova sem hora, prazos, e um prazo no feriado.
    '2026-11-18': [exam('2026-11-18', 'Prova 1 de Anatomia', 'ODO101', '14:00')],
    '2026-11-19': [deadline('2026-11-19', 'Relatório de Histologia', 'ODO103', '23:59')],
    '2026-11-20': [deadline('2026-11-20', 'Lista de exercícios de Anatomia', 'ODO101', '23:59')],
    '2026-11-25': [exam('2026-11-25', 'Prova 2 de Histologia', 'ODO103', '00:00')],
  };
  const days: MyCalendar['days'] = [];
  for (let date = '2026-11-01'; date <= '2026-12-05'; date = addDays(date, 1)) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const holiday = HOLIDAYS[date];
    const items: CalendarItem[] = [];
    // Aulas só em dia letivo e nunca em feriado (a regra que a API aplica).
    if (!holiday && weekday >= 1 && weekday <= 5) {
      if (weekday === 1 || weekday === 3) items.push(klass(date, 'Anatomia', 'ODO101', '08:00', '10:00', 'Sala 304'));
      if (weekday === 2 || weekday === 4) items.push(klass(date, 'Histologia', 'ODO103', '10:00', '12:00', 'Lab. 2'));
    }
    items.push(...(extra[date] ?? []));
    if (holiday || items.length > 0) days.push({ date, nonTeaching: holiday ? { name: holiday } : null, items });
  }
  return {
    from: '2026-11-01',
    to: '2026-12-05',
    term: '2026.2',
    days,
    sources: [
      { source: 'sigaa', status: 'ok' },
      { source: 'siasb', status: 'ok' },
    ],
    ...overrides,
  };
}
