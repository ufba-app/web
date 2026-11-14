/**
 * Confere o build da landing contra a regra da CSP e do "zero JavaScript por padrão":
 * nada inline (script, style, on*=, style=), nenhum recurso de terceiros e só os destinos fixos como link.
 * Rodar depois de `astro build`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const problems: string[] = [];
const warnings: string[] = [];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(dist);
const html = files.filter((f) => f.endsWith('.html'));
if (html.length === 0) problems.push('dist sem HTML: rode `pnpm build:landing` antes.');

const ALLOWED_HOSTS = new Set(['meu.ufba.app', 'docs.ufba.app', 'ufba.app', 'www.w3.org']);
for (const file of html) {
  const text = readFileSync(file, 'utf8');
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(text)) problems.push(`${file}: <script> inline`);
  if (/<style[\s>]/i.test(text)) problems.push(`${file}: <style> inline`);
  if (/\sstyle="/i.test(text)) problems.push(`${file}: atributo style=`);
  if (/\son[a-z]+="/i.test(text)) problems.push(`${file}: manipulador on*=`);
  if (/\b(?:src|href)="data:/i.test(text)) problems.push(`${file}: data: URI`);
  for (const [, host] of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
    if (!ALLOWED_HOSTS.has(host!.toLowerCase())) problems.push(`${file}: endereço externo inesperado (${host})`);
  }
  for (const [, src] of text.matchAll(/<script[^>]*\bsrc="([^"]+)"/gi)) {
    if (/^(?:https?:)?\/\//.test(src!)) problems.push(`${file}: script de fora (${src})`);
  }
}

for (const file of files.filter((f) => f.endsWith('.css'))) {
  const text = readFileSync(file, 'utf8');
  for (const [, host] of text.matchAll(/url\((?:["']?)https?:\/\/([a-z0-9.-]+)/gi)) problems.push(`${file}: recurso externo no CSS (${host})`);
}

const redirects = readFileSync(join(dist, '_redirects'), 'utf8');
if (redirects.includes('@@URL_DO_RELEASE@@')) warnings.push('_redirects ainda tem o marcador @@URL_DO_RELEASE@@ (falta a URL do release do memory).');
if (!/Content-Security-Policy: default-src 'self'/.test(readFileSync(join(dist, '_headers'), 'utf8'))) problems.push('_headers sem a CSP estrita.');

for (const w of warnings) console.warn(`aviso: ${w}`);
if (problems.length > 0) {
  console.error(problems.map((p) => `erro: ${p}`).join('\n'));
  process.exit(1);
}
console.log(`ok: ${html.length} página(s), ${files.length} arquivo(s), sem inline nem terceiros.`);
