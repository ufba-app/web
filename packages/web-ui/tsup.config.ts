import { defineConfig } from 'tsup';

export default defineConfig({
  // `switch` é uma entrada à parte para não pesar na primeira carga (ver src/switch.ts).
  entry: ['src/index.ts', 'src/switch.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  external: ['react', 'react-dom', '@heroui/react', '@ufba-app/tokens'],
  banner: { js: '"use client";' },
});
