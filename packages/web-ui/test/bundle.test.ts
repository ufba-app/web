import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = (p: string) => resolve(__dirname, '../dist', p);

test.skipIf(!existsSync(dist('index.js')))('bundle é Client Component e leva o CSS', () => {
  expect(readFileSync(dist('index.js'), 'utf8').startsWith('"use client"')).toBe(true);
  expect(existsSync(dist('styles.css'))).toBe(true);
  expect(existsSync(dist('styles/theme.css'))).toBe(true);
  expect(existsSync(dist('styles/components.css'))).toBe(true);
});
