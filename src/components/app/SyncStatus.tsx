import { useEffect, useState } from 'react';
import { Button } from '../Button';
import { formatSince } from './formatSince';

export type SyncStatusProps = {
  lastSync: Date | null;
  onRefresh: () => void;
  isRefreshing?: boolean;
  /** Relógio injetável para testes. Sem ele, o texto se atualiza a cada minuto. */
  now?: () => Date;
};

export function SyncStatus({ lastSync, onRefresh, isRefreshing = false, now }: SyncStatusProps) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (now) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [now]);

  const text = lastSync ? formatSince(lastSync, now ? now() : new Date()) : 'Ainda não sincronizado';

  return (
    <div className="ufba-sync">
      <span className="ufba-sync__text" aria-live="polite">
        {text}
      </span>
      <Button variant="outline" size="sm" isPending={isRefreshing} onPress={onRefresh}>
        {isRefreshing ? 'Atualizando' : 'Atualizar'}
      </Button>
    </div>
  );
}
