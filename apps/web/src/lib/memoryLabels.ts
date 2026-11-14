/** Sistema operacional como a pessoa lê. Valor desconhecido aparece como veio. */
export function osLabel(os: string | null | undefined): string {
  if (!os) return 'Sistema não informado';
  const key = os.trim().toLowerCase();
  if (key.startsWith('win')) return 'Windows';
  if (key === 'darwin' || key.startsWith('mac')) return 'macOS';
  if (key.startsWith('linux')) return 'Linux';
  return os;
}

export function installModeLabel(mode: string | null): string | null {
  if (mode === 'fresh') return 'Instalação nova';
  if (mode === 'profile') return 'Perfil ufba';
  return null;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const pad = (n: number) => String(n).padStart(2, '0');

/** "Último uso: há 2 h". Sem data: "Nunca usou". Data futura conta como agora. */
export function lastUsedLabel(last: Date | null, now: Date): string {
  if (!last) return 'Nunca usou';
  const diff = now.getTime() - last.getTime();
  if (diff < MIN) return 'Último uso: agora';
  if (diff < HOUR) return `Último uso: há ${Math.floor(diff / MIN)} min`;
  if (diff < DAY) return `Último uso: há ${Math.floor(diff / HOUR)} h`;
  const days = Math.floor(diff / DAY);
  if (days < 30) return `Último uso: há ${days} ${days === 1 ? 'dia' : 'dias'}`;
  return `Último uso: ${pad(last.getDate())}/${pad(last.getMonth() + 1)}/${last.getFullYear()}`;
}

export function dateLabel(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function timeLabel(date: Date): string {
  return `${dateLabel(date)} às ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Papel da pessoa no projeto. */
export function projectRoleLabel(role: 'owner' | 'read' | 'write'): string {
  if (role === 'owner') return 'Dono';
  if (role === 'write') return 'Escrita';
  return 'Leitura';
}

/** Nível de um convite ou membro. */
export function memberLevelLabel(level: 'read' | 'write'): string {
  return level === 'write' ? 'Escrita' : 'Leitura';
}

/** De onde vem o acesso ao projeto. */
export function projectSourceLabel(source: 'owner' | 'invite' | 'team'): string {
  if (source === 'owner') return 'Criado por você';
  if (source === 'invite') return 'Convite';
  return 'Time';
}

export function membersCountLabel(count: number): string {
  return count === 1 ? '1 membro' : `${count} membros`;
}
