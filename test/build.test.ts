import { expect, test } from 'vitest';
import { color } from '../src';
import { toCss, toJson } from '../scripts/build';

test('CSS e JSON gerados batem com a fonte', () => {
  const css = toCss();
  expect(css).toContain('--ufba-highlight: #ffc93c;');
  expect(css).toContain('--ufba-surface-soft: #eef1fb;');
  expect(css).toContain('--ufba-radius: 20px;');
  const json = toJson();
  for (const [k, v] of Object.entries(color)) expect(json.color[k as keyof typeof color]).toBe(v);
});
