import type { CalendarItem, MyCalendar } from './myCalendar';

/**
 * DADOS FIXOS do calendário do Painel (exemplo, nenhuma pessoa real) no formato de `GET /me/calendar` (api#61): novembro de
 * 2026 com a grade completa (01/11 a 05/12), aulas de segunda a sexta (Anatomia seg e qua, Histologia ter e qui; a API
 * ainda não manda aulas, mas o formato as prevê), feriados (Finados, Consciência Negra) SEM aulas e
 * sessões da clínica (SIASB). Sem entregas nem provas: o Painel não as mostra. Serve aos testes e aos e2e.
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

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Entregas e provas, como a API ainda as manda até tirá-las da rota. O Painel NÃO as mostra (decisão do André): existem
 * aqui só para os testes provarem que o web as ignora.
 */
export function legacyDeliveryItems(date: string): CalendarItem[] {
  return [
    { id: `exam:${date}`, kind: 'exam', source: 'moodle', title: 'Prova 2', courseName: 'Histologia', courseCode: null, startsAt: at(date, '08:00'), endsAt: null, place: 'Moodle' },
    { id: `dl:${date}`, kind: 'deadline', source: 'classroom', title: 'Relatório de prática', courseName: 'Bioquímica', courseCode: null, startsAt: null, endsAt: at(date, '23:59'), place: null },
  ];
}

export function myCalendarFixture(overrides: Partial<MyCalendar> = {}): MyCalendar {
  // As sessões da clínica (SIASB), só para quem tem acesso; as aulas e os feriados vêm do laço abaixo.
  const extra: Record<string, CalendarItem[]> = {
    '2026-11-12': [session('2026-11-12', '14:00', '15:00')],
    '2026-11-24': [session('2026-11-24', '09:00', '10:00')],
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
      { source: 'moodle', status: 'ok' },
      { source: 'classroom', status: 'ok' },
      { source: 'siasb', status: 'ok' },
    ],
    ...overrides,
  };
}
