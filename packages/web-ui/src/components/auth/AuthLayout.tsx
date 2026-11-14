import type { ReactNode } from 'react';
import { ServiceIcon, serviceName, type Service } from './ServiceIcon';

export type AuthLayoutProps = {
  headline: ReactNode;
  subline?: ReactNode;
  sources?: Array<Exclude<Service, 'google'>>;
  /** Conteúdo do cartão. */
  children: ReactNode;
  /** Linha logo abaixo do cartão, fora dele (ex.: a conta em uso). */
  below?: ReactNode;
};

/**
 * Casca das telas fora do painel (entrar, autorizar app, erro de autorização):
 * bloco marinho com a marca à esquerda e o cartão à direita. Abaixo de 820px, só o cartão.
 */
export function AuthLayout({ headline, subline, sources = [], children, below }: AuthLayoutProps) {
  return (
    <div className="ufba-auth">
      <section className="ufba-auth__brand" aria-label="ufba.app">
        <span className="ufba-auth__shape ufba-auth__shape--sun" aria-hidden="true" />
        <span className="ufba-auth__shape ufba-auth__shape--ring" aria-hidden="true" />
        <span className="ufba-auth__shape ufba-auth__shape--dot" aria-hidden="true" />
        <p className="ufba-auth__logo">ufba.app</p>
        <div className="ufba-auth__thesis">
          <p className="ufba-auth__headline">{headline}</p>
          {subline ? <p className="ufba-auth__subline">{subline}</p> : null}
        </div>
        {sources.length > 0 ? (
          <ul className="ufba-auth__sources">
            {sources.map((s) => (
              <li key={s}>
                <span className="ufba-auth__source-icon">
                  <ServiceIcon service={s} size={20} />
                </span>
                {serviceName[s]}
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
      </section>
      <main className="ufba-auth__main">
        <p className="ufba-auth__logo ufba-auth__logo--mobile">ufba.app</p>
        <div className="ufba-auth__column">
          <div className="ufba-auth__card">{children}</div>
          {below ? <div className="ufba-auth__below">{below}</div> : null}
        </div>
      </main>
    </div>
  );
}
