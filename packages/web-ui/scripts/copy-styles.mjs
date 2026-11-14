import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Cópia arquivo a arquivo: cpSync recursivo falha no Windows com caminhos acentuados.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist/styles');
mkdirSync(out, { recursive: true });
copyFileSync(resolve(root, 'src/styles.css'), resolve(root, 'dist/styles.css'));
for (const f of readdirSync(resolve(root, 'src/styles'))) {
  copyFileSync(resolve(root, 'src/styles', f), resolve(out, f));
}
