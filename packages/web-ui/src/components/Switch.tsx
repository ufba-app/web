import { Switch as HeroSwitch, type SwitchRootProps } from '@heroui/react';
import type { ReactNode } from 'react';

export type SwitchProps = Omit<SwitchRootProps, 'children'> & {
  /**
   * Texto visível ao lado do interruptor. Sem ele, passe `aria-label`: todo interruptor precisa de nome acessível.
   */
  children?: ReactNode;
};

/**
 * Interruptor (liga/desliga). `isSelected` e `onChange` controlam o estado; `isDisabled` o desativa. Sobre o Switch do
 * HeroUI (react-aria), que já cuida de teclado (espaço), foco e `role="switch"`.
 * No HeroUI v3 o elemento clicável é o `Switch.Content`: o controle (trilho e botão) vai DENTRO dele, junto do texto.
 */
export function Switch({ children, ...rest }: SwitchProps) {
  return (
    <HeroSwitch {...rest}>
      <HeroSwitch.Content>
        <HeroSwitch.Control>
          <HeroSwitch.Thumb />
        </HeroSwitch.Control>
        {children}
      </HeroSwitch.Content>
    </HeroSwitch>
  );
}
