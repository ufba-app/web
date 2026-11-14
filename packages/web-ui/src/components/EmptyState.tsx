import type { ReactNode } from 'react';

export type EmptyStateProps = { title: string; description?: string; action?: ReactNode };

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="ufba-empty">
      <h2 className="ufba-empty__title">{title}</h2>
      {description ? <p className="ufba-empty__description">{description}</p> : null}
      {action}
    </div>
  );
}
