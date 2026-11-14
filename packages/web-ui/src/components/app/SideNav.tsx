import type { ElementType, ReactNode } from 'react';

export type SideNavProps = {
  brand?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  'aria-label'?: string;
};

export function SideNav({ brand, footer, children, 'aria-label': label = 'Navegação principal' }: SideNavProps) {
  return (
    <nav className="ufba-nav" aria-label={label}>
      {brand ? <div className="ufba-nav__brand">{brand}</div> : null}
      <div className="ufba-nav__body">{children}</div>
      {footer ? <div className="ufba-nav__footer">{footer}</div> : null}
    </nav>
  );
}

export type SideNavGroupProps = { label: string; children: ReactNode };

export function SideNavGroup({ label, children }: SideNavGroupProps) {
  return (
    <section className="ufba-nav__section">
      <h2 className="ufba-nav__group">{label}</h2>
      <ul className="ufba-nav__list">{children}</ul>
    </section>
  );
}

export type SideNavItemProps = {
  href: string;
  icon?: ReactNode;
  count?: number | string;
  current?: boolean;
  /** Elemento do link, por exemplo o `Link` do Next.js. Padrão: `a`. */
  as?: ElementType;
  children: ReactNode;
};

export function SideNavItem({ href, icon, count, current, as: Comp = 'a', children }: SideNavItemProps) {
  return (
    <li className="ufba-nav__li">
      <Comp className="ufba-nav__item" href={href} aria-current={current ? 'page' : undefined}>
        {icon ? <span className="ufba-nav__icon" aria-hidden="true">{icon}</span> : null}
        <span className="ufba-nav__label">{children}</span>
        {count !== undefined ? <span className="ufba-nav__count">{count}</span> : null}
      </Comp>
    </li>
  );
}
