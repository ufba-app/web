import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { border, color, font, fontSize, fontWeight, radius, space, touchTarget } from '../src';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export function toCss(): string {
  const lines = [
    ...Object.entries(color).map(([k, v]) => `  --ufba-${kebab(k)}: ${v};`),
    `  --ufba-font-display: ${font.display};`,
    `  --ufba-font-body: ${font.body};`,
    `  --ufba-radius: ${radius.base}px;`,
    `  --ufba-border-width: ${border.width}px;`,
    `  --ufba-touch-target: ${touchTarget}px;`,
  ];
  return `/* Gerado por @ufba-app/tokens. Não edite à mão. */\n:root {\n${lines.join('\n')}\n}\n`;
}

export function toJson() {
  return { color, font, fontWeight, fontSize, radius, border, space, touchTarget };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(resolve(dist, 'tokens.css'), toCss());
  writeFileSync(resolve(dist, 'tokens.json'), `${JSON.stringify(toJson(), null, 2)}\n`);
}
