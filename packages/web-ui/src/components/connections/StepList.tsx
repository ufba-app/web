import type { ReactNode } from 'react';

export type Step = { text: string; done?: boolean; action?: ReactNode };

export type StepListProps = { steps: Step[] };

/** Passo a passo numerado. Passos já feitos aparecem com check e não contam na numeração. */
export function StepList({ steps }: StepListProps) {
  let n = 0;
  return (
    <ol className="ufba-steps">
      {steps.map((step, i) => {
        if (!step.done) n += 1;
        return (
          <li key={i} className={step.done ? 'ufba-steps__item ufba-steps__item--done' : 'ufba-steps__item'}>
            <span className="ufba-steps__mark" aria-hidden={step.done ? undefined : 'true'}>
              {step.done ? (
                <>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <span className="ufba-visually-hidden">Feito</span>
                </>
              ) : (
                n
              )}
            </span>
            <span className="ufba-steps__text">{step.text}</span>
            {step.action}
          </li>
        );
      })}
    </ol>
  );
}
