/**
 * Baixa as páginas públicas do memory para `src/content/docs/` (tempo de build). Uso: `pnpm --filter @ufba-app/docs content`.
 * Variáveis: MEMORY_DOCS_KEY (obrigatória, nunca impressa), MEMORY_BASE_URL (padrão https://memory.ufba.app; aponte
 * para o mock em dev), MEMORY_WORKSPACE (ufba-app), MEMORY_PROJECT (docs), DOCS_MIN_PAGES (1).
 */
import { fileURLToPath } from 'node:url';
import { buildContent } from '../src/lib/build-content';
import { MemoryError } from '../src/lib/memory-client';

const outDir = fileURLToPath(new URL('../src/content/docs', import.meta.url));

try {
  const { files, listed } = await buildContent({
    baseUrl: process.env.MEMORY_BASE_URL ?? 'https://memory.ufba.app',
    workspace: process.env.MEMORY_WORKSPACE ?? 'ufba-app',
    project: process.env.MEMORY_PROJECT ?? 'docs',
    key: process.env.MEMORY_DOCS_KEY ?? '',
    minPages: Number(process.env.DOCS_MIN_PAGES ?? '1'),
    outDir,
  });
  console.log(`memory: ${files.length} página(s) pública(s) de ${listed} listada(s) → src/content/docs/`);
} catch (error) {
  console.error(`memory: ${error instanceof MemoryError ? error.message : 'falha inesperada ao baixar o conteúdo'}`);
  process.exit(1);
}
