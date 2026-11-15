import { useEffect, useId, useState, type MouseEvent, type ReactNode } from 'react';
import { Button } from '../Button';

export type AppShellProps = {
  sidebar: ReactNode;
  /** Conteúdo da barra superior no celular, como a marca e o avatar. */
  topBar?: ReactNode;
  /** Navegação do celular (`MobileNav`). Com ela, o botão de menu da barra some e a barra de baixo assume. */
  mobileNav?: ReactNode;
  children: ReactNode;
};

export function AppShell({ sidebar, topBar, mobileNav, children }: AppShellProps) {
  const [open, setOpen] = useState(false);
  const navId = useId();

  // Esc fecha o menu do celular.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Escolher um link fecha o menu: com roteamento no cliente a casca continua montada.
  const onNavClick = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('a')) setOpen(false);
  };

  return (
    <div className={mobileNav ? 'ufba-shell ufba-shell--mobile-nav' : 'ufba-shell'}>
      <div className="ufba-shell__bar">
        <div className="ufba-shell__bar-content">{topBar}</div>
        {mobileNav ? null : (
          <Button
            variant="outline"
            size="sm"
            aria-expanded={open}
            aria-controls={navId}
            onPress={() => setOpen((v) => !v)}
          >
            {open ? 'Fechar menu' : 'Abrir menu'}
          </Button>
        )}
      </div>
      <div id={navId} className="ufba-shell__nav" data-open={open ? 'true' : 'false'} onClick={onNavClick}>
        {sidebar}
      </div>
      <main className="ufba-shell__main">{children}</main>
      {mobileNav}
    </div>
  );
}
