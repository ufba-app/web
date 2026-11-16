import type { Curriculum, CurriculumItem, PrerequisiteEdge } from './academic';

/**
 * DADOS FIXOS do mapa da Trajetória (exemplo, nenhum aluno real): ~40 componentes em 7 semestres, no formato do contrato
 * novo da API (`prerequisiteEdges`, `lastAttempt`, `toRedo`; api feat/curriculo-grafo-cache, 20f2167). Os códigos são de
 * um currículo de engenharia, mas os nomes e as ligações são de exemplo. Serve aos testes e aos e2e, e ao
 * desenvolvimento enquanto a API não publica os campos.
 *
 * Cenário: 3 semestres cumpridos (viram o bloco "1º–3º sem"), o 4º com uma disciplina trancada (a refazer), o 5º em
 * curso ("agora") e o resto livre ou bloqueado.
 */
type Mark = 'D' | 'C' | 'F' | 'B' | 'R';

type Row = [code: string, name: string, term: number, hours: number, mark: Mark];

const ROWS: Row[] = [
  ['FISD36', 'Física Geral Teórica I', 1, 60, 'D'],
  ['FISD42', 'Física Geral Experimental I', 1, 30, 'D'],
  ['MATA01', 'Geometria Analítica', 1, 60, 'D'],
  ['MATA02', 'Cálculo A', 1, 90, 'D'],
  ['QUI029', 'Química Geral', 1, 60, 'D'],
  ['MATA37', 'Introdução à Lógica de Programação', 1, 60, 'D'],
  ['ENGC26', 'Sistemas Lógicos', 2, 30, 'D'],
  ['ENGG51', 'Introdução à Engenharia de Computação', 2, 30, 'D'],
  ['FISD34', 'Física Geral Teórica II', 2, 60, 'D'],
  ['FISD41', 'Física Geral Experimental II', 2, 30, 'D'],
  ['MATA03', 'Cálculo B', 2, 90, 'D'],
  ['MATA07', 'Álgebra Linear A', 2, 60, 'D'],
  ['MATA97', 'Matemática Discreta', 2, 60, 'D'],
  ['MATA04', 'Cálculo C', 3, 90, 'D'],
  ['FISD37', 'Física Geral Teórica III', 3, 60, 'D'],
  ['FISD40', 'Física Geral Experimental III', 3, 30, 'D'],
  ['ENGC40', 'Linguagem de Programação', 3, 60, 'D'],
  ['MATA55', 'Programação Orientada a Objetos', 3, 60, 'D'],
  ['ENGG52', 'Comunicação e Expressão', 3, 30, 'D'],
  ['MAT236', 'Métodos Estatísticos', 3, 60, 'D'],
  ['ENGC50', 'Estruturas de Dados', 4, 60, 'D'],
  ['ENGC32', 'Circuitos Elétricos I', 4, 60, 'D'],
  ['ENGC24', 'Probabilidade e Processos', 4, 60, 'R'],
  ['MATA40', 'Estruturas de Dados e Algoritmos II', 4, 60, 'D'],
  ['ENGG53', 'Metodologia Científica', 4, 30, 'D'],
  ['MATA62', 'Engenharia de Software I', 4, 60, 'D'],
  ['ENGG58', 'Ética Profissional', 4, 30, 'D'],
  ['ENGG56', 'Redes de Computadores I', 5, 60, 'C'],
  ['ENGC25', 'Eletrônica Analógica I', 5, 60, 'C'],
  ['ENGC41', 'Eletrônica Digital', 5, 60, 'C'],
  ['MATA49', 'Banco de Dados', 5, 60, 'C'],
  ['ENGC33', 'Sinais e Sistemas', 5, 60, 'B'],
  ['MAT174', 'Cálculo Numérico', 5, 60, 'F'],
  ['MATA52', 'Compiladores', 6, 60, 'F'],
  ['MATA58', 'Sistemas Operacionais', 6, 60, 'B'],
  ['ENGC63', 'Processamento de Sinais', 6, 60, 'B'],
  ['ENGG54', 'Gestão de Projetos', 6, 30, 'F'],
  ['MATA59', 'Sistemas Distribuídos', 7, 60, 'B'],
  ['ENGG64', 'Inteligência Artificial', 7, 60, 'F'],
];

