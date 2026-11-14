const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Texto da última sincronização. Datas no futuro (relógio do servidor adiantado) contam como "agora".
 */
export function formatSince(last: Date, now: Date): string {
  const diff = now.getTime() - last.getTime();
  if (diff < MIN) return 'Sincronizado agora';
  if (diff < HOUR) return `Sincronizado há ${Math.floor(diff / MIN)} min`;
  if (diff < DAY) return `Sincronizado há ${Math.floor(diff / HOUR)} h`;
  return `Sincronizado em ${pad(last.getDate())}/${pad(last.getMonth() + 1)}`;
}
