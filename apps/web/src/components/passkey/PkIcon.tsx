import './passkey.css';
import type { ReactNode } from 'react';

export type PkTone = 'primary' | 'soft' | 'ok' | 'err' | 'warn';

/** Círculo com um ícone: o selo das telas de "liberar com o celular". `ring` desenha o anel de "esperando a digital". */
export function PkIcon({ tone = 'primary', size = 'lg', ring = false, children }: { tone?: PkTone; size?: 'sm' | 'md' | 'lg'; ring?: boolean; children: ReactNode }) {
  const classes = ['web-pk-icon', `web-pk-icon--${tone}`, `web-pk-icon--${size}`, ring ? 'web-pk-icon--ring' : ''].filter(Boolean).join(' ');
  return (
    <span className={classes} aria-hidden="true">
      {children}
    </span>
  );
}