const EDGES: PrerequisiteEdge[] = [
  ['MATA02', 'MATA03'],
  ['MATA03', 'MATA04'],
  ['MATA01', 'MATA07'],
  ['FISD36', 'FISD34'],
  ['MATA02', 'FISD34'],
  ['FISD34', 'FISD37'],
  ['FISD42', 'FISD41'],
  ['FISD41', 'FISD40'],
  ['ENGC26', 'ENGC40'],
  ['ENGC40', 'ENGC50'],
  ['MATA37', 'ENGC50'],
  ['ENGC40', 'ENGG56'],
  ['ENGC50', 'ENGG56'],
  ['MATA37', 'MATA55'],
  ['MATA55', 'MATA40'],
  ['MATA40', 'MATA52'],
  ['FISD37', 'ENGC32'],
  ['ENGC32', 'ENGC25'],
  ['ENGC32', 'ENGC41'],
  ['MATA03', 'ENGC24'],
  ['ENGC24', 'ENGC33'],
  ['ENGC33', 'ENGC63'],
  ['MATA04', 'ENGC63'],
  ['MATA03', 'MAT174'],
  ['MATA37', 'MAT174'],
  ['ENGC50', 'MATA49'],
  ['MATA49', 'MATA58'],
  ['MATA40', 'MATA58'],
  ['MATA58', 'MATA59'],
  ['ENGG51', 'ENGG52'],
  ['ENGG52', 'ENGG53'],
  ['ENGG53', 'ENGG54'],
  ['MATA07', 'ENGG64'],
  ['MATA40', 'ENGG64'],
  ['MATA55', 'MATA62'],
  ['MATA55', 'ENGG58'],
].map(([from, to]) => ({ from: from!, to: to!, kind: 'REQUIRED' as const }));

// Um OU: Compiladores aceita Matemática Discreta no lugar de Estruturas II (exemplo).
EDGES.push({ from: 'MATA97', to: 'MATA52', kind: 'ALTERNATIVE' });

function item(row: Row, extra: Partial<CurriculumItem> = {}): CurriculumItem {
  const [code, name, term, hours, mark] = row;
  const done = mark === 'D';
  return {
    code,
    name,
    hours,
    nature: 'REQUIRED',
    term,
    state: done ? 'DONE' : mark === 'C' ? 'ENROLLED' : mark === 'B' ? 'BLOCKED' : 'AVAILABLE',
    via: [],
    missingPrerequisites: [],
    prerequisiteUnverifiable: false,
    prerequisiteExpr: null,
    corequisiteExpr: null,
    equivalenceExpr: null,
    responsibleUnit: 'Escola Politécnica',
    late: false,
    lastAttempt: done
      ? { term: `202${Math.floor((term - 1) / 2) + 2}.${term % 2 === 1 ? 1 : 2}`, grade: 7 + (code.charCodeAt(code.length - 1) % 4), status: 'APR' }
      : mark === 'C'
        ? { term: '2026.2', grade: null, status: 'MATR' }
        : mark === 'R'
          ? { term: '2025.1', grade: null, status: 'TRANC' }
          : null,
    toRedo: mark === 'R',
    ...extra,
  };
}

/** O currículo de exemplo, no formato do contrato novo. Cada chamada devolve um objeto novo (os testes podem mexer). */
export function trajectoryCurriculumFixture(overrides: Partial<Curriculum> = {}): Curriculum {
  const required = ROWS.map((row) => {
    const [code] = row;
    const incoming = EDGES.filter((edge) => edge.to === code);
    const names = new Map(ROWS.map((r) => [r[0], r[1]]));
    const missing = row[4] === 'B' ? incoming.map((edge) => edge.from).filter((from) => ROWS.find((r) => r[0] === from)?.[4] !== 'D') : [];
    return item(row, {
      prerequisiteExpr: incoming.length > 0 ? incoming.map((edge) => `${edge.from} ${names.get(edge.from)}`).join(' E ') : null,
      missingPrerequisites: missing,
    });
  });
  const elective: CurriculumItem = {
    ...item(['ENGD01', 'Tópicos em Computação', 0, 60, 'F']),
    nature: 'ELECTIVE',
    term: null,
    lastAttempt: null,
  };
  const complementary: CurriculumItem = {
    ...item(['ACC001', 'Atividades acadêmicas complementares', 0, 100, 'D']),
    nature: 'COMPLEMENTARY',
    term: null,
  };
  const done = required.filter((r) => r.state === 'DONE').reduce((sum, r) => sum + r.hours, 0);
  const total = required.reduce((sum, r) => sum + r.hours, 0);
  const hours = (needed: number, completed: number) => ({ needed, completed, remaining: needed - completed, source: 'estimate' as const });
  return {
    curriculumCode: '2017.1',
    sameCurriculum: true,
    estimate: true,
    required,
    electives: [elective],
    complementary: [complementary],
    hours: {
      required: hours(total, done),
      elective: hours(240, 60),
      complementary: hours(200, 100),
      total: hours(total + 440, done + 160),
    },
    percentComplete: Math.round((done / total) * 100),
    requiredHoursToTake: total - done,
    currentTerm: 5,
    terms: { min: 10, avg: 12, max: 15 },
    prerequisiteEdges: EDGES.map((edge) => ({ ...edge })),
    divergences: { obsoletePending: [], substitutedPending: [], satisfiedByAdequation: [], newInCurriculum: [] },
    ...overrides,
  };
}
