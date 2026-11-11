import type { ReactNode } from 'react';

export type NoticeTone = 'info' | 'warning' | 'danger';

export type NoticeProps = { tone?: NoticeTone; icon?: ReactNode; children: ReactNode };

/** Aviso em linha. `danger` é anunciado como alerta; os outros são lidos na ordem normal. */
export function Notice({ tone = 'info', icon, children }: NoticeProps) {
  return (
    <div className={`ufba-notice ufba-notice--${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      {icon ? <span className="ufba-notice__icon" aria-hidden="true">{icon}</span> : null}
      <div className="ufba-notice__text">{children}</div>
    </div>
  );
}
