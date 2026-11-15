import { z } from 'zod/mini';

/**
 * Vida acadêmica: importação do histórico (WEB-API.md, seção 5.1). Só o que a importação usa: `GET /me/academic` e o
 * rascunho a confirmar. A grade do curso (`GET /me/academic/curriculum`) ainda não tem tela.
 *
 * `status` e `kind` de cada componente são TEXTO livre (a UFBA pode imprimir uma sigla que não conhecemos): nunca
 * decida lógica por eles, só mostre.
 */

const hoursSchema = z.object({ required: z.number(), completed: z.number(), pending: z.number() });
const allHoursSchema = z.object({
  mandatory: hoursSchema,
  elective: hoursSchema,
  complementary: hoursSchema,
  total: hoursSchema,
});
const indicesSchema = z.object({ cr: z.nullable(z.number()), iap: z.nullable(z.number()) });
const deadlineSchema = z.object({ standard: z.string(), maximum: z.string() });

/** Falha durante a importação: vem como `status=FAILED` + código (nunca mensagem). */
export const academicFailureSchema = z.enum([
  'REDACTION_REFUSED',
  'READER_FAILED',
  'SIGAA_UNAVAILABLE',
  'PDF_INVALID',
  'SESSION_EXPIRED',
  'TIMEOUT',
]);
export type AcademicFailure = z.infer<typeof academicFailureSchema>;

export const academicDraftSchema = z.object({
  contractVersion: z.literal('1'),
  document: z.object({ issuedOn: z.string() }),
  program: z.object({
    name: z.string(),
    curriculum: z.string(),
    currentTerm: z.number(),
    completionDeadline: deadlineSchema,
  }),
  indices: indicesSchema,
  components: z.array(
    z.object({
      term: z.string(),
      kind: z.nullable(z.string()),
      code: z.string(),
      name: z.string(),
      hours: z.number(),
      grade: z.nullable(z.number()),
      status: z.string(),
    }),
  ),
  hours: allHoursSchema,
  pendingMandatory: z.object({
    declaredTotal: z.number(),
    items: z.array(z.object({ code: z.string(), name: z.string(), hours: z.number(), enrolled: z.boolean() })),
  }),
  equivalences: z.array(z.string()),
  notes: z.array(z.string()),
  verification: z.object({ verified: z.boolean(), warnings: z.array(z.string()), reader: z.enum(['ai', 'parser']) }),
});
export type AcademicDraft = z.infer<typeof academicDraftSchema>;

export const academicStateSchema = z.object({
  available: z.boolean(),
  consent: z.boolean(),
  status: z.enum(['NONE', 'RUNNING', 'NEEDS_CONFIRMATION', 'READY', 'FAILED']),
  failure: z.nullable(academicFailureSchema),
  verified: z.nullable(z.boolean()),
  reader: z.nullable(z.string()),
  importedAt: z.nullable(z.string()),
  curriculumStatus: z.enum(['NONE', 'READY', 'IMPORTING', 'UNAVAILABLE']),
  summary: z.nullable(
    z.object({
      programName: z.string(),
      curriculum: z.string(),
      currentTerm: z.number(),
      completionDeadline: deadlineSchema,
      indices: indicesSchema,
      hours: allHoursSchema,
    }),
  ),
  draft: z.nullable(academicDraftSchema),
});
export type AcademicState = z.infer<typeof academicStateSchema>;

/** Estado de um componente na grade do curso (GET /me/academic/curriculum). */
export const curriculumStateSchema = z.enum(['DONE', 'DONE_VIA_EQUIVALENCE', 'ENROLLED', 'AVAILABLE', 'BLOCKED']);
export type CurriculumState = z.infer<typeof curriculumStateSchema>;

const curriculumItemSchema = z.object({
  code: z.string(),
  name: z.string(),
  hours: z.number(),
  nature: z.enum(['REQUIRED', 'ELECTIVE', 'COMPLEMENTARY']),
  term: z.nullable(z.number()),
  state: curriculumStateSchema,
  via: z.array(z.string()),
  missingPrerequisites: z.array(z.string()),
  prerequisiteUnverifiable: z.boolean(),
  prerequisiteExpr: z.nullable(z.string()),
  equivalenceExpr: z.nullable(z.string()),
  late: z.boolean(),
});
export type CurriculumItem = z.infer<typeof curriculumItemSchema>;

const curriculumHoursSchema = z.object({
  needed: z.number(),
  completed: z.number(),
  remaining: z.number(),
  source: z.enum(['document', 'estimate']),
});

/** A grade do curso marcada com o que a pessoa já fez. Sempre estimativa (`estimate: true`). */
export const curriculumSchema = z.object({
  curriculumCode: z.string(),
  sameCurriculum: z.nullable(z.boolean()),
  estimate: z.literal(true),
  required: z.array(curriculumItemSchema),
  electives: z.array(curriculumItemSchema),
  complementary: z.array(curriculumItemSchema),
  hours: z.object({
    required: curriculumHoursSchema,
    elective: curriculumHoursSchema,
    complementary: curriculumHoursSchema,
    total: curriculumHoursSchema,
  }),
  percentComplete: z.nullable(z.number()),
  requiredHoursToTake: z.number(),
  currentTerm: z.nullable(z.number()),
  terms: z.object({ min: z.number(), avg: z.number(), max: z.number() }),
  divergences: z.object({
    obsoletePending: z.array(z.string()),
    substitutedPending: z.array(z.object({ code: z.string(), substitutedBy: z.string() })),
    satisfiedByAdequation: z.array(z.string()),
    newInCurriculum: z.array(z.string()),
  }),
});
export type Curriculum = z.infer<typeof curriculumSchema>;
