import { useMemo, useState } from 'react';
import type { Curriculum, CurriculumItem } from '../../../contract';
import { LockIcon } from '../../icons';
import { formatHours, formatNumber, termLabel } from '../format';
import {
  buildModel,
  CARD_H,
  CARD_W,
  currentTermEdges,
  directLinks,
  fullPath,
  pathCodes,
  routeEdges,
  sortByTerm,
  type MapNode,
  type NodeKind,
  type TrajectoryModel,
} from './graph';
import './trajectory.css';

/** Texto do estado: a cor nunca fala sozinha (sempre há texto). Sem amarelo: verde, azul, vermelho e cinza. */
const KIND_LABEL: Record<NodeKind, string> = {
  done: 'Concluída',
  current: 'Cursando',
  free: 'Pode cursar',
  redo: 'A refazer',
  blocked: 'Bloqueada por pré-requisito',
};

/** O canto direito do cartão: nota, "AGORA", "LIVRE", "REFAZER" ou o cadeado. */
function corner(node: MapNode): string | null {
  switch (node.kind) {
    case 'done':
      return node.item.lastAttempt?.grade != null ? formatNumber(node.item.lastAttempt.grade, 1) : 'OK';
    case 'current':
      return 'AGORA';
    case 'free':
      return 'LIVRE';
    case 'redo':
      return 'REFAZER';
    case 'blocked':
      return null;
  }
}

/** Siglas do SIGAA em palavras; sigla que não conhecemos aparece como veio. */
const ATTEMPT_STATUS: Record<string, string> = {
  APR: 'aprovado',
  REP: 'reprovado',
  REPF: 'reprovado por falta',
  REPMF: 'reprovado por média e falta',
  TRANC: 'trancado',
  MATR: 'cursando',
};

const attemptStatus = (status: string): string => ATTEMPT_STATUS[status] ?? status;

/** Uma frase sobre a situação de uma disciplina, para a lista de pré-requisitos e liberadas. */
function situation(item: CurriculumItem): string {
  const attempt = item.lastAttempt;
  if (item.state === 'DONE_VIA_EQUIVALENCE') return item.via.length > 0 ? `Cumprida via ${item.via.join(', ')}` : 'Cumprida via equivalência';
  if (item.state === 'DONE') return attempt?.term ? `Aprovado em ${attempt.term}` : 'Aprovado';
  if (item.state === 'ENROLLED') return 'Cursando agora';
  if (item.toRedo === true) {
    return attempt?.term ? `A refazer (${attemptStatus(attempt.status)} em ${attempt.term})` : `A refazer (${attemptStatus(attempt?.status ?? 'sem sucesso')})`;
  }
  return 'Ainda não cursada';
}

function Legend() {
  return (
    <ul className="tj-legenda" aria-label="Legenda do mapa">
      <li>
        <i className="tj-leg tj-leg--done" aria-hidden="true" />
        Concluída
      </li>
      <li>
        <i className="tj-leg tj-leg--current" aria-hidden="true" />
        Cursando
      </li>
      <li>
        <i className="tj-leg tj-leg--free" aria-hidden="true" />
        Pode cursar
      </li>
      <li>
        <i className="tj-leg tj-leg--redo" aria-hidden="true" />A refazer
      </li>
      <li>
        <i className="tj-leg tj-leg--blocked" aria-hidden="true" />
        Bloqueada por pré-requisito
      </li>
    </ul>
  );
}

function Card({
  node,
  selected,
  related,
  onPick,
}: {
  node: MapNode;
  selected: boolean;
  related: boolean;
  onPick: (code: string) => void;
}) {
  const side = corner(node);
  const className = ['tj-no', `tj-no--${node.kind}`, selected ? 'tj-no--sel' : '', related ? 'tj-no--rel' : ''].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={className}
      style={{ left: node.x, top: node.y, width: CARD_W, height: CARD_H }}
      aria-pressed={selected}
      aria-label={`${node.item.code}, ${node.item.name}, ${KIND_LABEL[node.kind].toLowerCase()}`}
      onClick={() => onPick(node.code)}
    >
      <span className="tj-no__cd">
        <span>{node.item.code}</span>
        {node.kind === 'blocked' ? <LockIcon /> : <span>{side}</span>}
      </span>
      <span className="tj-no__nm">{node.item.name}</span>
    </button>
  );
}

