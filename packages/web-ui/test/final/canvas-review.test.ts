import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Correções aprovadas no canvas em 11/11/2026, depois da revisão com a skill de design.
const css = (f: string) => readFileSync(resolve(__dirname, '../../src/styles', f), 'utf8');
const block = (c: string, sel: string) => {
  const i = c.indexOf(`${sel} {`);
  return i < 0 ? '' : c.slice(i, c.indexOf('}', i));
};

test('conteúdo do painel numa coluna só: cabeçalho e cartões com a mesma borda direita', () => {
  expect(block(css('app.css'), '.ufba-shell__main > *')).toMatch(/max-width: var\(--ufba-content-width\)/);
  expect(css('app.css')).toContain('--ufba-content-width: 900px');
});

test('anel decorativo longe das pílulas das fontes', () => {
  const b = block(css('auth.css'), '.ufba-auth__shape--ring');
  expect(b).toContain('right: -90px');
  expect(b).toContain('bottom: -130px');
});

test('botão pequeno com alvo de toque de 44px', () => {
  expect(block(css('components.css'), '.button--sm')).toContain('min-height: var(--ufba-touch-target)');
});

test('botões são pílula', () => {
  expect(block(css('components.css'), '.button')).toContain('border-radius: 9999px');
});

test('no celular: e-mail da conta numa linha e cartão de app alinhado ao topo', () => {
  const conn = css('connections.css');
  const app = css('app.css');
  expect(conn).toMatch(/@media \(max-width: 819\.98px\)[\s\S]*\.ufba-account__text \{\s*flex-basis: 100%;/);
  expect(app).toMatch(/@media \(max-width: 819\.98px\)[\s\S]*\.ufba-app-row \{[^}]*align-items: flex-start;/);
});

test('diálogo com os botões empilhados', () => {
  expect(block(css('connections.css'), '.ufba-dialog__actions')).toContain('flex-direction: column');
});
