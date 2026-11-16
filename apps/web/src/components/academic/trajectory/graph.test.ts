import type { Curriculum, CurriculumItem, PrerequisiteEdge } from '../../../contract';
import { trajectoryCurriculumFixture } from '../../../contract/trajectoryFixture';
import {
  BLOCK_ID,
  buildModel,
  CARD_H,
  CARD_W,
  CORRIDOR,
  currentTermEdges,
  fullPath,
  nodeKind,
  pathCodes,
  routeEdges,
  sortByTerm,
  STEP_X,
} from './graph';

const edge = (from: string, to: string, kind: PrerequisiteEdge['kind'] = 'REQUIRED'): PrerequisiteEdge => ({ from, to, kind });

/** Currículo mínimo para casos pontuais: cada linha é [código, semestre, estado]. */
function small(rows: Array<[string, number, CurriculumItem['state']]>, edges: PrerequisiteEdge[], extra: Partial<Curriculum> = {}): Curriculum {
  const base = trajectoryCurriculumFixture();
  const template = base.required[0]!;
  return {
    ...base,
    required: rows.map(([code, term, state]) => ({ ...template, code, name: `Nome ${code}`, term, state, toRedo: false })),
    electives: [],
    complementary: [],
    prerequisiteEdges: edges,
    currentTerm: null,
    ...extra,
  };
}

describe('nodeKind', () => {
  const item = (state: CurriculumItem['state'], toRedo?: boolean): CurriculumItem => ({ ...trajectoryCurriculumFixture().required[0]!, state, toRedo });
  it('cumprida (inclusive por equivalência), em curso, livre e bloqueada', () => {
    expect(nodeKind(item('DONE'))).toBe('done');
    expect(nodeKind(item('DONE_VIA_EQUIVALENCE'))).toBe('done');
    expect(nodeKind(item('ENROLLED'))).toBe('current');
    expect(nodeKind(item('AVAILABLE'))).toBe('free');
    expect(nodeKind(item('BLOCKED'))).toBe('blocked');
  });
  it('a refazer vence livre E bloqueada: reprovada nunca aparece como livre', () => {
    expect(nodeKind(item('AVAILABLE', true))).toBe('redo');
    expect(nodeKind(item('BLOCKED', true))).toBe('redo');
  });
  it('sem o campo toRedo (API antiga) segue só o estado', () => {
    expect(nodeKind(item('AVAILABLE', undefined))).toBe('free');
  });
});

describe('buildModel', () => {
  it('junta os semestres cumpridos do começo num bloco e põe uma coluna por semestre depois dele', () => {
    const model = buildModel(trajectoryCurriculumFixture());
    expect(model.block).toMatchObject({ firstTerm: 1, lastTerm: 3, count: 20 });
    expect(model.block!.hours).toBe(1110); // 360 + 360 + 390
    expect(model.columns.map((column) => column.term)).toEqual([4, 5, 6, 7]);
    // O bloco é a coluna 0; o 4º semestre é a coluna 1.
    expect(model.nodes.get('ENGC50')!.col).toBe(1);
    expect(model.nodes.get('ENGC50')!.x).toBe(18 + STEP_X);
    expect(model.nodes.has('MATA02')).toBe(false);
    expect(model.blockCodes.has('MATA02')).toBe(true);
  });

  it('um semestre com algo não cumprido (trancada) NÃO entra no bloco, mesmo com o resto cumprido', () => {
    const model = buildModel(trajectoryCurriculumFixture());
    expect(model.columns[0]!.term).toBe(4);
    expect(model.nodes.get('ENGC24')!.kind).toBe('redo');
  });

  it('o semestre atual é currentTerm da API; sem coluna dele, o primeiro com algo em curso', () => {
    expect(buildModel(trajectoryCurriculumFixture()).columns.find((column) => column.current)!.term).toBe(5);
    const fallback = buildModel(trajectoryCurriculumFixture({ currentTerm: 99 }));
    expect(fallback.columns.find((column) => column.current)!.term).toBe(5);
    const none = buildModel(trajectoryCurriculumFixture({ currentTerm: null }));
    expect(none.columns.find((column) => column.current)!.term).toBe(5);
  });

  it('só os obrigatórios com semestre entram: optativa e complementar ficam fora do mapa', () => {
    const model = buildModel(trajectoryCurriculumFixture());
    expect(model.nodes.has('ENGD01')).toBe(false);
    expect(model.items.has('ENGD01')).toBe(true);
  });

  it('sem nenhum semestre cumprido não há bloco, e a primeira coluna fica na primeira posição', () => {
    const model = buildModel(small([['A', 1, 'ENROLLED'], ['B', 2, 'BLOCKED']], [edge('A', 'B')]));
    expect(model.block).toBeNull();
    expect(model.nodes.get('A')!.x).toBe(18);
    expect(model.nodes.get('B')!.x).toBe(18 + STEP_X);
  });

  it('descarta ligações com ponta fora do currículo, ligação para si mesma e repetição (REQUIRED vence ALTERNATIVE)', () => {
    const model = buildModel(
      small(
        [['A', 1, 'DONE'], ['B', 2, 'AVAILABLE']],
        [edge('A', 'B', 'ALTERNATIVE'), edge('A', 'B', 'REQUIRED'), edge('X', 'B'), edge('B', 'B')],
      ),
    );
    expect(model.edges).toEqual([edge('A', 'B', 'REQUIRED')]);
  });

  it('sem prerequisiteEdges (API antiga) ou com lista vazia: hasEdges é falso e nada quebra', () => {
    expect(buildModel(trajectoryCurriculumFixture({ prerequisiteEdges: undefined })).hasEdges).toBe(false);
    expect(buildModel(trajectoryCurriculumFixture({ prerequisiteEdges: [] })).hasEdges).toBe(false);
    expect(buildModel(trajectoryCurriculumFixture()).hasEdges).toBe(true);
  });

  it('currículo sem obrigatórias com semestre: modelo vazio, sem erro', () => {
    const model = buildModel(small([], []));
    expect(model.columns).toEqual([]);
    expect(model.block).toBeNull();
    expect(model.nodes.size).toBe(0);
  });
});

