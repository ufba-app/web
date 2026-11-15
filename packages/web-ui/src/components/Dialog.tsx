import { Modal, useOverlayState } from '@heroui/react';
import { useEffect, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from 'react';

/** Quanto (px) o dedo precisa descer a folha para ela fechar ao soltar. */
const CLOSE_DISTANCE = 96;
/** Velocidade (px/ms) de um puxão para baixo que fecha mesmo curto. */
const FLICK_SPEED = 0.5;
/** Tempo (ms) da folha saindo pela base antes de o diálogo fechar de fato. */
const DISMISS_MS = 200;

export type DialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  /** Botões no rodapé, um embaixo do outro no celular. */
  actions: ReactNode;
};

type Gesture = { startY: number; lastY: number; lastTime: number; speed: number };

/**
 * Diálogo sobre a página (conectar SIGAA, conectar Moodle, confirmar revogação). Foco, Esc e véu vêm do HeroUI.
 *
 * No celular vira uma folha colada na base (`placement="auto"`: folha no celular, centralizado no desktop), com
 * rolagem só no corpo, botões sempre visíveis e uma alça que se arrasta para baixo para fechar. O container acompanha a
 * área visível da tela, então a folha fica acima do teclado; o campo focado rola para dentro da vista.
 */
export function Dialog({ isOpen, onOpenChange, icon, title, children, actions }: DialogProps) {
  const state = useOverlayState({ isOpen, onOpenChange });
  /** Quanto a folha já desceu (px) durante o arrasto; `null` fora do arrasto. */
  const [drag, setDrag] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Abriu de novo: a folha volta ao lugar. Desmontou no meio da saída: nada de fechar depois.
  useEffect(() => {
    if (isOpen) {
      setDrag(null);
      setLeaving(false);
    }
    return () => clearTimeout(timer.current);
  }, [isOpen]);

  const dismiss = () => {
    setLeaving(true);
    setDrag(window.innerHeight);
    timer.current = setTimeout(() => onOpenChange(false), DISMISS_MS);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || leaving) return;
    gesture.current = { startY: e.clientY, lastY: e.clientY, lastTime: e.timeStamp, speed: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag(0);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const elapsed = e.timeStamp - g.lastTime;
    if (elapsed > 0) g.speed = (e.clientY - g.lastY) / elapsed;
    g.lastY = e.clientY;
    g.lastTime = e.timeStamp;
    setDrag(Math.max(0, e.clientY - g.startY)); // só para baixo
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const moved = Math.max(0, e.clientY - g.startY);
    if (moved >= CLOSE_DISTANCE || (moved > 8 && g.speed >= FLICK_SPEED)) dismiss();
    else setDrag(null); // soltou antes: a folha volta
  };

  const onPointerCancel = () => {
    gesture.current = null;
    if (!leaving) setDrag(null);
  };

  // Com o teclado aberto, o campo focado pode ficar escondido: rola o corpo para trazê-lo ao meio da vista.
  const onFocus = (e: FocusEvent<HTMLElement>) => {
    const target = e.target;
    if (!(target instanceof HTMLElement) || !target.matches('input, select, textarea')) return;
    setTimeout(() => target.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 300);
  };

  const style =
    drag === null
      ? undefined
      : { transform: `translateY(${drag}px)`, transition: leaving ? `transform ${DISMISS_MS}ms ease-in` : 'none' };

  return (
    <Modal state={state}>
      <Modal.Backdrop className="ufba-dialog__backdrop">
        <Modal.Container placement="auto" scroll="inside" size="sm" className="ufba-dialog__container">
          <Modal.Dialog className="ufba-dialog" style={style}>
            <div
              className="ufba-dialog__grip"
              aria-hidden="true"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
            />
            <Modal.Header className="ufba-dialog__head">
              {icon ? <span className="ufba-dialog__icon" aria-hidden="true">{icon}</span> : null}
              <Modal.Heading className="ufba-dialog__title">{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="ufba-dialog__body" onFocus={onFocus}>
              {children}
            </Modal.Body>
            {actions ? <Modal.Footer className="ufba-dialog__actions">{actions}</Modal.Footer> : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
