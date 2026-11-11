import { Button as HeroButton, type ButtonProps as HeroButtonProps } from '@heroui/react';

export type ButtonVariant = 'primary' | 'outline' | 'highlight' | 'ghost' | 'danger';

export type ButtonProps = Omit<HeroButtonProps, 'variant' | 'size'> & {
  /** `highlight` é o botão amarelo do ufba.app; use para a ação ligada a algo urgente. */
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
};

const join = (...c: Array<string | undefined>) => c.filter(Boolean).join(' ');

export function Button({ variant = 'primary', size = 'md', className, ...rest }: ButtonProps) {
  if (variant === 'highlight') {
    return <HeroButton {...rest} variant="primary" size={size} className={join('button--highlight', className as string | undefined)} />;
  }
  return <HeroButton {...rest} variant={variant} size={size} className={className} />;
}
