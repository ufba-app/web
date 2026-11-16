import type { Curriculum, CurriculumItem, PrerequisiteEdge } from '../../../contract';

/**
 * Mapa da Trajetória: tudo o que é CÁLCULO (colunas, posição dos cartões, caminho completo, roteamento das linhas) fica
 * aqui, em funções puras, sem React. Regras do André em `dev/ufba/handoffs/trajetoria-mapa.md`.
 *
 * Nada aqui inventa dado: com `prerequisiteEdges` vazio (o SIGAA não trouxe pré-requisitos legíveis) o mapa não tem linhas.
 */

/** Medidas do desenho (canvas "Trajetória"): cartão 140 × 64, passo 176 × 76; os 36 px entre colunas são dos corredores. */
export const CARD_W = 140;
export const CARD_H = 64;
export const STEP_X = 176;
export const STEP_Y = 76;
/** Folga do desenho: à esquerda, e do topo até o primeiro cartão (cabe o rótulo da coluna). */
export const PAD_X = 18;
export const TOP = 46;
/** Distância do corredor vertical à borda esquerda dos cartões da coluna de destino. */
export const CORRIDOR = 15;
/** Altura aproximada do bloco dos semestres concluídos (só para o desenho caber; o texto manda no resto). */
const BLOCK_BASE_H = 96;
const BLOCK_SQUARE_ROW_H = 13;
const BLOCK_SQUARES_PER_ROW = 7;

/** Identificador do bloco dos semestres concluídos nas ligações desenhadas. */
export const BLOCK_ID = '__done__';

export type NodeKind = 'done' | 'current' | 'free' | 'redo' | 'blocked';

/** O estado visual de um cartão. `toRedo` vence: reprovada ou trancada nunca aparece como "livre" nem como "bloqueada". */
export function nodeKind(item: CurriculumItem): NodeKind {
  if (item.state === 'DONE' || item.state === 'DONE_VIA_EQUIVALENCE') return 'done';
  if (item.state === 'ENROLLED') return 'current';
  if (item.toRedo === true) return 'redo';
  return item.state === 'BLOCKED' ? 'blocked' : 'free';
}

export type MapNode = {
  code: string;
  item: CurriculumItem;
  kind: NodeKind;
  term: number;
  col: number;
  x: number;
  y: number;
};

export type MapColumn = { term: number; x: number; current: boolean };

export type MapBlock = {
  x: number;
  y: number;
  height: number;
  firstTerm: number;
  lastTerm: number;
  count: number;
  hours: number;
  /** Quantos dos componentes condensados ainda NÃO estão cumpridos (reprovada, trancada, pendente): não somem no bloco. */
  pending: number;
  /** Um por componente, na ordem do bloco: cumprido ou não (os quadradinhos). */
  done: boolean[];
};

export type TrajectoryModel = {
  columns: MapColumn[];
  nodes: Map<string, MapNode>;
  /** Todos os componentes do currículo por código, inclusive os que estão dentro do bloco. */
  items: Map<string, CurriculumItem>;
  block: MapBlock | null;
  /** Códigos dos componentes que o bloco junta. */
  blockCodes: ReadonlySet<string>;
  /** Todas as ligações entre componentes que o mapa conhece, sem repetição. */
  edges: PrerequisiteEdge[];
  /** `false` quando a API não mandou ligações: o mapa mostra os cartões sem linhas e a tela explica. */
  hasEdges: boolean;
  currentCol: number | null;
  width: number;
  height: number;
};

const isDone = (item: CurriculumItem) => item.state === 'DONE' || item.state === 'DONE_VIA_EQUIVALENCE';

/** Ligações únicas entre componentes que existem no currículo; se há `REQUIRED` e `ALTERNATIVE` iguais, vale `REQUIRED`. */
function uniqueEdges(raw: PrerequisiteEdge[], known: ReadonlySet<string>): PrerequisiteEdge[] {
  const byPair = new Map<string, PrerequisiteEdge>();
  for (const edge of raw) {
    if (edge.from === edge.to || !known.has(edge.from) || !known.has(edge.to)) continue;
    const key = `${edge.from}>${edge.to}`;
    const existing = byPair.get(key);
    if (!existing || (existing.kind === 'ALTERNATIVE' && edge.kind === 'REQUIRED')) byPair.set(key, edge);
  }
  return [...byPair.values()];
}

