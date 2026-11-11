import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const require = createRequire(import.meta.url);

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

test('ordem de importação', () => {
  const imports = [...read('src/styles.css').matchAll(/@import "([^"]+)"/g)].map((m) => m[1]);
  expect(imports).toEqual([
    'tailwindcss',
    '@ufba-app/tokens/tokens.css',
    '@heroui/styles',
    './styles/theme.css',
    './styles/components.css',
    './styles/app.css',
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

const heroCss = (() => {
  const dir = resolve(require.resolve('@heroui/styles/package.json'), '../dist/components');
  return readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(resolve(dir, f), 'utf8')).join('\n');
})();

const block = (css: string, selector: string) => {
  const i = css.indexOf(`${selector} {`);
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
};

test('botão amarelo define as variáveis do HeroUI para todos os estados', () => {
  const b = block(read('src/styles/components.css'), '.button--highlight');
  for (const v of ['--button-bg:', '--button-bg-hover:', '--button-bg-pressed:', '--button-fg:']) expect(b).toContain(v);
});

test('checkbox não herda o raio de 20px', () => {
  expect(block(read('src/styles/components.css'), '.checkbox__control')).toMatch(/border-radius:\s*6px/);
});

test('regras globais do tema ficam em @layer base e não desenham contorno próprio', () => {
  const t = read('src/styles/theme.css');
  const outside = t.replace(/@layer base\s*\{[\s\S]*\n\}\n?/, '');
  expect(outside).not.toMatch(/:where\(h1|:focus-visible|@media \(prefers-reduced-motion/);
  expect(t).not.toMatch(/outline:/);
});

test('toda classe sobrescrita existe no HeroUI 3.2.7', () => {
  const ours = new Set(['.button--highlight', '.chip--highlight']);
  const selectors = [...read('src/styles/components.css').matchAll(/(\.[a-z][a-z0-9_-]*)/g)].map((m) => m[1] ?? '');
  for (const s of new Set(selectors)) if (!ours.has(s)) expect(heroCss, s).toContain(s);
});
