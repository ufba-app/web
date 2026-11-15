import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

/**
 * Todo `:hover` do CSS do painel fica dentro de `@media (hover: hover) and (pointer: fine)`: no celular não existe
 * passar o mouse, e sem isso o toque deixa o elemento "preso" no estado de hover. (Mesma regra do design system,
 * `packages/web-ui/test/hover.test.ts`.)
 */
function unprotectedHovers(css: string): string[] {
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

test('todo :hover de src/styles.css está dentro de (hover: hover)', () => {
  expect(unprotectedHovers(readFileSync('src/styles.css', 'utf8')), ':hover fora de @media (hover: hover)').toEqual([]);
});