describe('fullPath (o caminho completo da disciplina escolhida)', () => {
  // A → B → C → D e um ramo lateral A → E; F isolada; G → C.
  const edges = [edge('A', 'B'), edge('B', 'C'), edge('C', 'D'), edge('A', 'E'), edge('G', 'C')];

  it('traz tudo o que ela exige e tudo o que ela libera, em qualquer profundidade', () => {
    const path = fullPath(edges, 'C');
    expect([...path.before].sort()).toEqual(['A', 'B', 'G']);
    expect([...path.after]).toEqual(['D']);
  });

  it('desenha só as ligações do caminho: o ramo A → E (fora do caminho de C) não aparece', () => {
    const path = fullPath(edges, 'C');
    const pairs = path.edges.map((e) => `${e.from}>${e.to}`).sort();
    expect(pairs).toEqual(['A>B', 'B>C', 'C>D', 'G>C']);
  });

  it('o começo da cadeia só tem o que libera; o fim só tem o que exige', () => {
    expect(fullPath(edges, 'A').before.size).toBe(0);
    expect([...fullPath(edges, 'D').after]).toEqual([]);
  });

  it('disciplina sem ligações: caminho vazio', () => {
    const path = fullPath(edges, 'F');
    expect(path.before.size + path.after.size + path.edges.length).toBe(0);
  });

  it('não entra em laço infinito se o currículo tiver um ciclo', () => {
    const path = fullPath([edge('A', 'B'), edge('B', 'A')], 'A');
    expect(path.before.has('B')).toBe(true);
  });

  it('pathCodes junta a escolhida, o que ela exige e o que ela libera', () => {
    expect([...pathCodes(fullPath(edges, 'B'), 'B')].sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('com o currículo de exemplo: Sistemas Operacionais exige a cadeia até o começo e libera Distribuídos', () => {
    const model = buildModel(trajectoryCurriculumFixture());
    const path = fullPath(model.edges, 'MATA58');
    expect(path.before.has('MATA49')).toBe(true);
    expect(path.before.has('ENGC50')).toBe(true); // pré-requisito do pré-requisito
    expect(path.before.has('ENGC40')).toBe(true); // ... até o começo da cadeia
    expect(path.before.has('ENGC26')).toBe(true);
    expect([...path.after]).toEqual(['MATA59']);
    expect(sortByTerm(model, path.before)[0]).toBe('MATA37'); // o começo da cadeia (1º semestre) vem primeiro
  });
});

describe('currentTermEdges (nada selecionado)', () => {
  it('só as ligações que entram ou saem de uma disciplina da coluna do semestre atual', () => {
    const model = buildModel(trajectoryCurriculumFixture());
    const current = new Set([...model.nodes.values()].filter((n) => n.term === 5).map((n) => n.code));
    const edges = currentTermEdges(model);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.every((e) => current.has(e.from) || current.has(e.to))).toBe(true);
    // Uma ligação que não toca o 5º semestre (Física II → Física III) não aparece.
    expect(edges.some((e) => e.from === 'FISD34')).toBe(false);
  });

  it('sem coluna atual não há ligações iniciais', () => {
    expect(currentTermEdges(buildModel(small([], [])))).toEqual([]);
  });
});

describe('routeEdges (corredor, ângulo reto, bolinhas)', () => {
  const model = buildModel(
    small(
      [
        ['A', 1, 'AVAILABLE'], ['B', 1, 'AVAILABLE'], ['C', 2, 'AVAILABLE'], ['D', 2, 'AVAILABLE'], ['E', 3, 'AVAILABLE'],
      ],
      [edge('A', 'C'), edge('B', 'C'), edge('A', 'D'), edge('C', 'E')],
    ),
  );

  it('cada origem sai pela direita do cartão, em linha reta até o corredor, e cada destino sai do corredor até a esquerda', () => {
    const routed = routeEdges(model, [edge('C', 'E')]);
    const c = model.nodes.get('C')!;
    const e = model.nodes.get('E')!;
    const gx = e.x - CORRIDOR;
    const mid = (n: { y: number }) => n.y + CARD_H / 2;
    expect(routed.paths).toContainEqual({ d: `M${c.x + CARD_W},${mid(c)} H${gx}`, alternative: false });
    expect(routed.paths).toContainEqual({ d: `M${gx},${mid(e)} H${e.x}`, alternative: false });
  });

  it('o corredor vertical vai do ponto mais alto ao mais baixo entre origens e destinos', () => {
    const routed = routeEdges(model, [edge('A', 'C'), edge('B', 'C'), edge('A', 'D')]);
    const c = model.nodes.get('C')!;
    const gx = c.x - CORRIDOR;
    const a = model.nodes.get('A')!;
    const d = model.nodes.get('D')!;
    const trunk = routed.paths.find((p) => p.d.startsWith(`M${gx},`) && p.d.includes(' V'));
    expect(trunk?.d).toBe(`M${gx},${a.y + CARD_H / 2} V${d.y + CARD_H / 2}`);
  });

  it('bolinha só onde as linhas se encontram ou se bifurcam; canto simples não leva', () => {
    // Uma ligação só, de A (linha 0) para D (linha 1): é um canto simples, sem bolinha.
    expect(routeEdges(model, [edge('A', 'D')]).dots).toEqual([]);
    // Duas ligações entrando em C a partir de A e B: junção no corredor.
    const joined = routeEdges(model, [edge('A', 'C'), edge('B', 'C')]);
    expect(joined.dots.length).toBeGreaterThan(0);
    const gx = model.nodes.get('C')!.x - CORRIDOR;
    expect(joined.dots.every((dot) => dot.x === gx)).toBe(true);
  });

  it('ligação em linha reta (mesma altura) não cria corredor nem bolinha', () => {
    const routed = routeEdges(model, [edge('A', 'C')]);
    expect(routed.dots).toEqual([]);
  });

  it('ligações vindas do bloco saem do próprio bloco, sem repetir a linha por componente', () => {
    const withBlock = buildModel(
      small([['A', 1, 'DONE'], ['B', 1, 'DONE'], ['C', 2, 'AVAILABLE']], [edge('A', 'C'), edge('B', 'C')]),
    );
    expect(withBlock.block).not.toBeNull();
    const routed = routeEdges(withBlock, withBlock.edges);
    const horizontals = routed.paths.filter((p) => p.d.includes(' H'));
    // Uma só linha de saída do bloco + uma de chegada no destino.
    expect(horizontals).toHaveLength(2);
    expect(horizontals[0]!.d.startsWith(`M${withBlock.block!.x + CARD_W},`)).toBe(true);
  });

  it('ALTERNATIVE sai tracejada (só quando todas as ligações daquele trecho são alternativas)', () => {
    const only = routeEdges(model, [edge('A', 'C', 'ALTERNATIVE')]);
    expect(only.paths.every((p) => p.alternative)).toBe(true);
    const mixed = routeEdges(model, [edge('A', 'C', 'ALTERNATIVE'), edge('B', 'C', 'REQUIRED')]);
    expect(mixed.paths.some((p) => p.alternative)).toBe(true);
    expect(mixed.paths.some((p) => !p.alternative)).toBe(true);
  });

  it('ligação que não vai da esquerda para a direita (mesmo semestre ou para trás) não é desenhada', () => {
    const odd = buildModel(small([['A', 1, 'AVAILABLE'], ['B', 1, 'AVAILABLE'], ['C', 2, 'AVAILABLE']], [edge('A', 'B'), edge('C', 'A')]));
    expect(routeEdges(odd, odd.edges)).toEqual({ paths: [], dots: [] });
  });

  it('o id do bloco não colide com código de disciplina', () => {
    expect(BLOCK_ID.startsWith('__')).toBe(true);
  });
});
