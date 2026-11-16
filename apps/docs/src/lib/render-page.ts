import type { MemoryPage } from './memory-client';
import { listedOrder } from './page-order';

export type ContentFile = { relPath: string; content: string };

const yamlString = (value: string) => JSON.stringify(value);

/** Primeiro `# Título` do markdown, para quando a página não traz `title`. */
function firstHeading(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+?)\s*#*\s*$/m);
  return match?.[1]?.trim() || null;
}

/**
 * Transforma uma página do memory em um arquivo de conteúdo do Starlight. O frontmatter de saída é uma lista
 * fechada (título, descrição, ordem, data): o resto do que vier do memory, tags incluídas, não passa.
 */
export function toContentFile(page: MemoryPage): ContentFile {
  const fallbackTitle = page.path.replace(/\.md$/, '').split('/').pop() ?? page.path;
  const title = (page.title.trim() || firstHeading(page.markdown) || fallbackTitle).slice(0, 160);

  const lines = [`title: ${yamlString(title)}`];
  // As ferramentas de escrita do memory gravam o resumo da página em `abstract`, não em `description`.
  const description = page.frontmatter.description ?? page.frontmatter.abstract;
  if (typeof description === 'string' && description.trim()) {
    lines.push(`description: ${yamlString(description.trim().slice(0, 300))}`);
  }
  // `order` do memory vence; sem ele, vale a posição em PAGE_ORDER.
  const frontmatterOrder = page.frontmatter.order;
  const order = typeof frontmatterOrder === 'number' && Number.isFinite(frontmatterOrder) ? Math.trunc(frontmatterOrder) : listedOrder(page.path);
  if (order !== undefined) lines.push('sidebar:', `  order: ${order}`);
  if (page.updatedAt && !Number.isNaN(Date.parse(page.updatedAt))) {
    lines.push(`lastUpdated: ${new Date(page.updatedAt).toISOString()}`);
  }

  // O Starlight já mostra o título da página como h1: tira o h1 repetido do começo do corpo.
  const body = page.markdown.replace(/^\s*#\s+(.+?)\s*\r?\n+/, (heading, text: string) =>
    text.trim().toLowerCase() === title.toLowerCase() ? '' : heading,
  );
  return { relPath: page.path, content: `---\n${lines.join('\n')}\n---\n\n${body.trim()}\n` };
}
