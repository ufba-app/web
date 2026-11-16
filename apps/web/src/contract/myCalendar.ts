import { z } from 'zod/mini';

/**
 * O calendário do Painel (GET /me/calendar?from=AAAA-MM-DD&to=AAAA-MM-DD; api#61): tudo o que a pessoa tem em cada dia,
 * JÁ compilado pela API, para o web só desenhar. Spec: dev/ufba/handoffs/painel-calendario-rota.md.
 *
 * Como a API entrega hoje (o formato abaixo já prevê o que ainda não sai, sem mudar nada quando sair):
 *  - `class` (aula) e a fonte `sigaa` ainda NÃO saem: entram depois.
 *  - entrega (`deadline`): `startsAt` nulo e `endsAt` = o prazo. Prova (`exam`): `startsAt` = o horário e `endsAt` nulo.
 *  - sessão da clínica (`session`, fonte `siasb`): só para quem tem o SIASB conectado, só as marcadas, com título fixo
 *    ("Sessão na clínica") e sem dado de paciente.
 *  - `courseCode` vem sempre `null` por enquanto.
 *  - intervalo máximo de 62 dias (fora disso, 400); o Moodle só informa os próximos eventos (meses passados ou distantes
 *    ficam sem entregas dele).
 *
 * DECISÃO DO ANDRÉ: o Painel mostra só feriados e dias sem aula, aulas e sessões da clínica. `deadline` e `exam` (entregas e
 * provas do Moodle e do Classroom) a API vai tirar da rota; até lá o web as IGNORA (ver `components/panel/model.ts`).
 *
 * Datas em AAAA-MM-DD e horas em ISO, todas em America/Bahia. Os textos vêm como TEXTO.
 */

export const calendarSourceSchema = z.enum(['sigaa', 'moodle', 'classroom', 'siasb']);
export type CalendarSource = z.infer<typeof calendarSourceSchema>;

export const calendarItemSchema = z.object({
  id: z.string(),
  /** A API classifica: o web não adivinha prova ou entrega pelo texto do tipo. `session` = sessão da clínica (SIASB). */
  kind: z.enum(['class', 'deadline', 'exam', 'session']),
  source: calendarSourceSchema,
  title: z.string(),
  courseName: z.nullable(z.string()),
  courseCode: z.nullable(z.string()),
  /** Aula, prova e sessão têm início; entrega não. */
  startsAt: z.nullable(z.string()),
  /** Fim da aula ou da sessão, ou o PRAZO da entrega; a prova não tem. */
  endsAt: z.nullable(z.string()),
  /** Sala ou ambiente ("Sala 304", "Moodle"). */
  place: z.nullable(z.string()),
});
export type CalendarItem = z.infer<typeof calendarItemSchema>;

export const myCalendarSchema = z.object({
  from: z.string(),
  to: z.string(),
  /** Semestre vigente que cobre o intervalo; `null` sem calendário acadêmico publicado. */
  term: z.nullable(z.string()),
  /** Só os dias que têm algo (item ou feriado). */
  days: z.array(
    z.object({
      date: z.string(),
      /** Feriado ou dia sem aula, já resolvido pela API. Nesses dias não há aulas (`class`). */
      nonTeaching: z.nullable(z.object({ name: z.string() })),
      items: z.array(calendarItemSchema),
    }),
  ),
  /** Cada fonte que alimentou o calendário e como foi. Uma que falhou não derruba o resto. */
  sources: z.array(z.object({ source: calendarSourceSchema, status: z.enum(['ok', 'failed', 'reconnect_required']) })),
});
export type MyCalendar = z.infer<typeof myCalendarSchema>;
