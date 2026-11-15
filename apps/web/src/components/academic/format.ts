/** Número em pt-BR (vírgula decimal). `null` (o documento não trouxe) vira travessão. */
export function formatNumber(value: number | null, digits = 2): string {
  if (value === null) return '—';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export const formatHours = (value: number): string => `${value.toLocaleString('pt-BR')}h`;

/** Porcentagem inteira de `completed` sobre `required`, entre 0 e 100. Sem total exigido, 0. */
export function percentOf(completed: number, required: number): number {
  return required > 0 ? Math.min(100, Math.max(0, Math.round((completed / required) * 100))) : 0;
}

/** "3º semestre"; sem semestre, "Sem semestre". */
export const termLabel = (term: number | null): string => (term === null ? 'Sem semestre' : `${term}º semestre`);
