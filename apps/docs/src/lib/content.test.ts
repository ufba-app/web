import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildContent } from './build-content';
import { fetchPublicPages, isSafePagePath, MemoryError, type MemoryOptions } from './memory-client';
import remarkSafe, { isSafeUrl } from './remark-safe';
import { toContentFile } from './render-page';
import { scanForSecrets } from './secret-scan';

const KEY = 'chave-de-teste-memory-123456';

type Page = { path: string; title?: string; tags?: string[]; body?: string; updated_at?: string; extra?: Record<string, unknown> };

/** memory simulado: lista (sem tags) e páginas (com frontmatter.tags), exigindo o Bearer certo. */
function fakeMemory(pages: Page[], opts: { listStatus?: number; failPage?: string } = {}) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
    if (auth !== `Bearer ${KEY}`) return new Response('{"error":"unauthorized"}', { status: 401 });
    const base = 'https://memory.test/api/v1/workspaces/ufba-app/projects/docs/pages';
    if (url === base) {
      if (opts.listStatus) return new Response('{}', { status: opts.listStatus });
      return Response.json(pages.map((p) => ({ path: p.path, title: p.title ?? p.path, updated_at: p.updated_at ?? null })));
    }
    const path = decodeURIComponent(url.slice(base.length + 1));
    if (path === opts.failPage) return new Response('x', { status: 503 });
    const page = pages.find((p) => p.path === path);
    if (!page) return new Response('{}', { status: 404 });
    return Response.json({
      path,
      title: page.title ?? '',
      updated_at: page.updated_at ?? null,
      frontmatter: { tags: page.tags ?? [], ...page.extra },
      body_markdown: page.body ?? '# Oi\n\ntexto',
      links: [],
    });
  }) as typeof fetch;
  return { impl, calls };
}

const options = (impl: typeof fetch, extra: Partial<MemoryOptions> = {}): MemoryOptions => ({
  baseUrl: 'https://memory.test/',
  workspace: 'ufba-app',
  project: 'docs',
  key: KEY,
  fetchImpl: impl,
  ...extra,
});

describe('cliente do memory', () => {
  it('só traz páginas com a tag public e manda o Bearer', async () => {
    const memory = fakeMemory([
      { path: 'guides/sigaa.md', title: 'SIGAA', tags: ['public', 'x'] },
      { path: 'decisions/0007-db.md', tags: ['adr'] },
      { path: 'rascunho.md', tags: ['publico'] },
      { path: 'sem-tags.md' },
    ]);
    const { pages, listed } = await fetchPublicPages(options(memory.impl));
    expect(listed).toBe(4);
    expect(pages.map((p) => p.path)).toEqual(['guides/sigaa.md']);
    expect(memory.calls).toContain('https://memory.test/api/v1/workspaces/ufba-app/projects/docs/pages/guides/sigaa.md');
  });

  it('sem chave, não chama o memory', async () => {
    const memory = fakeMemory([]);
    await expect(fetchPublicPages(options(memory.impl, { key: '  ' }))).rejects.toThrow(/MEMORY_DOCS_KEY ausente/);
    expect(memory.calls).toEqual([]);
  });

  it('projeto inexistente (404), chave errada (401) e memory fora do ar (5xx) falham sem vazar a chave', async () => {
    const missing = fakeMemory([], { listStatus: 404 });
    await expect(fetchPublicPages(options(missing.impl))).rejects.toThrow(/não existe/);
    await expect(fetchPublicPages(options(missing.impl, { key: 'outra-chave-qualquer' }))).rejects.toThrow(/HTTP 401/);
    const down = fakeMemory([{ path: 'a.md', tags: ['public'] }], { failPage: 'a.md' });
    const error = await fetchPublicPages(options(down.impl)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MemoryError);
    expect(String((error as Error).message)).toMatch(/fora do ar/);
    expect(String((error as Error).message)).not.toContain(KEY);
  });

  it('erro de rede não carrega detalhes do pedido', async () => {
    const boom = (async () => {
      throw new Error(`falhou com Authorization: Bearer ${KEY}`);
    }) as typeof fetch;
    const error = await fetchPublicPages(options(boom)).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/fora do ar/);
    expect((error as Error).message).not.toContain(KEY);
  });

  it('formato inesperado derruba o build', async () => {
    const weird = (async () => Response.json({ pages: [] })) as typeof fetch;
    await expect(fetchPublicPages(options(weird))).rejects.toThrow(/esperava um array/);
    const noBody = (async (input: RequestInfo | URL) =>
      String(input).endsWith('/pages') ? Response.json([{ path: 'a.md' }]) : Response.json({ frontmatter: { tags: ['public'] } })) as typeof fetch;
    await expect(fetchPublicPages(options(noBody))).rejects.toThrow(/body_markdown/);
  });

  it('caminhos que sairiam da pasta são recusados', () => {
    expect(isSafePagePath('guides/sigaa.md')).toBe(true);
    for (const bad of ['../x.md', 'a/../b.md', '/abs.md', 'a\\b.md', '.oculto.md', 'a/.git/x.md', 'sem-extensao', 'a b.md', 'a//b.md']) {
      expect(isSafePagePath(bad)).toBe(false);
    }
  });

  it('um caminho inválido na lista derruba o build', async () => {
    const memory = fakeMemory([{ path: '../fora.md', tags: ['public'] }]);
    await expect(fetchPublicPages(options(memory.impl))).rejects.toThrow(/caminho de página inválido/);
  });
});

