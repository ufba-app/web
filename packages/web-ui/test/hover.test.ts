import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

/**
 * Todo `:hover` do design system fica dentro de `@media (hover: hover) and (pointer: fine)`: no celular não existe
 * passar o mouse, e sem isso o toque deixa o elemento "preso" no estado de hover e a tela parece feita para PC.
 * (Os botões do HeroUI já vêm protegidos; este teste cobre o CSS nosso.)
 */
export function unprotectedHovers(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack: string[] = [];
  const found: string[] = [];
  let header = '';
  for (const ch of text) {
    if (ch === '{') {
      stack.push(header.trim());
      header = '';
    } else if (ch === '}') {
      const closing = stack.pop() ?? '';
      if (closing.includes(':hover') && !closing.startsWith('@') && !stack.some((h) => /^@media[^{]*hover:\s*hover/.test(h))) {
        found.push(closing.replace(/\s+/g, ' '));
      }
      header = '';
    } else if (ch === ';') {
      header = '';
    } else {
      header += ch;
    }
  }
  return found;
}

test('o detector de hover solto funciona', () => {
  expect(unprotectedHovers('.a:hover { color: red }')).toEqual(['.a:hover']);
  expect(unprotectedHovers('@media (hover: hover) and (pointer: fine) { .a:hover { color: red } }')).toEqual([]);
  expect(unprotectedHovers('@layer components { @media (hover: hover) { .a:hover, .b:hover { x: y } } }')).toEqual([]);
  expect(unprotectedHovers('@media (max-width: 800px) { .a:hover { x: y } }')).toEqual(['.a:hover']);
  expect(unprotectedHovers('/* .a:hover */ .b { x: y }')).toEqual([]);
});

test('todo :hover do CSS do design system está dentro de (hover: hover)', () => {
  const dir = resolve(__dirname, '../src/styles');
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.css'))) {
    const loose = unprotectedHovers(readFileSync(resolve(dir, file), 'utf8'));
    expect(loose, `${file}: :hover fora de @media (hover: hover)`).toEqual([]);
  }
});
