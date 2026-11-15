import type { ElementType, ReactNode } from 'react';

export type LaunchButtonProps = {
  label: string;
  /** Logo do serviço, dentro do quadradinho branco à esquerda. */
  logo: ReactNode;
  /** `sidebar`: compacto, na barra lateral. `sheet`: largo, na folha do celular. */
  placement?: 'sidebar' | 'sheet';
  /** `attention`: amarelo, para pedir uma ação (reconectar). */
  tone?: 'primary' | 'attention';
  /** Ícone da direita: `external` (abre outra aba) ou `chevron` (navega dentro do app). */
  trailing?: 'external' | 'chevron';
  /** Com `onPress` vira um botão; com `href`, um link. */
  onPress?: () => void;
  isPending?: boolean;
  href?: string;
  /** Elemento do link, por exemplo o `Link` do roteador. Padrão: `a`. */
  as?: ElementType;
};

const ICONS = {
  external: (
    <>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
};

/**
 * Botão de um serviço externo (como o SIGAA): logo, rótulo e um ícone à direita. Fica logo abaixo da marca na lateral
 * do painel e entre o perfil e o menu na folha do celular.
 */
export function LaunchButton({
  label,
  logo,
  placement = 'sidebar',
  tone = 'primary',
  trailing = 'external',
  onPress,
  isPending,
  href,
  as: Comp = 'a',
}: LaunchButtonProps) {
  const className = `ufba-launch ufba-launch--${placement}${tone === 'attention' ? ' ufba-launch--attention' : ''}`;
  const content = (
    <>
      <span className="ufba-launch__logo" aria-hidden="true">
        {logo}
      </span>
      <span className="ufba-launch__label">{label}</span>
      <span className="ufba-launch__go" aria-hidden="true">
        <svg viewBox="0 0 24 24">{ICONS[trailing]}</svg>
      </span>
    </>
  );

  if (onPress) {
    return (
      <button type="button" className={className} onClick={onPress} aria-busy={isPending || undefined} disabled={isPending}>
        {content}
      </button>
    );
  }
  return (
    <Comp className={className} href={href}>
      {content}
    </Comp>
  );
}
