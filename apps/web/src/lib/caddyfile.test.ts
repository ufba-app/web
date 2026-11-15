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

describe('redirect de quem não tem sessão (cookie marcador ufba_signed_in)', () => {
  const block = panel.match(/@nosession \{([^}]+)\}/)?.[1] ?? '';
  const paths = block.match(/^\s*path ([^\n]+)/m)?.[1]?.split(/\s+/) ?? [];
  const cookiePattern = block.match(/not header_regexp Cookie "([^"]+)"/)?.[1] ?? '';

  it('cobre exatamente as rotas do painel (a mesma lista de @panel) e exclui a captura do Moodle', () => {
    const panelPaths = panel.match(/@panel path ([^\n]+)/)?.[1]?.split(/\s+/) ?? [];
    expect(paths.length).toBeGreaterThan(0);
    expect([...paths].sort()).toEqual([...panelPaths].sort());
    expect(block).toMatch(/not path \/connections\/moodle\/capture/);
  });

  it('/pair (a página que o celular abre pelo QR) fica FORA: redirecionar quem chega sem login perderia a chave do fragmento', () => {
    expect(paths).not.toContain('/pair');
    expect(paths.some((path) => path.startsWith('/pair'))).toBe(false);
    expect(panel.match(/@panel path ([^\n]+)/)?.[1]).not.toContain('/pair');
  });

  it('manda para o login no auth com 302 (nunca 301) levando só o caminho em return', () => {
    expect(panel).toMatch(/redir @nosession \{\$VITE_AUTH_ORIGIN\}\/sign-in\?return=\{http\.request\.uri\.path\} 302/);
    expect(panel).not.toMatch(/redir @nosession[^\n]*(301|auth\.ufba\.app)/);
  });

  it('vem antes do rewrite do shell e do file_server', () => {
    const at = panel.indexOf('redir @nosession');
    expect(at).toBeGreaterThan(panel.indexOf('redir @legacyhost'));
    expect(at).toBeLessThan(panel.indexOf('rewrite @panel'));
    expect(at).toBeLessThan(panel.indexOf('file_server'));
  });

  it('o regexp reconhece o marcador e só ele', () => {
    const marker = new RegExp(cookiePattern);
    expect(cookiePattern).not.toBe('');
    for (const header of ['ufba_signed_in=1', 'a=b; ufba_signed_in=1', 'ufba_signed_in=1; a=b', 'a=b;ufba_signed_in=1;c=d']) {
      expect(marker.test(header)).toBe(true);
    }
    for (const header of ['', 'a=b', 'xufba_signed_in=1', 'ufba_signed_in=0', 'ufba_signed_in=10', '__Host-ufba_session=abc', 'a=ufba_signed_in=1']) {
      expect(marker.test(header)).toBe(false);
    }
  });
});

describe('healthcheck do Railway (/healthz)', () => {
  it('responde 200 sem corpo e sem cache, num handle próprio antes de qualquer redirect e do fallback', () => {
    const health = panel.match(/handle \/healthz \{([^}]+)\}/)?.[1] ?? '';
    expect(health).toMatch(/respond 200\b/);
    expect(health).toMatch(/Cache-Control "no-store"/);
    const at = panel.indexOf('handle /healthz');
    expect(at).toBeGreaterThan(-1);
    // Os redirects e o try_files ficam no handle seguinte, para o /healthz não ser reescrito nem redirecionado.
    expect(at).toBeLessThan(panel.indexOf('redir @legacyhost'));
    expect(at).toBeLessThan(panel.indexOf('redir @nosession'));
    expect(at).toBeLessThan(panel.indexOf('try_files {path}'));
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