/**
 * Monta as colunas e os cartões. Só entram os componentes obrigatórios com semestre no currículo (optativas e
 * complementares não têm posição: ficam na visão em lista). A primeira coluna é um BLOCO que condensa tudo do semestre
 * retrasado (atual − 2) para trás ("1º–5º sem"): a pessoa vê a partir do semestre anterior, o atual e todos os futuros, e o
 * bloco só existe a partir do 3º semestre. O "semestre atual" é `currentTerm` da API se houver coluna dele; senão o
 * primeiro semestre com algo em curso; senão o primeiro com algo não cumprido.
 */
export function buildModel(curriculum: Curriculum): TrajectoryModel {
  const all = [...curriculum.required, ...curriculum.electives, ...curriculum.complementary];
  const items = new Map(all.map((item) => [item.code, item]));
  const mapped = curriculum.required.filter((item): item is CurriculumItem & { term: number } => item.term !== null);

  const termsAsc = [...new Set(mapped.map((item) => item.term))].sort((a, b) => a - b);
  const byTerm = new Map<number, Array<CurriculumItem & { term: number }>>();
  for (const item of mapped) byTerm.set(item.term, [...(byTerm.get(item.term) ?? []), item]);

  // O semestre ATUAL: `currentTerm` da API se houver coluna dele; senão o primeiro com algo em curso; senão o primeiro
  // com algo ainda não cumprido; senão (tudo cumprido) nenhum.
  const enrolledTerm = mapped
    .filter((item) => item.state === 'ENROLLED')
    .map((item) => item.term)
    .sort((a, b) => a - b)[0];
  const firstIncomplete = termsAsc.find((term) => !byTerm.get(term)!.every(isDone));
  const currentTerm =
    curriculum.currentTerm !== null && termsAsc.includes(curriculum.currentTerm)
      ? curriculum.currentTerm
      : (enrolledTerm ?? firstIncomplete ?? null);

  // Bloco (regra do André): a primeira coluna CONDENSA tudo do semestre retrasado (atual − 2) para trás, cumprido ou não;
  // a pessoa vê a partir do semestre anterior (atual − 1), o atual e todos os futuros. Por isso o bloco só existe a partir
  // do 3º semestre. Sem semestre atual (curso todo cumprido) cai na regra antiga: a sequência inicial de semestres cumpridos.
  const blockTerms: number[] = [];
  if (currentTerm !== null) {
    for (const term of termsAsc) if (term <= currentTerm - 2) blockTerms.push(term);
  } else {
    for (const term of termsAsc) {
      if (!byTerm.get(term)!.every(isDone)) break;
      blockTerms.push(term);
    }
  }
  const blockItems = blockTerms.flatMap((term) => byTerm.get(term)!);
  const blockCodes = new Set(blockItems.map((item) => item.code));
  const columnTerms = termsAsc.filter((term) => !blockTerms.includes(term));

  const offset = blockItems.length > 0 ? 1 : 0;
  const columns: MapColumn[] = columnTerms.map((term, index) => ({
    term,
    x: PAD_X + (index + offset) * STEP_X,
    current: term === currentTerm,
  }));

  const nodes = new Map<string, MapNode>();
  let maxRows = 0;
  columns.forEach((column, index) => {
    const list = byTerm.get(column.term)!;
    maxRows = Math.max(maxRows, list.length);
    list.forEach((item, row) => {
      nodes.set(item.code, {
        code: item.code,
        item,
        kind: nodeKind(item),
        term: column.term,
        col: index + offset,
        x: column.x,
        y: TOP + row * STEP_Y,
      });
    });
  });

  const block: MapBlock | null =
    blockItems.length > 0
      ? {
          x: PAD_X,
          y: TOP,
          height: BLOCK_BASE_H + Math.ceil(blockItems.length / BLOCK_SQUARES_PER_ROW) * BLOCK_SQUARE_ROW_H,
          firstTerm: blockTerms[0]!,
          lastTerm: blockTerms[blockTerms.length - 1]!,
          count: blockItems.length,
          hours: blockItems.reduce((sum, item) => sum + item.hours, 0),
          pending: blockItems.filter((item) => !isDone(item)).length,
          done: blockItems.map(isDone),
        }
      : null;

  const known = new Set(mapped.map((item) => item.code));
  const edges = uniqueEdges(curriculum.prerequisiteEdges, known);
  const currentColumn = columns.find((column) => column.current);
  const columnCount = columns.length + offset;

  return {
    columns,
    nodes,
    items,
    block,
    blockCodes,
    edges,
    hasEdges: edges.length > 0,
    currentCol: currentColumn ? columns.indexOf(currentColumn) + offset : null,
    width: PAD_X * 2 + Math.max(0, columnCount - 1) * STEP_X + CARD_W,
    height: Math.max(TOP + maxRows * STEP_Y + 8, block ? TOP + block.height + 8 : 0),
  };
}

