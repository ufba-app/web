import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

test('ordem de importação', () => {
  const imports = [...read('src/styles.css').matchAll(/@import "([^"]+)"/g)].map((m) => m[1]);
  expect(imports).toEqual([
    'tailwindcss',
    '@ufba-app/tokens/tokens.css',
    '@heroui/styles',
    './styles/theme.css',
    './styles/components.css',
  ]);
});

test('tema mapeia os tokens para as variáveis do HeroUI', () => {
  const t = read('src/styles/theme.css');
  for (const [hero, ufba] of [
    ['--background', '--ufba-background'],
    ['--foreground', '--ufba-foreground'],
    ['--accent', '--ufba-accent'],
    ['--accent-foreground', '--ufba-accent-foreground'],
    ['--success', '--ufba-success'],
    ['--danger', '--ufba-danger'],
    ['--border', '--ufba-border'],
    ['--muted', '--ufba-muted'],
    ['--radius', '--ufba-radius'],
  ]) {
    expect(t).toContain(`${hero}: var(${ufba});`);
  }
});

test('sobrescritas ficam em @layer components e não usam sombra', () => {
  const c = read('src/styles/components.css');
  expect(c.trim().startsWith('@layer components')).toBe(true);
  expect(c).not.toMatch(/box-shadow:(?!\s*none\s*;)/);
  for (const sel of ['.button--highlight', '.chip--highlight', '.card']) expect(c).toContain(sel);
});
