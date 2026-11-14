import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  external: ['react', 'react-dom', '@heroui/react', '@ufba-app/tokens'],
  banner: { js: '"use client";' },
});
