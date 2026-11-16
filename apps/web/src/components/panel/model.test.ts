import { myCalendarSchema } from '../../contract';
import { myCalendarFixture } from '../../contract/panelFixture';
import {
  addDays,
  clock,
  countLabel,
  dayTitle,
  eventsFromCalendar,
  groupByDay,
  isoDay,
  monthGrid,
  monthTitle,
  navigate,
  shiftMonth,
  visibleRange,
  weekOf,
} from './model';

describe('datas', () => {
  it('o dia de um instante é em America/Bahia, não no fuso do computador (23:59 de Salvador não vira o dia seguinte)', () => {
    expect(isoDay(new Date('2026-11-18T02:59:00Z'))).toBe('2026-11-17'); // 23:59 em Salvador
    expect(isoDay(new Date('2026-11-18T03:00:00Z'))).toBe('2026-11-18'); // 00:00 em Salvador
    expect(clock(new Date('2026-11-18T02:59:00Z'))).toBe('23:59');
  });

  it('addDays e shiftMonth atravessam mês e ano', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftMonth('2026-12-15', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-01-15', -1)).toBe('2025-12-01');
  });

  it('a grade do mês vai de domingo a sábado, com os dias de fora para fechar as semanas', () => {
    const grid = monthGrid('2026-11-17');
    expect(grid[0]).toBe('2026-11-01'); // 1º de novembro de 2026 é domingo
    expect(grid[grid.length - 1]).toBe('2026-12-05'); // 30/11 é segunda: completa até o sábado
    expect(grid).toHaveLength(35);
    expect(grid.length % 7).toBe(0);
    // Mês que começa no meio da semana: começa no domingo anterior.
    expect(monthGrid('2026-12-10')[0]).toBe('2026-11-29');
  });

  it('a semana é de domingo a sábado', () => {
    expect(weekOf('2026-11-18')).toEqual(['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']);
  });

  it('o intervalo visível é o que se pede à API (mês com os dias de fora, ou a semana)', () => {
    expect(visibleRange('2026-11-17', 'month')).toEqual({ from: '2026-11-01', to: '2026-12-05' });
    expect(visibleRange('2026-11-17', 'week')).toEqual({ from: '2026-11-15', to: '2026-11-21' });
  });

  it('navegar: o mês seguinte cai no dia 1, ou em hoje se hoje estiver nele; a semana anda 7 dias', () => {
    expect(navigate('2026-11-17', 'month', 1, '2026-11-15')).toBe('2026-12-01');
    expect(navigate('2026-12-01', 'month', -1, '2026-11-15')).toBe('2026-11-15');
    expect(navigate('2026-11-17', 'week', 1, '2026-11-15')).toBe('2026-11-24');
    expect(navigate('2026-11-17', 'week', -1, '2026-11-15')).toBe('2026-11-10');
  });

  it('textos em pt-BR: "Terça, 17 de novembro" (sem "-feira") e "Novembro"', () => {
    expect(dayTitle('2026-11-17')).toBe('Terça, 17 de novembro');
    expect(dayTitle('2026-11-15')).toBe('Domingo, 15 de novembro');
    expect(monthTitle('2026-11-17')).toBe('Novembro');
    expect(countLabel(0)).toBe('Livre');
    expect(countLabel(1)).toBe('1 coisa');
    expect(countLabel(2)).toBe('2 coisas');
  });
});

