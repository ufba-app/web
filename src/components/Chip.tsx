import { Chip as HeroChip } from '@heroui/react';
import type { ComponentProps } from 'react';

export type ChipTone = 'neutral' | 'highlight' | 'success' | 'danger' | 'solid';

export type ChipProps = Omit<ComponentProps<typeof HeroChip>, 'color' | 'variant'> & {
  /** `highlight` marca o que é agora ou está no limite. */
  tone?: ChipTone;
};

const map = {
  neutral: { color: 'default', variant: 'secondary' },
  highlight: { color: 'warning', variant: 'soft', className: 'chip--highlight' },
  success: { color: 'success', variant: 'soft' },
  danger: { color: 'danger', variant: 'soft' },
  solid: { color: 'accent', variant: 'primary' },
} as const satisfies Record<ChipTone, { color: string; variant: string; className?: string }>;

export function Chip({ tone = 'neutral', className, ...rest }: ChipProps) {
  const m = map[tone];
  const cls = [('className' in m ? m.className : undefined), className].filter(Boolean).join(' ') || undefined;
  return <HeroChip {...rest} color={m.color} variant={m.variant} className={cls} />;
}
