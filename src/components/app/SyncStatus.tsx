import { useEffect, useRef, useState } from 'react';
import { Button } from '../Button';
import { formatSince } from './formatSince';

export type SyncStatusProps = {
  lastSync: Date | null;
  onRefresh: () => void;
  isRefreshing?: boolean;
  /** Relógio injetável, só para testes. Sem ele, o texto se atualiza a cada minuto. */
  now?: () => Date;
};

export function SyncStatus({ lastSync, onRefresh, isRefreshing = false, now }: SyncStatusProps) {
  // O relógio só é lido depois de montar: o HTML do servidor não pode depender da hora nem do fuso.
  const [current, setCurrent] = useState<Date | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const wasRefreshing = useRef(isRefreshing);

  useEffect(() => {
    const read = () => setCurrent(now ? now() : new Date());
    read();
    if (now) return undefined;
    const id = setInterval(read, 60_000);
    return () => clearInterval(id);
  }, [now]);

  // Anuncia só o fim de uma atualização, não a troca do texto a cada minuto.
  useEffect(() => {
    if (wasRefreshing.current && !isRefreshing) setAnnouncement('Sincronização concluída');
    if (isRefreshing) setAnnouncement('');
    wasRefreshing.current = isRefreshing;
  }, [isRefreshing]);

  let text = 'Ainda não sincronizado';
  if (lastSync) text = current ? formatSince(lastSync, current) : 'Sincronizado';

  return (
    <div className="ufba-sync">
      <span className="ufba-sync__text">{text}</span>
      <span role="status" className="ufba-visually-hidden">
        {announcement}
      </span>
      <Button variant="outline" size="sm" isPending={isRefreshing} onPress={onRefresh}>
        {isRefreshing ? 'Atualizando' : 'Atualizar'}
      </Button>
    </div>
  );
}
