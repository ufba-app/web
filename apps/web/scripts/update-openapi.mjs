// Atualiza a cópia do openapi.json da API usada por src/contract/openapi.contract.test.ts.
// Uso: pnpm contract:update [url]   (padrão: https://api.ufba.app/openapi.json)
// Depois rode `pnpm test`: se o contrato escrito à mão divergir, o teste mostra onde.
import { writeFileSync } from 'node:fs';

const url = process.argv[2] ?? 'https://api.ufba.app/openapi.json';
const response = await fetch(url);
if (!response.ok) throw new Error(`${url} respondeu ${response.status}`);
const spec = await response.json();
writeFileSync(new URL('../src/contract/openapi.json', import.meta.url), `${JSON.stringify(spec, null, 2)}\n`);
console.log(`openapi.json atualizado de ${url} (${Object.keys(spec.paths).length} caminhos)`);
