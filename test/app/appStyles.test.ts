import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, '../../src/styles/app.css'), 'utf8');
const block = (selector: string) => {
  const i = css.indexOf(`${selector} {`);
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
};

test('links da navegação têm foco visível de 2px marinho com afastamento', () => {
  const b = block('.ufba-nav__item:focus-visible');
  expect(b).toMatch(/outline:\s*2px solid var\(--ufba-accent\)/);
  expect(b).toMatch(/outline-offset:\s*2px/);
});

test('a casca ocupa a altura da tela', () => {
  expect(block('.ufba-shell')).toMatch(/min-height:\s*100dvh/);
});
