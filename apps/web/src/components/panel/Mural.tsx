import { SourceIcon } from './SourceIcon';
import { useState } from 'react';
import { SOURCE_NAME, type EventSource } from './model';
import './panel.css';

/**
 * Um aviso do mural. O formato é o que o DESENHO mostra (canvas, seção 13); NÃO existe rota da API que o entregue ainda
 * (só há `GET /sources/{source}/announcements/{id}`, por id). Por isso o Painel não mostra o mural em produção: este
 * componente está pronto e testado, e entra na página quando a API tiver a lista de avisos.
 */
export type MuralItem = {
  id: string;
  source: EventSource;
  /** Disciplina de onde veio ("Histologia"). */
  courseName: string;
  title: string;
  /** Começo do texto, se houver. */
  snippet: string | null;
  /** Quando saiu, já em texto curto ("há 2 h", "ontem", "sex."). */
  when: string;
  /** Ainda não lido. */
  isNew: boolean;
  /** O aviso mexeu numa data (ex.: prova adiada). */
  dateChanged: boolean;
};

type Filter = 'all' | 'unread';

/**
 * O mural de avisos (desenho: "Painel · calendário e mural", "mural sem avisos novos"). `sources` são as fontes
 * conectadas (rodapé) e `updatedAt` o "atualizado há 4 min" já em texto.
 */
export function Mural({ items, sources, updatedAt }: { items: MuralItem[]; sources: EventSource[]; updatedAt: string }) {
  const [filter, setFilter] = useState<Filter>('all');
  const unread = items.filter((item) => item.isNew).length;
  const visible = filter === 'unread' ? items.filter((item) => item.isNew) : items;

  return (
    <aside className="pn-mural" aria-label="Mural de avisos">
      <div className="pn-mural__topo">
        <h2>Mural</h2>
        {unread > 0 ? <span className="pn-mural__novos">{unread === 1 ? '1 novo' : `${unread} novos`}</span> : null}
      </div>

      {items.length === 0 ? (
        <div className="pn-vazio">
          <span className="pn-vazio__forma" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </span>
          <h3>Tudo em dia</h3>
          <p>Quando uma disciplina publicar um aviso, ele aparece aqui.</p>
        </div>
      ) : (
        <>
          <div className="pn-filtro" role="group" aria-label="Filtro do mural">
            <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              Todos
            </button>
            <button type="button" aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>
              Não lidos
            </button>
          </div>
          {visible.length === 0 ? <p className="web-muted pn-av__vazio">Nenhum aviso não lido.</p> : null}
          <ul className="pn-avs">
            {visible.map((item) => (
              <li key={item.id} className={`pn-av${item.isNew ? ' pn-av--novo' : ''}`}>
                <span className="pn-av__fonte" title={SOURCE_NAME[item.source]}>
                  <SourceIcon source={item.source} size={22} />
                </span>
                <div>
                  <span className="pn-av__meta">
                    {item.courseName} · {item.when}
                    {item.dateChanged ? <span className="pn-av__aviso">Data mudou</span> : null}
                  </span>
                  <b>{item.title}</b>
                  {item.snippet ? <p>{item.snippet}</p> : null}
                </div>
                {item.isNew ? <span className="pn-sr">Novo</span> : null}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="pn-mural__pe">
        <span>
          {sources.length === 1 ? '1 fonte conectada' : `${sources.length} fontes conectadas`} · {updatedAt}
        </span>
      </div>
    </aside>
  );
}