function closure(start: string, next: Map<string, string[]>): Set<string> {
  const out = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const code = queue.pop()!;
    for (const other of next.get(code) ?? []) {
      if (!out.has(other)) {
        out.add(other);
        queue.push(other);
      }
    }
  }
  return out;
}

function adjacency(edges: PrerequisiteEdge[]) {
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  for (const edge of edges) {
    successors.set(edge.from, [...(successors.get(edge.from) ?? []), edge.to]);
    predecessors.set(edge.to, [...(predecessors.get(edge.to) ?? []), edge.from]);
  }
  return { successors, predecessors };
}

export type FullPath = {
  /** Tudo o que a disciplina exige, em qualquer profundidade (pré-requisitos dos pré-requisitos…). */
  before: Set<string>;
  /** Tudo o que ela libera, em qualquer profundidade. */
  after: Set<string>;
  /** Só as ligações do caminho completo. */
  edges: PrerequisiteEdge[];
};

/**
 * O caminho completo de `selected`: `anc` = fecho dos pré-requisitos, `des` = fecho do que ela libera. Entram só as
 * ligações (a, b) em que b está em `anc ∪ {selected}` e a em `anc`, ou a está em `des ∪ {selected}` e b em `des`.
 */
export function fullPath(edges: PrerequisiteEdge[], selected: string): FullPath {
  const { successors, predecessors } = adjacency(edges);
  const before = closure(selected, predecessors);
  const after = closure(selected, successors);
  const upper = new Set(before).add(selected);
  const lower = new Set(after).add(selected);
  return {
    before,
    after,
    edges: edges.filter(
      (edge) => (upper.has(edge.to) && before.has(edge.from)) || (lower.has(edge.from) && after.has(edge.to)),
    ),
  };
}

/** Sem seleção: só as ligações que ENTRAM ou SAEM de uma disciplina da coluna do semestre atual. */
export function currentTermEdges(model: TrajectoryModel): PrerequisiteEdge[] {
  if (model.currentCol === null) return [];
  const inCurrent = (code: string) => model.nodes.get(code)?.col === model.currentCol;
  return model.edges.filter((edge) => inCurrent(edge.from) || inCurrent(edge.to));
}

export type RoutedPath = { d: string; alternative: boolean };
export type Routed = { paths: RoutedPath[]; dots: Array<{ x: number; y: number }> };

type Anchor = { x: number; y: number; alternative: boolean };