describe('página → arquivo do Starlight', () => {
  const base = { path: 'guides/sigaa.md', title: 'SIGAA', updatedAt: '2026-11-12T10:00:00.000Z', frontmatter: {}, markdown: '# SIGAA\n\nTexto.' };

  it('mantém só título, descrição, ordem e data; tira as tags e o h1 repetido', () => {
    const file = toContentFile({ ...base, frontmatter: { tags: ['public'], description: 'Como conectar', order: 2, pinned: true, evil: 'x' } });
    expect(file.relPath).toBe('guides/sigaa.md');
    expect(file.content).toBe(
      '---\ntitle: "SIGAA"\ndescription: "Como conectar"\nsidebar:\n  order: 2\nlastUpdated: 2026-11-12T10:00:00.000Z\n---\n\nTexto.\n',
    );
  });

  it('título com aspas e quebra de linha não escapa do YAML; sem título usa o h1', () => {
    const tricky = toContentFile({ ...base, title: 'Dois: "x"\ninjetado: sim' });
    expect(tricky.content).toContain('title: "Dois: \\"x\\"\\ninjetado: sim"');
    expect(tricky.content.split('---')[1]).not.toMatch(/^injetado:/m);
    expect(toContentFile({ ...base, title: '', markdown: '# Do h1\n\ncorpo' }).content).toContain('title: "Do h1"');
  });
});

describe('varredura de segredos', () => {
  const scan = (text: string, known: string[] = []) => scanForSecrets([{ path: 'a.md', text }], known);

  it('acha chaves conhecidas, sem repetir o valor no achado', () => {
    const samples = [
      '-----BEGIN RSA PRIVATE KEY-----',
      `token ${'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'}`,
      `chave AKIA${'ABCDEFGHIJKLMNOP'}`,
      `Authorization: Bearer ${'abcdefghijklmnopqrstuvwxyz0123456789'}`,
      `postgres://app:${'s3nh4Forte'}@db.interno:5432/x`,
      `eyJ${'hbGciOiJIUzI1NiJ9'}.eyJ${'zdWIiOiIxMjM0NTY3ODkw'}.${'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV'}`,
      `senha = ${'Zx9fQ2mK7vL4pR8sT1wY'}`,
    ];
    for (const sample of samples) {
      const findings = scan(sample);
      expect(findings.length, sample).toBeGreaterThan(0);
      expect(JSON.stringify(findings)).not.toContain('ABCDEFGHIJKLMNOP');
    }
  });

  it('texto comum de documentação não dispara', () => {
    expect(scan('Rode `claude mcp add --transport http ufba https://ufba.app/mcp`. A senha do SIGAA fica cifrada.')).toEqual([]);
    expect(scan('token: seu-token-aqui-ex-exemplo')).toEqual([]);
    expect(scan('A API usa Bearer no cabeçalho Authorization.')).toEqual([]);
  });

  it('o valor exato da chave do memory nunca pode aparecer', () => {
    expect(scan(`veja ${KEY} aqui`, [KEY])).toEqual([{ file: 'a.md', line: 1, rule: 'valor-de-segredo-conhecido' }]);
  });
});

