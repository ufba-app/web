/** Famílias com fallback sem serifa. O app carrega os arquivos de fonte (ex.: next/font). */
export const font = {
  display: '"Sora", "Trebuchet MS", system-ui, sans-serif',
  body: '"Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif',
} as const;

export const fontWeight = {
  display: [600, 800],
  body: [500, 700, 800],
} as const;

export const fontSize = [12, 13, 14, 15, 19, 24, 32, 36, 76] as const;
