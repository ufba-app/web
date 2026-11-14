import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isPanelPath, PANEL_EXACT_PATHS, PANEL_PREFIXES } from './panelPaths';

describe('isPanelPath', () => {
  it.each(['/', '/schedule', '/deadlines', '/grades', '/connections', '/authorized-apps', '/device', '/memory/computers', '/memory/projects', '/memory/admin'])('%s é do painel', (path) => {
    expect(isPanelPath(path)).toBe(true);
  });

  it('subrotas e barra final também', () => {
    expect(isPanelPath('/connections/moodle/capture')).toBe(true);
    expect(isPanelPath('/connections/')).toBe(true);
    expect(isPanelPath('/authorized-apps/x')).toBe(true);
    expect(isPanelPath('/device/')).toBe(true);
    expect(isPanelPath('/memory/projects/proj-1')).toBe(true);
    expect(isPanelPath('/memory/projects/')).toBe(true);
  });

  it.each(['/sign-in', '/sign-in/callback', '/authorize', '/authorize/error', '/error', '/qualquer-coisa', '/connectionsx', '/memory', '/memory/other'])(
    '%s não é do painel',
    (path) => {
      expect(isPanelPath(path)).toBe(false);
    },
  );
});

describe('regra @panel do Caddyfile', () => {
  const caddyfile = readFileSync('Caddyfile', 'utf8');
  const matcher = caddyfile.match(/@panel path ([^\n]+)/)?.[1]?.split(/\s+/) ?? [];

  it('lista exatamente as rotas do painel e reescreve para o shell.html', () => {
    const expected = [...PANEL_EXACT_PATHS, ...PANEL_PREFIXES.map((prefix) => `${prefix}/*`)];
    expect([...matcher].sort()).toEqual([...expected].sort());
    expect(caddyfile).toMatch(/rewrite @panel \/shell\.html/);
  });
});

describe('shell.html (flash do painel antes do JavaScript)', () => {
  const html = readFileSync('shell.html', 'utf8');

  it('não tem atributo style nem script inline (a CSP de produção não deixa)', () => {
    expect(html).not.toMatch(/\sstyle\s*=/i);
    const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1] ?? '');
    expect(scripts.length).toBeGreaterThan(0);
    for (const attrs of scripts) expect(attrs).toMatch(/\ssrc=/);
  });

  it('é genérico: sem rótulos do menu e sem item destacado', () => {
    expect(html).not.toMatch(/aria-current/);
    for (const label of ['Painel', 'Horário', 'Prazos', 'Notas e faltas', 'Conexões', 'Apps autorizados', 'Sair']) {
      expect(html.replace(/<!--[\s\S]*?-->/g, '')).not.toContain(label);
    }
    expect(html.match(/web-sk--nav/g)).toHaveLength(4);
  });

  it('só usa classes do design system que existem nele (evita desvio da moldura real)', () => {
    // Confere contra o que o pacote entrega: CSS (regras) e JS (classes que os componentes colocam no HTML, mesmo
    // quando são só ganchos sem regra, como `ufba-shell__bar-content`).
    const root = 'node_modules/@ufba-app/web-ui/dist';
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(css|js)$/.test(name)) sources.push(readFileSync(path, 'utf8'));
      }
    };
    walk(root);
    const all = sources.join('\n');
    const classes = new Set([...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/class="([^"]+)"/g)].flatMap((m) => (m[1] ?? '').split(/\s+/)));
    const fromDesignSystem = [...classes].filter((name) => name.startsWith('ufba-'));
    expect(fromDesignSystem.length).toBeGreaterThan(5);
    for (const name of fromDesignSystem) expect(all, `classe .${name} não existe no design system`).toContain(name);
  });
});