describe('eventsFromCalendar', () => {
  const events = eventsFromCalendar(myCalendarFixture());
  const onDay = (date: string) => groupByDay(events).get(date) ?? [];

  it('sem calendário (rota ausente ou erro) não há eventos', () => {
    expect(eventsFromCalendar(null)).toEqual([]);
    expect(eventsFromCalendar(undefined)).toEqual([]);
  });

  it('feriado vira evento "holiday" com o nome da API, e NÃO há aula nesse dia (a regra é da API, a tela respeita)', () => {
    const finados = onDay('2026-11-02'); // segunda-feira, que teria Anatomia
    expect(finados.map((event) => event.kind)).toEqual(['holiday']);
    expect(finados[0]!.title).toBe('Finados');
    expect(onDay('2026-11-20').map((event) => event.kind)).toEqual(['holiday']);
  });

  it('aula: título, horário e sala; fonte SIGAA', () => {
    const [aula] = onDay('2026-11-03'); // terça: Histologia
    expect(aula).toMatchObject({ kind: 'class', title: 'Histologia', detail: '10:00–12:00 · Lab. 2', source: 'sigaa' });
  });

  it('o Painel só mostra feriado, aula e sessão: o contrato recusa entrega e prova (e Moodle e Classroom)', () => {
    expect(events.every((event) => ['holiday', 'class', 'session'].includes(event.kind))).toBe(true);
    const item = { id: 'x', title: 'T', courseName: null, courseCode: null, startsAt: null, endsAt: null, place: null };
    const calendarWith = (extra: Record<string, unknown>) => ({
      from: '2026-11-01',
      to: '2026-11-30',
      term: null,
      days: [{ date: '2026-11-17', nonTeaching: null, items: [{ ...item, kind: 'class', source: 'sigaa', ...extra }] }],
      sources: [],
    });
    expect(myCalendarSchema.safeParse(calendarWith({})).success).toBe(true);
    // O enum estreitou (api#64): a tela nunca vê entrega nem prova; se a API as mandar de novo, o contrato acusa.
    expect(myCalendarSchema.safeParse(calendarWith({ kind: 'deadline' })).success).toBe(false);
    expect(myCalendarSchema.safeParse(calendarWith({ kind: 'exam', source: 'moodle' })).success).toBe(false);
    expect(myCalendarSchema.safeParse(calendarWith({ source: 'classroom' })).success).toBe(false);
  });

  it('sessão da clínica (SIASB): título fixo da API, horário e a fonte SIASB; sem nome de paciente (a API não manda)', () => {
    const [sessao] = onDay('2026-11-12').filter((event) => event.kind === 'session');
    expect(sessao).toMatchObject({ title: 'Sessão na clínica', detail: '14:00–15:00', source: 'siasb' });
  });

  it('sessão só com o início: "Às 14:00"', () => {
    const calendar = myCalendarFixture({
      days: [
        {
          date: '2026-11-12',
          nonTeaching: null,
          items: [{ id: 's', kind: 'session', source: 'siasb', title: 'Sessão na clínica', courseName: null, courseCode: null, startsAt: '2026-11-12T14:00:00-03:00', endsAt: null, place: null }],
        },
      ],
    });
    expect(eventsFromCalendar(calendar)[0]).toMatchObject({ kind: 'session', detail: 'Às 14:00' });
  });

  it('dentro do dia: o feriado primeiro, depois as sessões da clínica e por fim as aulas', () => {
    expect(onDay('2026-11-12').map((event) => event.kind)).toEqual(['session', 'class']);
    const mixed = groupByDay(
      eventsFromCalendar(
        myCalendarFixture({
          days: [
            {
              date: '2026-11-12',
              nonTeaching: { name: 'Recesso' },
              items: myCalendarFixture().days.find((d) => d.date === '2026-11-12')!.items,
            },
          ],
        }),
      ),
    ).get('2026-11-12')!;
    expect(mixed.map((event) => event.kind)).toEqual(['holiday', 'session', 'class']);
  });

  it('aulas só em dia letivo: nada no domingo nem em sábado sem aula na fixture', () => {
    expect(onDay('2026-11-01')).toEqual([]);
    expect(onDay('2026-11-07')).toEqual([]);
  });

  it('item sem horário nem sala não quebra: aparece sem linha de apoio', () => {
    const calendar = myCalendarFixture({
      days: [
        {
          date: '2026-11-10',
          nonTeaching: null,
          items: [{ id: 'x', kind: 'class', source: 'sigaa', title: 'Sem horário', courseName: null, courseCode: null, startsAt: null, endsAt: null, place: null }],
        },
      ],
    });
    expect(eventsFromCalendar(calendar)[0]).toMatchObject({ title: 'Sem horário', detail: null });
  });

  it('data inválida num horário não quebra', () => {
    const calendar = myCalendarFixture({
      days: [
        {
          date: '2026-11-10',
          nonTeaching: null,
          items: [{ id: 'y', kind: 'class', source: 'sigaa', title: 'T', courseName: null, courseCode: null, startsAt: 'lixo', endsAt: 'lixo', place: null }],
        },
      ],
    });
    expect(eventsFromCalendar(calendar)[0]).toMatchObject({ kind: 'class', detail: null });
  });
});