describe('markdown seguro (remark)', () => {
  const run = (children: unknown[], type = 'root') => {
    const tree = { type, children } as { type: string; children: Array<{ type: string; [k: string]: unknown }> };
    remarkSafe()(tree);
    return tree.children;
  };

  it('HTML cru vira texto, em bloco e na linha', () => {
    expect(run([{ type: 'html', value: '<script>alert(1)</script>' }])).toEqual([
      { type: 'paragraph', children: [{ type: 'text', value: '<script>alert(1)</script>' }] },
    ]);
    expect(run([{ type: 'paragraph', children: [{ type: 'html', value: '<img onerror=x>' }] }])).toEqual([
      { type: 'paragraph', children: [{ type: 'text', value: '<img onerror=x>' }] },
    ]);
  });

  it('imagem vira o texto alternativo; link perigoso perde o link e fica o texto', () => {
    const [paragraph] = run([
      {
        type: 'paragraph',
        children: [
          { type: 'image', url: 'https://x.test/p.png', alt: 'logo' },
          { type: 'link', url: 'javascript:alert(1)', children: [{ type: 'text', value: 'clique' }] },
          { type: 'link', url: 'https://ufba.app', children: [{ type: 'text', value: 'ok' }] },
        ],
      },
    ]);
    expect(paragraph?.children).toEqual([
      { type: 'text', value: 'logo' },
      { type: 'text', value: 'clique' },
      { type: 'link', url: 'https://ufba.app', children: [{ type: 'text', value: 'ok' }] },
    ]);
  });

  it('só http, https, mailto, relativos e âncoras passam', () => {
    for (const ok of ['https://a.test', 'http://a.test', 'mailto:a@b.c', '/guia/sigaa', '../x', '#secao', 'sigaa/']) {
      expect(isSafeUrl(ok), ok).toBe(true);
    }
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:x', 'java\nscript:x', ' javascript:x', 'data:text/html,<b>', 'vbscript:x', '//evil.test/x', 'file:///etc/passwd']) {
      expect(isSafeUrl(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('montagem do conteúdo', () => {
  const dir = () => join(mkdtempSync(join(tmpdir(), 'docs-content-')), 'docs');

  it('grava só as públicas, com frontmatter limpo', async () => {
    const outDir = dir();
    const memory = fakeMemory([
      { path: 'guides/sigaa.md', title: 'SIGAA', tags: ['public'], body: '# SIGAA\n\nConecte.' },
      { path: 'interno/segredo.md', tags: ['adr'], body: 'não publicar' },
    ]);
    const { files } = await buildContent({ ...options(memory.impl), outDir });
    expect(files.map((f) => f.relPath)).toEqual(['guides/sigaa.md']);
    expect(readFileSync(join(outDir, 'guides/sigaa.md'), 'utf8')).toContain('Conecte.');
    expect(existsSync(join(outDir, 'interno'))).toBe(false);
  });

  it('projeto sem página pública falha em vez de publicar um site vazio', async () => {
    const outDir = dir();
    const memory = fakeMemory([{ path: 'a.md', tags: ['adr'] }]);
    await expect(buildContent({ ...options(memory.impl), outDir })).rejects.toThrow(/site vazio/);
    expect(existsSync(join(outDir, 'a.md'))).toBe(false);
  });

  it('achou segredo: falha, não grava nada e não imprime o valor', async () => {
    const outDir = dir();
    const secret = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
    const memory = fakeMemory([
      { path: 'ok.md', tags: ['public'], body: 'limpo' },
      { path: 'vaza.md', tags: ['public'], body: `use o token ${secret}` },
    ]);
    const error = await buildContent({ ...options(memory.impl), outDir }).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/possível segredo.*vaza\.md:\d+ \(github-token\)/);
    expect((error as Error).message).not.toContain(secret);
    expect(existsSync(join(outDir, 'ok.md'))).toBe(false);
  });
});
