import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { color, font, radius } from '../src';
import { toCss } from '../scripts/build';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const dist = (p: string) => resolve(__dirname, '../dist', p);

test('CSS gerado traz todas as cores, fontes e o raio', () => {
  const css = toCss();
  for (const [k, v] of Object.entries(color)) expect(css).toContain(`--ufba-${kebab(k)}: ${v};`);
  expect(css).toContain(`--ufba-font-display: ${font.display};`);
  expect(css).toContain(`--ufba-font-body: ${font.body};`);
  expect(css).toContain(`--ufba-radius: ${radius.base}px;`);
});

test.skipIf(!existsSync(dist('tokens.json')))('arquivos gerados no dist batem com a fonte', () => {
  const json = JSON.parse(readFileSync(dist('tokens.json'), 'utf8'));
  expect(json.color).toEqual(color);
  expect(json.font).toEqual(font);
  const css = readFileSync(dist('tokens.css'), 'utf8');
  for (const [k, v] of Object.entries(color)) expect(css).toContain(`--ufba-${kebab(k)}: ${v};`);
});
