import { readFileSync } from 'node:fs';

// Os testes rodam em apps/web (mesmo cwd do panelPaths.test.ts).
const panel = readFileSync('Caddyfile', 'utf8');
const auth = readFileSync('Caddyfile.auth', 'utf8');

function csp(file: string): string {
  return file.match(/Content-Security-Policy "([^"]+)"/)?.[1] ?? '';
}

describe('redirect temporário do ufba.app (Caddyfile do painel)', () => {
  it('manda o host ufba.app para a origem do painel com 301, preservando caminho e query', () => {
    expect(panel).toMatch(/@legacyhost host ufba\.app\b/);
    expect(panel).toMatch(/redir @legacyhost \{\$VITE_PANEL_ORIGIN\}\{uri\} 301/);
  });

  it('vem antes de servir arquivos (o redirect não pode cair no fallback do React Router)', () => {
    expect(panel.indexOf('redir @legacyhost')).toBeGreaterThan(-1);
    expect(panel.indexOf('redir @legacyhost')).toBeLessThan(panel.indexOf('file_server'));
  });

  it('não escreve a origem do painel no arquivo: o destino vem da variável', () => {
    expect(panel).not.toMatch(/redir[^\n]*meu\.ufba\.app/);
  });
});

describe('CSP de produção', () => {
  it.each([
    ['painel', panel],
    ['auth', auth],
  ])('%s não cita a origem do painel nem o domínio do painel (só a API)', (_name, file) => {
    const policy = csp(file);
    expect(policy).not.toBe('');
    expect(policy).not.toMatch(/meu\.ufba\.app/);
    expect(policy).not.toMatch(/https:\/\/ufba\.app\b/);
    expect(policy).toContain('https://api.ufba.app');
  });
});
