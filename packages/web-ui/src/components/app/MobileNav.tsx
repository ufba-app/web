import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ElementType,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

/** Quanto o dedo precisa andar (px) para o toque virar arrasto. */
const DRAG_THRESHOLD = 6;
/** Velocidade (px/ms) a partir da qual soltar a folha decide sozinho: para cima abre, para baixo fecha. */
const FLICK_SPEED = 0.4;

export type MobileNavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  current?: boolean;
  /** Ponto de aviso no ícone (algo novo esperando). */
  alert?: boolean;
  /** Elemento do link, por exemplo o `Link` do roteador. Padrão: `a`. */
  as?: ElementType;
};

export type MobileNavProps = {
  /** Os atalhos da barra (4 cabem bem). */
  items: MobileNavItem[];
  /** O menu completo que sobe na folha: perfil, grupos e links. */
  children: ReactNode;
  /** Texto fixo no pé da folha. */
  footer?: ReactNode;
  /** Botão próprio na base da folha, acima do texto fixo (por exemplo, Sair). */
  action?: ReactNode;
};

type Gesture = { startY: number; startProgress: number; lastY: number; lastTime: number; speed: number; moved: boolean };

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Navegação do celular: barra fixa embaixo, com uma alça no meio que sobe numa folha com o menu completo. A alça abre
 * com um toque e acompanha o dedo ao arrastar; Esc, o fundo escurecido e escolher um link fecham.
 */
export function MobileNav({ items, children, footer, action }: MobileNavProps) {
  const sheetId = useId();
  const [open, setOpen] = useState(false);
  /** Progresso da folha (0 fechada, 1 aberta) enquanto o dedo arrasta; `null` fora do arrasto. */
  const [drag, setDrag] = useState<number | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const swallowClick = useRef(false);

  const state = drag !== null ? 'dragging' : open ? 'open' : 'closed';
  const progress = drag ?? (open ? 1 : 0);
  const visible = state !== 'closed';

  // Esc fecha.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Com a folha na tela, a página por baixo não rola.
  useEffect(() => {
    if (!visible) return undefined;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = before;
    };
  }, [visible]);

  const range = useCallback(() => Math.max(sheetRef.current?.offsetHeight ?? 0, 1), []);

  const onPointerDown = (e: PointerEvent<HTMLElement>, startProgress: number) => {
    if (e.button !== 0) return;
    swallowClick.current = false; // um arrasto antigo não pode engolir o toque novo
    gesture.current = { startY: e.clientY, startProgress, lastY: e.clientY, lastTime: e.timeStamp, speed: 0, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dy = e.clientY - g.startY;
    if (!g.moved && Math.abs(dy) < DRAG_THRESHOLD) return;
    g.moved = true;
    const elapsed = e.timeStamp - g.lastTime;
    if (elapsed > 0) g.speed = (e.clientY - g.lastY) / elapsed;
    g.lastY = e.clientY;
    g.lastTime = e.timeStamp;
    setDrag(clamp(g.startProgress - dy / range()));
  };

  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.moved) return; // toque simples: quem decide é o clique
    // O clique que o navegador manda depois de arrastar a alça da barra não pode abrir/fechar de novo.
    // A alça da folha não tem clique, então não há o que engolir.
    swallowClick.current = e.currentTarget instanceof HTMLButtonElement;
    const end = clamp(g.startProgress - (e.clientY - g.startY) / range());
    if (g.speed <= -FLICK_SPEED) setOpen(true);
    else if (g.speed >= FLICK_SPEED) setOpen(false);
    else setOpen(end >= 0.5);
    setDrag(null);
  };

  const onPointerCancel = () => {
    gesture.current = null;
    setDrag(null);
  };

  const onHandleClick = () => {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    setOpen((value) => !value);
  };

  // Escolher um link fecha a folha: com roteamento no cliente a barra continua montada.
  const onSheetClick = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as Element).closest('a')) setOpen(false);
  };

  // Setas na alça: para cima abre, para baixo fecha.
  const onHandleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowUp') setOpen(true);
    if (e.key === 'ArrowDown') setOpen(false);
  };

  return (
    <div className="ufba-mnav" data-state={state} style={{ ['--ufba-mnav-p' as string]: progress }}>
      <div className="ufba-mnav__veil" onClick={() => setOpen(false)} aria-hidden="true" />
      <nav className="ufba-mnav__bar" aria-label="Menu do celular">
        <button
          type="button"
          className="ufba-mnav__handle"
          aria-label={open ? 'Fechar menu completo' : 'Abrir menu completo'}
          aria-expanded={open}
          aria-controls={sheetId}
          onClick={onHandleClick}
          onKeyDown={onHandleKeyDown}
          onPointerDown={(e) => onPointerDown(e, open ? 1 : 0)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        />
        {items.map(({ href, label, icon, current, alert, as: Comp = 'a' }) => (
          <Comp key={href} className="ufba-mnav__item" href={href} aria-current={current ? 'page' : undefined}>
            <span className="ufba-mnav__icon" aria-hidden="true">
              {icon}
            </span>
            {label}
            {alert ? <span className="ufba-mnav__alert" role="img" aria-label="novidade" /> : null}
          </Comp>
        ))}
      </nav>
      <section
        id={sheetId}
        ref={sheetRef}
        className="ufba-mnav__sheet"
        aria-label="Menu completo"
        aria-hidden={visible ? undefined : true}
        inert={!visible}
        onClick={onSheetClick}
      >
        <div
          className="ufba-mnav__grip"
          onPointerDown={(e) => onPointerDown(e, 1)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        />
        <div className="ufba-mnav__scroll">{children}</div>
        {action ? <div className="ufba-mnav__action">{action}</div> : null}
        {footer ? <p className="ufba-mnav__footer">{footer}</p> : null}
      </section>
    </div>
  );
}

export type MobileNavProfileProps = {
  /** Avatar ou iniciais. */
  avatar: ReactNode;
  name: string;
  /** Segunda linha: por exemplo o curso, ou o e-mail. */
  detail?: string;
};

export function MobileNavProfile({ avatar, name, detail }: MobileNavProfileProps) {
  return (
    <div className="ufba-mnav__profile">
      <span className="ufba-mnav__avatar" aria-hidden="true">
        {avatar}
      </span>
      <div className="ufba-mnav__who">
        <b>{name}</b>
        {detail ? <small>{detail}</small> : null}
      </div>
    </div>
  );
}

export type MobileNavGroupProps = { label: string; children: ReactNode };

export function MobileNavGroup({ label, children }: MobileNavGroupProps) {
  return (
    <section className="ufba-mnav__group">
      <h2 className="ufba-mnav__group-title">{label}</h2>
      <ul className="ufba-mnav__list">{children}</ul>
    </section>
  );
}

export type MobileNavLinkProps = {
  href: string;
  icon?: ReactNode;
  /** Texto pequeno à direita, como "3 de 3". */
  detail?: string;
  current?: boolean;
  as?: ElementType;
  children: ReactNode;
};

export function MobileNavLink({ href, icon, detail, current, as: Comp = 'a', children }: MobileNavLinkProps) {
  return (
    <li>
      <Comp className="ufba-mnav__link" href={href} aria-current={current ? 'page' : undefined}>
        {icon ? (
          <span className="ufba-mnav__link-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className="ufba-mnav__link-label">{children}</span>
        {detail ? <small>{detail}</small> : null}
        <svg className="ufba-mnav__chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </Comp>
    </li>
  );
}