/**
 * Roteamento em ângulo reto por "corredor" (decisão do André): para cada coluna de destino há UM corredor vertical a
 * `CORRIDOR` px da borda esquerda dos cartões; a origem sai pela direita em linha reta até o corredor, e do corredor
 * uma linha reta chega à esquerda do destino. Cantos retos. A bolinha só aparece onde duas ou mais linhas se encontram
 * ou se bifurcam (junção no MEIO do corredor, ou dois ramos no mesmo ponto).
 *
 * Quem sai do bloco dos semestres concluídos sai do próprio bloco (uma linha por destino, sem repetir). Ligação que não
 * vai da esquerda para a direita (mesmo semestre, ou para trás: o currículo tem esses casos) não é desenhada: não há
 * por onde passar sem inventar caminho. Ela continua valendo no painel de detalhes.
 *
 * Limitação conhecida: uma ligação que atravessa colunas passa por trás dos cartões do meio (o cartão fica por cima).
 */
export function routeEdges(model: TrajectoryModel, edges: PrerequisiteEdge[]): Routed {
  const columns = new Map<number, { x: number; sources: Map<string, Anchor>; targets: Map<string, Anchor> }>();

  for (const edge of edges) {
    const target = model.nodes.get(edge.to);
    if (!target) continue;
    const fromBlock = model.blockCodes.has(edge.from);
    const source = model.nodes.get(edge.from);
    if (!fromBlock && !source) continue;
    if (!fromBlock && source!.col >= target.col) continue;
    const start: { id: string; x: number; y: number } = fromBlock
      ? { id: BLOCK_ID, x: model.block!.x + CARD_W, y: model.block!.y + CARD_H / 2 }
      : { id: edge.from, x: source!.x + CARD_W, y: source!.y + CARD_H / 2 };

    const column = columns.get(target.col) ?? { x: target.x, sources: new Map(), targets: new Map() };
    columns.set(target.col, column);
    const alternative = edge.kind === 'ALTERNATIVE';
    const sourceOld = column.sources.get(start.id);
    column.sources.set(start.id, { x: start.x, y: start.y, alternative: sourceOld ? sourceOld.alternative && alternative : alternative });
    const targetOld = column.targets.get(edge.to);
    column.targets.set(edge.to, { x: target.x, y: target.y + CARD_H / 2, alternative: targetOld ? targetOld.alternative && alternative : alternative });
  }

  const paths: RoutedPath[] = [];
  const dots: Array<{ x: number; y: number }> = [];
  for (const column of columns.values()) {
    const gx = column.x - CORRIDOR;
    const ys: number[] = [];
    for (const source of column.sources.values()) {
      paths.push({ d: `M${source.x},${source.y} H${gx}`, alternative: source.alternative });
      ys.push(source.y);
    }
    for (const target of column.targets.values()) {
      paths.push({ d: `M${gx},${target.y} H${target.x}`, alternative: target.alternative });
      ys.push(target.y);
    }
    const low = Math.min(...ys);
    const high = Math.max(...ys);
    if (high <= low) continue;
    paths.push({ d: `M${gx},${low} V${high}`, alternative: false });
    const count = new Map<number, number>();
    for (const y of ys) count.set(y, (count.get(y) ?? 0) + 1);
    for (const [y, times] of count) {
      if ((y > low && y < high) || times > 1) dots.push({ x: gx, y });
    }
  }
  return { paths, dots };
}

/** Os códigos que ficam "no caminho" (realçados) para uma seleção: o cartão escolhido, o que ela exige e o que ela libera. */
export function pathCodes(path: FullPath, selected: string): Set<string> {
  return new Set([selected, ...path.before, ...path.after]);
}

/** Pré-requisitos e liberados DIRETOS de um componente, com o tipo da ligação (para o painel de detalhes). */
export function directLinks(model: TrajectoryModel, code: string) {
  return {
    requires: model.edges.filter((edge) => edge.to === code),
    unlocks: model.edges.filter((edge) => edge.from === code),
  };
}

/** Ordena códigos por semestre do currículo e depois por código (para listar o caminho do começo ao fim). */
export function sortByTerm(model: TrajectoryModel, codes: Iterable<string>): string[] {
  const term = (code: string) => model.items.get(code)?.term ?? Number.MAX_SAFE_INTEGER;
  return [...codes].sort((a, b) => term(a) - term(b) || a.localeCompare(b));
}
