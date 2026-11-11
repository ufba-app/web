import { Chip as HeroChip } from '@heroui/react';
import type { ComponentProps } from 'react';

export type ChipTone = 'neutral' | 'highlight' | 'success' | 'warning' | 'danger' | 'solid';

export type ChipProps = Omit<ComponentProps<typeof HeroChip>, 'color' | 'variant'> & {
  /** `highlight` (amarelo da marca) só para informação do app; estados usam success, warning e danger. */
  tone?: ChipTone;
};

const map = {
  neutral: { color: 'default', variant: 'secondary' },
  highlight: { color: 'warning', variant: 'soft', className: 'chip--highlight' },
  success: { color: 'success', variant: 'soft' },
  warning: { color: 'warning', variant: 'soft', className: 'chip--warning' },
  danger: { color: 'danger', variant: 'soft' },
  solid: { color: 'accent', variant: 'primary' },
} as const satisfies Record<ChipTone, { color: string; variant: string; className?: string }>;

export function Chip({ tone = 'neutral', className, ...rest }: ChipProps) {
  const m = map[tone];
  const cls = [('className' in m ? m.className : undefined), className].filter(Boolean).join(' ') || undefined;
  return <HeroChip {...rest} color={m.color} variant={m.variant} className={cls} />;
}
