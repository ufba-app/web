import type { ReactNode } from 'react';
import { Button } from '../Button';
import { Chip } from '../Chip';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "4 nov", no fuso do navegador. */
export function formatDay(d: Date): string {
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

/** "usado há 2 h"; datas no futuro contam como agora. */
export function formatUsage(last: Date | undefined, now: Date): string {
  if (!last) return 'ainda não usado';
  const min = Math.floor((now.getTime() - last.getTime()) / 60_000);
  if (min < 1) return 'usado agora';
  if (min < 60) return `usado há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `usado há ${h} h`;
  const dias = Math.floor(h / 24);
  return `usado há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

export type AppRowProps = {
  name: string;
  logo?: ReactNode;
  verified?: boolean;
  returnDomain: string;
  authorizedAt: Date;
  lastUsedAt?: Date;
  onRevoke: () => void;
  /** Relógio injetável para testes. */
  now?: Date;
};

/** Um app em "Apps autorizados". Revogar só avisa; a confirmação fica num Dialog de quem usa. */
export function AppRow({ name, logo, verified = false, returnDomain, authorizedAt, lastUsedAt, onRevoke, now }: AppRowProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const agora = now ?? new Date();
  return (
    <article className="ufba-app-row">
      {logo ? (
        <span className="ufba-app-row__logo">{logo}</span>
      ) : (
        <span className="ufba-app-row__initial" aria-hidden="true">{initial}</span>
      )}
      <div className="ufba-app-row__info">
        <h3 className="ufba-app-row__name">
          <span>{name}</span>
          {verified ? <Chip tone="success">Verificado</Chip> : <Chip tone="warning">Não verificado</Chip>}
        </h3>
        <p className="ufba-app-row__meta" suppressHydrationWarning>
          Volta para <strong>{returnDomain}</strong> · autorizado em {formatDay(authorizedAt)} · {formatUsage(lastUsedAt, agora)}
        </p>
      </div>
      <Button variant="danger-text" size="sm" aria-label={`Revogar ${name}`} onPress={onRevoke}>
        Revogar
      </Button>
    </article>
  );
}
