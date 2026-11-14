import type { ReactNode } from 'react';

export type SourceCardProps = {
  icon: ReactNode;
  title: string;
  description: string;
  /** Selo de estado (ex.: Conectado). */
  status?: ReactNode;
  /** Ação principal (ex.: Conectar, Digitar senha). */
  action?: ReactNode;
  /** Conteúdo abaixo do cabeçalho (ex.: lista de contas). */
  children?: ReactNode;
};

/** Cartão de uma fonte em Conexões: SIGAA, Moodle ou Classroom. */
export function SourceCard({ icon, title, description, status, action, children }: SourceCardProps) {
  return (
    <article className="ufba-source">
      <div className="ufba-source__head">
        <span className="ufba-source__icon" aria-hidden="true">{icon}</span>
        <div className="ufba-source__text">
          <h3 className="ufba-source__title">{title}</h3>
          <p className="ufba-source__description">{description}</p>
        </div>
        {status || action ? (
          <div className="ufba-source__side">
            {status}
            {action}
          </div>
        ) : null}
      </div>
      {children ? <div className="ufba-source__body">{children}</div> : null}
    </article>
  );
}