function MapCanvas({ model, selected, onPick }: { model: TrajectoryModel; selected: string | null; onPick: (code: string) => void }) {
  const path = useMemo(() => (selected ? fullPath(model.edges, selected) : null), [model, selected]);
  const related = useMemo(() => (path && selected ? pathCodes(path, selected) : null), [path, selected]);
  const routed = useMemo(() => routeEdges(model, path ? path.edges : currentTermEdges(model)), [model, path]);
  const strong = path !== null;
  const lineClass = strong ? 'tj-ln tj-ln--strong' : 'tj-ln tj-ln--soft';
  const { block } = model;

  return (
    <div
      className="tj-mapa"
      role="region"
      aria-label="Mapa de disciplinas por semestre"
      // Região rolável (o mapa é mais largo que a tela no celular): precisa de foco para quem usa o teclado.
      tabIndex={0}
    >
      <div className={`tj-lona${selected ? ' tj-lona--sel' : ''}`} style={{ width: model.width, height: model.height }}>
        <svg width={model.width} height={model.height} aria-hidden="true" focusable="false">
          {routed.paths.map((p, index) => (
            <path key={index} d={p.d} className={`${lineClass}${p.alternative ? ' tj-ln--alt' : ''}`} />
          ))}
          {routed.dots.map((dot, index) => (
            <circle key={index} cx={dot.x} cy={dot.y} r={3.2} className={strong ? 'tj-dot tj-dot--strong' : 'tj-dot tj-dot--soft'} />
          ))}
        </svg>

        {block ? (
          <>
            <span className="tj-col" style={{ left: block.x }}>
              {block.firstTerm === block.lastTerm ? `${block.firstTerm}º sem` : `${block.firstTerm}º–${block.lastTerm}º sem`}
            </span>
            <div className="tj-bloco" style={{ left: block.x, top: block.y, width: CARD_W, minHeight: block.height - 16 }}>
              <b>
                {block.count} {block.count === 1 ? 'componente concluído' : 'componentes concluídos'}
              </b>
              <span>{formatHours(block.hours)}</span>
              <div className="tj-quad" aria-hidden="true">
                {Array.from({ length: block.count }, (_, index) => (
                  <i key={index} />
                ))}
              </div>
            </div>
          </>
        ) : null}

        {model.columns.map((column) => (
          <span key={column.term} className="tj-col" style={{ left: column.x }}>
            {column.term}º sem{column.current ? <b> · agora</b> : null}
          </span>
        ))}

        {[...model.nodes.values()].map((node) => (
          <Card
            key={node.code}
            node={node}
            selected={selected === node.code}
            related={related !== null && related.has(node.code) && selected !== node.code}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}

/** Uma disciplina na lista de pré-requisitos/liberadas: clicável quando está no mapa (não dentro do bloco). */
function LinkedItem({
  model,
  code,
  note,
  onPick,
}: {
  model: TrajectoryModel;
  code: string;
  note?: string;
  onPick: (code: string) => void;
}) {
  const item = model.items.get(code);
  if (!item) return null;
  const body = (
    <>
      <b>
        {item.code} · {item.name}
      </b>
      <small>
        {note ? `${note} · ` : ''}
        {situation(item)}
      </small>
    </>
  );
  return (
    <li>
      {model.nodes.has(code) ? (
        <button type="button" className="tj-lig" onClick={() => onPick(code)}>
          {body}
        </button>
      ) : (
        <div className="tj-lig">{body}</div>
      )}
    </li>
  );
}

function Details({
  model,
  selected,
  onPick,
  onClear,
}: {
  model: TrajectoryModel;
  selected: string | null;
  onPick: (code: string) => void;
  onClear: () => void;
}) {
  const node = selected ? model.nodes.get(selected) : undefined;
  if (!node) {
    return (
      <section className="tj-pn" aria-labelledby="tj-det-titulo" aria-live="polite">
        <h3 id="tj-det-titulo">Caminho de uma disciplina</h3>
        <p className="web-muted">Escolha uma disciplina no mapa. As linhas mostram tudo o que ela exige e tudo o que ela libera.</p>
        {model.hasEdges ? (
          <p className="tj-dica tj-dica--info">Por enquanto, sem escolher nada, aparecem só as ligações do semestre atual.</p>
        ) : (
          <p className="tj-dica">As ligações entre as disciplinas não estão disponíveis para o seu curso. O mapa mostra o estado de cada uma, sem linhas.</p>
        )}
      </section>
    );
  }

  const { item } = node;
  const links = directLinks(model, node.code);
  const path = fullPath(model.edges, node.code);
  const attempt = item.lastAttempt;

  return (
    <section className="tj-pn" aria-labelledby="tj-det-titulo" aria-live="polite">
      <div className="tj-pn__topo">
        <small className="tj-det__cd">
          {item.code} · {formatHours(item.hours)}
        </small>
        <button type="button" className="web-link" onClick={onClear}>
          Voltar ao início
        </button>
      </div>
      <h3 id="tj-det-titulo">{item.name}</h3>
      <div className="tj-det__chips">
        <span className={`web-va-st tj-st tj-st--${node.kind}`}>{KIND_LABEL[node.kind]}</span>
        {item.state === 'BLOCKED' && node.kind === 'redo' ? <span className="web-va-st web-va-st--blocked">Também bloqueada</span> : null}
        <span className="web-va-st web-va-st--blocked">Obrigatória</span>
        <span className="web-va-st web-va-st--blocked">{termLabel(node.term)}</span>
      </div>

      {attempt ? (
        <p className="web-muted">
          Última tentativa: {attemptStatus(attempt.status)}
          {attempt.term ? ` em ${attempt.term}` : ''}
          {attempt.grade != null ? `, nota ${formatNumber(attempt.grade, 1)}` : ''}.
        </p>
      ) : null}

      {model.hasEdges ? (
        <>
          <h4>Exige</h4>
          {links.requires.length === 0 ? (
            <p className="web-muted">Nenhuma disciplina.</p>
          ) : (
            <ul className="tj-lista">
              {links.requires.map((edge) => (
                <LinkedItem key={edge.from} model={model} code={edge.from} note={edge.kind === 'ALTERNATIVE' ? 'um destes' : undefined} onPick={onPick} />
              ))}
            </ul>
          )}
          <h4>Libera</h4>
          {links.unlocks.length === 0 ? (
            <p className="web-muted">Nenhuma disciplina.</p>
          ) : (
            <ul className="tj-lista">
              {links.unlocks.map((edge) => (
                <LinkedItem key={edge.to} model={model} code={edge.to} onPick={onPick} />
              ))}
            </ul>
          )}
          <p className="tj-dica tj-dica--info">
            Caminho completo: {path.before.size === 1 ? '1 disciplina vem' : `${path.before.size} disciplinas vêm`} antes e{' '}
            {path.after.size === 1 ? '1 vem' : `${path.after.size} vêm`} depois.
            {path.before.size > 0 ? ` Do começo: ${sortByTerm(model, path.before).slice(0, 3).join(', ')}${path.before.size > 3 ? '…' : ''}.` : ''}
          </p>
        </>
      ) : (
        <p className="tj-dica">As ligações desta disciplina não estão disponíveis.</p>
      )}
    </section>
  );
}

/**
 * O mapa da Trajetória (visão "Mapa"): uma coluna por semestre do currículo, um cartão por disciplina, e só as ligações
 * que importam (as do semestre atual; ao escolher uma disciplina, o caminho completo dela). Cálculo em `graph.ts`.
 * Escolher a mesma disciplina de novo (ou "Voltar ao início") limpa a escolha.
 */
export function TrajectoryMap({ curriculum }: { curriculum: Curriculum }) {
  const model = useMemo(() => buildModel(curriculum), [curriculum]);
  const [selected, setSelected] = useState<string | null>(null);
  const pick = (code: string) => setSelected((current) => (current === code ? null : code));

  if (model.nodes.size === 0 && !model.block) {
    return (
      <p className="tj-dica">O currículo do seu curso ainda não tem disciplinas com semestre para desenhar o mapa. Veja a lista.</p>
    );
  }

  return (
    <div className="tj-pagina">
      <Legend />
      <p className="tj-dica-mapa">Arraste o mapa para os lados</p>
      <MapCanvas model={model} selected={selected} onPick={pick} />
      <Details model={model} selected={selected} onPick={pick} onClear={() => setSelected(null)} />
    </div>
  );
}
