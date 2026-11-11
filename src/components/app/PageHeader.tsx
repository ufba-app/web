import type { ReactNode } from 'react';

export type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Informação ao lado do título, como um contador. */
  aside?: ReactNode;
};

export function PageHeader({ title, description, actions, aside }: PageHeaderProps) {
  return (
    <header className="ufba-page-header">
      <div className="ufba-page-header__text">
        <h1 className="ufba-page-header__title">{title}</h1>
        {description ? <p className="ufba-page-header__description">{description}</p> : null}
      </div>
      {aside ? <div className="ufba-page-header__aside">{aside}</div> : null}
      {actions ? <div className="ufba-page-header__actions">{actions}</div> : null}
    </header>
  );
}
