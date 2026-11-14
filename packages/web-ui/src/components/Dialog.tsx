import { Modal, useOverlayState } from '@heroui/react';
import type { ReactNode } from 'react';

export type DialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  /** Botões no rodapé, um embaixo do outro no celular. */
  actions: ReactNode;
};

/** Diálogo sobre a página (conectar SIGAA, conectar Moodle, confirmar revogação). Foco, Esc e véu vêm do HeroUI. */
export function Dialog({ isOpen, onOpenChange, icon, title, children, actions }: DialogProps) {
  const state = useOverlayState({ isOpen, onOpenChange });
  return (
    <Modal state={state}>
      <Modal.Backdrop className="ufba-dialog__backdrop">
        <Modal.Container placement="center" size="sm">
          <Modal.Dialog className="ufba-dialog">
            <Modal.Header className="ufba-dialog__head">
              {icon ? <span className="ufba-dialog__icon" aria-hidden="true">{icon}</span> : null}
              <Modal.Heading className="ufba-dialog__title">{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="ufba-dialog__body">{children}</Modal.Body>
            {actions ? <Modal.Footer className="ufba-dialog__actions">{actions}</Modal.Footer> : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
