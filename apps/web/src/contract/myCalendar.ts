import { z } from 'zod/mini';

/**
 * O calendário do Painel (GET /me/calendar?from=AAAA-MM-DD&to=AAAA-MM-DD; api#61 e #64): tudo o que a pessoa tem em cada
 * dia, JÁ compilado pela API, para o web só desenhar. Spec: dev/ufba/handoffs/painel-calendario-rota.md.
 *
 * DECISÃO DO ANDRÉ: entram feriados e dias sem aula (calendário acadêmico da UFBA), AULAS (recorrência do SIGAA, nunca em
 * dia sem aula), PRAZOS e PROVAS do SIGAA e sessões da clínica (SIASB). NÃO há prazos nem provas do Moodle e do
 * Classroom: `source` é só `sigaa`|`siasb`.
 *
 * Como a API entrega:
 *  - aula (`class`): início e fim, sala em `place`.
 *  - prova (`exam`, fonte `sigaa`): `startsAt` = o horário e `endsAt` nulo. Prova sem hora vem `T00:00:00-03:00`: 00:00 é
 *    "sem hora marcada". `place` vem "SIGAA".
 *  - prazo (`deadline`, fonte `sigaa`): `endsAt` = o PRAZO e `startsAt` nulo. `place` vem "SIGAA".
 *  - prova e prazo aparecem MESMO em dia de feriado (que não mostra aulas); só de hoje em diante (meses passados sem
 *    prazos) e só de turmas com Turma Virtual.
 *  - sessão da clínica (`session`, fonte `siasb`): só para quem tem o SIASB conectado, só as marcadas, com título fixo
 *    ("Sessão na clínica") e sem dado de paciente.
 *  - `courseCode` pode vir `null`.
 *  - intervalo máximo de 62 dias (fora disso, 400).
 *
 * ATENÇÃO: `deadline` e `exam` ainda NÃO estão na produção (api feat/calendario-prazos-sigaa, c9a9e16). O schema já os
 * aceita; o teste de contrato trata o `kind` como divergência aceita até a API publicar (aí ele falha, avisando para
 * tirar a exceção).
 *
 * Datas em AAAA-MM-DD e horas em ISO, todas em America/Bahia. Os textos vêm como TEXTO.
 */

export const calendarSourceSchema = z.enum(['sigaa', 'siasb']);
export type CalendarSource = z.infer<typeof calendarSourceSchema>;

export const calendarItemSchema = z.object({
  id: z.string(),
  /** A API classifica. `class` = aula; `deadline` = prazo; `exam` = prova (as três do SIGAA); `session` = clínica (SIASB). */
  kind: z.enum(['class', 'deadline', 'exam', 'session']),
  source: calendarSourceSchema,
  title: z.string(),
  courseName: z.nullable(z.string()),
  courseCode: z.nullable(z.string()),
  /** Início da aula, da prova (00:00 = sem hora marcada) ou da sessão. Prazo não tem. */
  startsAt: z.nullable(z.string()),
  /** Fim da aula ou da sessão, ou o PRAZO. Prova não tem. */
  endsAt: z.nullable(z.string()),
  /** Sala ou local ("Lab. 2", "SIGAA"). */
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
