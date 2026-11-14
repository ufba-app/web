import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fetchPublicPages, MemoryError, type MemoryOptions } from './memory-client';
import { toContentFile, type ContentFile } from './render-page';
import { scanForSecrets } from './secret-scan';

export type BuildContentOptions = MemoryOptions & {
  outDir: string;
  /** Menos páginas públicas que isso: o build falha em vez de publicar um site vazio. */
  minPages?: number;
};

/**
 * Baixa as páginas públicas do memory, confere (tag, caminho, segredos) e só então grava a pasta de conteúdo.
 * Qualquer problema lança `MemoryError` antes de tocar no disco: a pasta anterior continua como estava e o
 * workflow não publica (o GitHub Pages mantém a última versão no ar).
 */
export async function buildContent(options: BuildContentOptions): Promise<{ files: ContentFile[]; listed: number }> {
  const { pages, listed } = await fetchPublicPages(options);

  const minPages = options.minPages ?? 1;
  if (pages.length < minPages) {
    throw new MemoryError(
      `só ${pages.length} página(s) pública(s) de ${listed} no projeto "${options.project}" (mínimo ${minPages}); ` +
        'não publico um site vazio',
    );
  }

  const files = pages.map(toContentFile);
  const findings = scanForSecrets(
    files.map((file) => ({ path: file.relPath, text: file.content })),
    [options.key],
  );
  if (findings.length > 0) {
    const list = findings.map((f) => `${f.file}:${f.line} (${f.rule})`).join(', ');
    throw new MemoryError(`possível segredo no conteúdo, build interrompido: ${list}`);
  }

  const outDir = resolve(options.outDir);
  await rm(outDir, { recursive: true, force: true });
  for (const file of files) {
    const target = resolve(outDir, file.relPath);
    if (!target.startsWith(outDir + sep)) throw new MemoryError(`caminho fora da pasta de conteúdo: ${file.relPath}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, 'utf8');
  }
  // A lista de páginas fica ao lado da pasta (não dentro, para não virar conteúdo): a config do site monta a barra lateral com ela.
  await writeFile(join(dirname(outDir), 'manifest.json'), JSON.stringify({ pages: files.map((f) => f.relPath) }, null, 2));
  return { files, listed };
}
