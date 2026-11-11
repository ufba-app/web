export type ColorToken =
  | 'background' | 'foreground' | 'accent' | 'accentForeground'
  | 'highlight' | 'highlightForeground' | 'muted' | 'surfaceSoft' | 'border'
  | 'success' | 'successSoft' | 'danger' | 'dangerSoft'
  | 'warning' | 'warningSoft' | 'page' | 'cardBorder';

/** Paleta do tema claro. O amarelo (highlight) nunca é cor de texto; o vermelho (danger) só em erro. */
export const color: Record<ColorToken, string> = {
  background: '#ffffff',
  foreground: '#1b2a7a',
  accent: '#1b2a7a',
  accentForeground: '#ffffff',
  highlight: '#ffc93c',
  highlightForeground: '#1b2a7a',
  muted: '#4d5680',
  surfaceSoft: '#eef1fb',
  border: '#dfe3f0',
  success: '#146c43',
  successSoft: '#e3f6ec',
  danger: '#b3261e',
  dangerSoft: '#fde8e6',
  /** Alerta (espera, atenção). O amarelo da marca (highlight) não é cor de estado. */
  warning: '#8a5a00',
  warningSoft: '#fff1cc',
  /** Fundo das páginas, um tom abaixo do branco dos cartões. */
  page: '#e3e8f6',
  cardBorder: '#d3d9ec',
};
