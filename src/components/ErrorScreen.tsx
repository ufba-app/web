import { AuthLayout, Button, Notice } from '@ufba-app/web-ui';
import type { ReactNode } from 'react';
import { AlertIcon } from './icons';

export type ErrorAction = { label: string; onPress: () => void };

export type ErrorScreenProps = {
  title: string;
  message: string;
  /** Aviso extra em linha, como "Por segurança, cada pedido vale por pouco tempo." */
  notice?: string;
  primary: ErrorAction;
  secondary?: ErrorAction;
  /** Código técnico para a pessoa informar, quando houver. */
  code?: string;
  children?: ReactNode;
};

/** Tela de erro das páginas fora do painel (pedido inválido, expirado, algo deu errado). Textos só como texto. */
export function ErrorScreen({ title, message, notice, primary, secondary, code, children }: ErrorScreenProps) {
  return (
    <AuthLayout headline="Seu semestre num lugar só." subline="Horário, prazos, notas e faltas, sempre atualizados.">
      <span className="web-error-icon" aria-hidden="true">
        <AlertIcon />
      </span>
      <h1>{title}</h1>
      <p className="web-muted">{message}</p>
      {notice ? <Notice tone="danger">{notice}</Notice> : null}
      {code ? (
        <p className="web-muted" style={{ fontSize: 13 }}>
          Código <strong>{code}</strong>
        </p>
      ) : null}
      {children}
      <div className="web-stack">
        <Button className="web-full" onPress={primary.onPress}>
          {primary.label}
        </Button>
        {secondary ? (
          <Button className="web-full" variant="outline" onPress={secondary.onPress}>
            {secondary.label}
          </Button>
        ) : null}
      </div>
    </AuthLayout>
  );
}
