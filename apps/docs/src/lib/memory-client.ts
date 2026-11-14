/**
 * Cliente somente-leitura do memory (https://memory.ufba.app). Roda só em tempo de build, com a chave em
 * MEMORY_DOCS_KEY: a chave nunca entra no HTML, no JS do site nem em mensagem de erro.
 *
 * Formato (docs/frontend-api.md do ai-memory):
 *   GET /api/v1/workspaces/{ws}/projects/{project}/pages        -> [{ path, title, updated_at, ... }] (sem tags)
 *   GET /api/v1/workspaces/{ws}/projects/{project}/pages/{path} -> { path, title, updated_at,
 *                                                                    frontmatter: { tags: [...] }, body_markdown, ... }
 */

export type MemoryPage = {
  /** Caminho no memory, com barras e `.md` (ex.: `guides/sigaa.md`). Já validado: não sai da pasta de conteúdo. */
  path: string;
  title: string;
  updatedAt: string | null;
  frontmatter: Record<string, unknown>;
  markdown: string;
};

export type MemoryOptions = {
  baseUrl: string;
  workspace: string;
  project: string;
  key: string;
  /** Só a tag que torna a página pública (padrão `public`). */
  publicTag?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  concurrency?: number;
};

export class MemoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MemoryError';
  }
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Aceita só `a/b/c.md` com segmentos simples: sem `..`, barra invertida, caminho absoluto nem arquivo oculto. */
export function isSafePagePath(path: string): boolean {
  if (!path.endsWith('.md') || path.length > 200) return false;
  return path.split('/').every((segment) => SEGMENT.test(segment) && !segment.includes('..'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasPublicTag(frontmatter: Record<string, unknown>, tag = 'public'): boolean {
  const tags = frontmatter.tags;
  return Array.isArray(tags) && tags.some((item) => item === tag);
}

async function getJson(url: string, options: MemoryOptions, what: string): Promise<{ status: number; body: unknown }> {
  const doFetch = options.fetchImpl ?? fetch;
  let lastProblem = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await doFetch(url, {
        headers: { authorization: `Bearer ${options.key}`, accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
      });
      if (response.status === 404) return { status: 404, body: null };
      if (response.status >= 500) {
        lastProblem = `HTTP ${response.status}`;
        continue;
      }
      if (!response.ok) throw new MemoryError(`${what}: o memory respondeu HTTP ${response.status}`);
      try {
        return { status: response.status, body: await response.json() };
      } catch {
        throw new MemoryError(`${what}: resposta que não é JSON`);
      }
    } catch (cause) {
      if (cause instanceof MemoryError) throw cause;
      // Mensagem genérica: um erro de rede pode carregar detalhes do pedido; nunca repassamos cabeçalhos.
      lastProblem = 'sem resposta (rede ou tempo esgotado)';
    }
  }
  throw new MemoryError(`${what}: memory fora do ar (${lastProblem})`);
}

async function mapLimited<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index] as T);
    }
  });
  await Promise.all(runners);
  return results;
}

/** Baixa a lista e depois cada página; devolve só as que têm a tag pública. Falha em qualquer resposta fora do formato. */
export async function fetchPublicPages(options: MemoryOptions): Promise<{ pages: MemoryPage[]; listed: number }> {
  if (!options.key.trim()) throw new MemoryError('MEMORY_DOCS_KEY ausente: sem a chave o build não lê o memory');
  const base = options.baseUrl.replace(/\/+$/, '');
  const root = `${base}/api/v1/workspaces/${encodeURIComponent(options.workspace)}/projects/${encodeURIComponent(options.project)}/pages`;

  const list = await getJson(root, options, 'lista de páginas');
  if (list.status === 404) {
    throw new MemoryError(`o projeto "${options.project}" não existe no workspace "${options.workspace}" do memory`);
  }
  if (!Array.isArray(list.body)) throw new MemoryError('lista de páginas: formato inesperado (esperava um array)');

  const paths: string[] = [];
  for (const item of list.body) {
    const path = isRecord(item) ? item.path : undefined;
    if (typeof path !== 'string') throw new MemoryError('lista de páginas: item sem `path`');
    // Um caminho fora do padrão derruba o build em vez de ser ignorado em silêncio ou escrito em outro lugar.
    if (!isSafePagePath(path)) throw new MemoryError(`caminho de página inválido: ${JSON.stringify(path.slice(0, 80))}`);
    paths.push(path);
  }

  const tag = options.publicTag ?? 'public';
  const loaded = await mapLimited(paths, options.concurrency ?? 4, async (path): Promise<MemoryPage | null> => {
    const url = `${root}/${path.split('/').map(encodeURIComponent).join('/')}`;
    const response = await getJson(url, options, `página ${path}`);
    // Sumiu entre a lista e a leitura (expirou): fica de fora, como na lista.
    if (response.status === 404) return null;
    const page = response.body;
    if (!isRecord(page) || typeof page.body_markdown !== 'string') {
      throw new MemoryError(`página ${path}: formato inesperado (sem body_markdown)`);
    }
    const frontmatter = isRecord(page.frontmatter) ? page.frontmatter : {};
    if (!hasPublicTag(frontmatter, tag)) return null;
    return {
      path,
      title: typeof page.title === 'string' ? page.title : '',
      updatedAt: typeof page.updated_at === 'string' ? page.updated_at : null,
      frontmatter,
      markdown: page.body_markdown,
    };
  });

  return { pages: loaded.filter((page): page is MemoryPage => page !== null), listed: paths.length };
}
