import { useId, useState, type ReactNode } from 'react';
import { Button } from '../Button';

export type AppShellProps = {
  sidebar: ReactNode;
  /** Conteúdo da barra superior no celular, como a marca e o avatar. */
  topBar?: ReactNode;
  children: ReactNode;
};

export function AppShell({ sidebar, topBar, children }: AppShellProps) {
  const [open, setOpen] = useState(false);
  const navId = useId();
  return (
    <div className="ufba-shell">
      <div className="ufba-shell__bar">
        <div className="ufba-shell__bar-content">{topBar}</div>
        <Button
          variant="outline"
          size="sm"
          aria-expanded={open}
          aria-controls={navId}
          onPress={() => setOpen((v) => !v)}
        >
          {open ? 'Fechar menu' : 'Abrir menu'}
        </Button>
      </div>
      <div id={navId} className="ufba-shell__nav" data-open={open ? 'true' : 'false'}>
        {sidebar}
      </div>
      <main className="ufba-shell__main">{children}</main>
    </div>
  );
}
