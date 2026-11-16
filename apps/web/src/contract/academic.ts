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
  /**
   * Matrícula do portal do SIGAA, gravada na confirmação do histórico. `null` antes disso, se o portal não a trouxe ou
   * depois de apagar. Só a própria pessoa a vê (nunca vai ao provedor de IA); aparece no perfil do menu do celular.
   */
  registration: z.nullable(z.string()),
  summary: z.nullable(
    z.object({
      programName: z.string(),
      /**
       * O nome do curso em partes (a API separa unidade, campus, grau, modalidade e turno). OPCIONAL aqui e sem tela: não é
       * do mapa, só declarado porque a API o envia (o teste de contrato exige declarar). Quem fizer a tela o torna
       * obrigatório e atualiza os mocks.
       */
      programLabel: z.optional(
        z.object({
          raw: z.string(),
          name: z.string(),
          unit: z.nullable(z.string()),
          campus: z.nullable(z.string()),
          degree: z.nullable(z.string()),
          modality: z.nullable(z.string()),
          shift: z.nullable(z.string()),
          format: z.enum(['full', 'partial', 'raw']),
        }),
      ),
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
  /** Co-requisitos e unidade responsável: aparecem no detalhe do componente. */
  corequisiteExpr: z.nullable(z.string()),
  equivalenceExpr: z.nullable(z.string()),
  responsibleUnit: z.nullable(z.string()),
  late: z.boolean(),
  /**
   * Mapa da Trajetória (api#51). `lastAttempt`: a tentativa que vale (a última aprovada, se houve; senão a última).
   * `null` = nunca cursou o código. `status` é TEXTO livre (sigla do SIGAA: APR, REP, REPF, REPMF, TRANC…): só mostre.
   * `toRedo`: a última tentativa foi reprovação ou trancamento e o componente não está cumprido nem em curso. O `state`
   * segue `AVAILABLE` ou `BLOCKED`; a tela mostra "a refazer".
   */
  lastAttempt: z.nullable(z.object({ term: z.nullable(z.string()), grade: z.nullable(z.number()), status: z.string() })),
  toRedo: z.boolean(),
});
export type CurriculumItem = z.infer<typeof curriculumItemSchema>;

/**
 * Ligação entre dois componentes do currículo: `from` é pré-requisito de `to`. `REQUIRED` = exigida em toda forma de
 * cumprir a expressão; `ALTERNATIVE` = faz parte de um OU. Só liga componentes do currículo.
 */
export const prerequisiteEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  kind: z.enum(['REQUIRED', 'ALTERNATIVE']),
});
export type PrerequisiteEdge = z.infer<typeof prerequisiteEdgeSchema>;

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
  /**
   * As ligações do mapa da Trajetória. Lista vazia = o SIGAA não trouxe pré-requisitos legíveis: o mapa mostra os cartões
   * sem linhas e diz que as ligações não estão disponíveis.
   */
  prerequisiteEdges: z.array(prerequisiteEdgeSchema),
  divergences: z.object({
    obsoletePending: z.array(z.string()),
    substitutedPending: z.array(z.object({ code: z.string(), substitutedBy: z.string() })),
    satisfiedByAdequation: z.array(z.string()),
    newInCurriculum: z.array(z.string()),
  }),
});
export type Curriculum = z.infer<typeof curriculumSchema>;
