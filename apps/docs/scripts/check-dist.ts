/**
 * Confere o site já gerado (`dist/`): nenhum HTML pode conter a chave do memory nem link `javascript:`.
 * Uso: `pnpm --filter @ufba-app/docs check:dist` depois do build. Se MEMORY_DOCS_KEY estiver no ambiente, procura o valor.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist', import.meta.url));

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const key = process.env.MEMORY_DOCS_KEY?.trim() ?? '';
const problems: string[] = [];
let checked = 0;
for await (const file of walk(dist)) {
  if (!/\.(html|js|json|css|xml|txt)$/.test(file)) continue;
  checked += 1;
  const text = await readFile(file, 'utf8');
  const name = file.slice(dist.length + 1);
  if (key.length >= 8 && text.includes(key)) problems.push(`${name}: contém o valor da MEMORY_DOCS_KEY`);
  if (/href=["']\s*javascript:/i.test(text)) problems.push(`${name}: link javascript:`);
}
if (checked === 0) problems.push('dist/ vazio: rode o build antes');
if (problems.length > 0) {
  console.error(`check-dist falhou:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`check-dist: ${checked} arquivo(s) conferidos, sem chave e sem link javascript:`);
