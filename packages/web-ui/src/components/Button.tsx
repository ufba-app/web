import { Button as HeroButton, type ButtonProps as HeroButtonProps } from '@heroui/react';

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'danger-text';

export type ButtonProps = Omit<HeroButtonProps, 'variant' | 'size'> & {
  /** `danger-text`: ação negativa (Recusar, Revogar), texto vermelho sem fundo. */
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
};

const join = (...c: Array<string | undefined>) => c.filter(Boolean).join(' ');

export function Button({ variant = 'primary', size = 'md', className, ...rest }: ButtonProps) {
  if (variant === 'danger-text') {
    return <HeroButton {...rest} variant="ghost" size={size} className={join('button--danger-text', className as string | undefined)} />;
  }
  return <HeroButton {...rest} variant={variant} size={size} className={className} />;
}
