import { defineConfig } from 'astro/config';

/**
 * Landing do ufba.app (ufba.app/ → Cloudflare Pages, projeto "ufba-landing"). 100% estática e sem JavaScript
 * por padrão. A CSP estrita (public/_headers) não permite nada inline, então o CSS sai sempre em arquivo
 * (inlineStylesheets: 'never') e nenhum asset vira data: URI (assetsInlineLimit: 0).
 */
export default defineConfig({
  site: 'https://ufba.app',
  output: 'static',
  trailingSlash: 'never',
  build: { inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
});
