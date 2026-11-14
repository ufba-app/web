// Teto de tamanho da primeira carga do app de autenticação. Roda depois do build: `pnpm build:auth && pnpm size:auth`
// (o build do auth exige VITE_PANEL_ORIGIN e VITE_AUTH_ORIGIN; ver .env.example).
// Mede o que o navegador baixa para abrir a primeira tela (auth.html, o JS e o CSS que ele pede e as fontes que
// ele pré-carrega), já comprimido. Mesma conta de scripts/check-bundle-size.mjs, com tetos próprios do auth.
// Ver docs/performance.md.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const dist = fileURLToPath(new URL('../dist-auth/', import.meta.url));

// Tetos em kB comprimidos (gzip), cerca de 8% acima do medido em 2026-11-12 (js 127,9, css 46,1, fontes 38,6, total 213,2).
// Subir um teto é decisão do André: diga o que entrou e por quê.
const LIMITS = { js: 138, css: 50, fonts: 42, total: 230 };

const gz = (file) => gzipSync(readFileSync(join(dist, file.replace(/^\//, '')))).length / 1024;
const sum = (files) => files.reduce((total, file) => total + gz(file), 0);

function measure(htmlFile) {
  const html = readFileSync(join(dist, htmlFile), 'utf8');
  const refs = (pattern) => [...html.matchAll(pattern)].map((m) => m[1]).filter(Boolean);
  const scripts = refs(/<script[^>]*\ssrc="([^"]+)"/g);
  const modulePreloads = refs(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g);
  const styles = refs(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g).filter((href) => href.startsWith('/assets/'));
  const fonts = refs(/<link[^>]*rel="preload"[^>]*as="font"[^>]*href="([^"]+)"/g);
  const result = {
    js: sum([...new Set([...scripts, ...modulePreloads])]),
    css: sum(styles),
    fonts: sum(fonts),
  };
  result.total = result.js + result.css + result.fonts + gzipSync(html).length / 1024;
  return result;
}

const measured = measure('auth.html');

const largest = readdirSync(join(dist, 'assets'))
  .filter((name) => name.endsWith('.js'))
  .map((name) => ({ name, kb: gz(`assets/${name}`) }))
  .sort((a, b) => b.kb - a.kb)
  .slice(0, 6);

let failed = false;
for (const [key, limit] of Object.entries(LIMITS)) {
  const value = measured[key];
  const ok = value <= limit;
  failed ||= !ok;
  console.log(`${ok ? 'ok ' : 'FALHOU'} ${key.padEnd(5)} ${value.toFixed(1).padStart(6)} kB  (teto ${limit} kB)`);
}
console.log('\nmaiores chunks de JS (gzip):');
for (const { name, kb } of largest) console.log(`  ${kb.toFixed(1).padStart(6)} kB  ${name}`);

if (failed) {
  console.error('\nA primeira carga do auth passou do teto. Veja docs/performance.md antes de subir o limite.');
  process.exit(1);
}
