import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * App de autenticação (auth.ufba.app, dev :3002). Segundo build do mesmo repositório: entrada `auth.html`,
 * saída `dist-auth/`. As decisões abaixo repetem as de `vite.config.ts` (o painel), que não é editado por aqui.
 */

/** Fontes do corpo e dos títulos (latim). O nome tem hash; a lista sai do que o build gerou. Preload de fonte exige `crossorigin`. */
const PRELOADED_FONTS = [
  /plus-jakarta-sans-latin-500-normal-[\w-]+\.woff2$/,
  /plus-jakarta-sans-latin-700-normal-[\w-]+\.woff2$/,
  /sora-latin-800-normal-[\w-]+\.woff2$/,
];

function preloadFonts(): Plugin {
  return {
    name: 'ufba-auth:preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {});
        return PRELOADED_FONTS.flatMap((pattern) => files.filter((file) => pattern.test(file))).map((file) => ({
          tag: 'link',
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${file}`, crossorigin: '' },
          injectTo: 'head',
        }));
      },
    },
  };
}

/** No `vite dev` o CSS só chega com o JavaScript; aqui ele vira `<link>` no `<head>`, como no build. */
function devStylesheet(): Plugin {
  return {
    name: 'ufba-auth:dev-stylesheet',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [{ tag: 'link', attrs: { rel: 'stylesheet', href: '/src/styles.css' }, injectTo: 'head' }],
    },
  };
}

/**
 * Toda GET sem arquivo (sem extensão) devolve `auth.html`: o auth é um app só, sem `index.html`. Em produção
 * quem faz isso é o Caddy (`try_files` do Caddyfile.auth); aqui vale para `vite dev` e `vite preview`.
 */
function authHtmlFallback(): Plugin {
  const middleware = (
    req: { method?: string; url?: string },
    _res: unknown,
    next: () => void,
  ) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const isFile = /\.\w+$/.test(url.pathname) || /^\/(assets|src|@|node_modules)/.test(url.pathname);
    if (req.method === 'GET' && !isFile) req.url = `/auth.html${url.search}`;
    next();
  };
  return {
    name: 'ufba-auth:html-fallback',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

/** Build de produção sem as origens fixas não sobe: o destino pós-login depende delas (ver src/lib/origins.ts). */
function requireOrigins(mode: string): Plugin {
  return {
    name: 'ufba-auth:require-origins',
    apply: 'build',
    config() {
      const env = loadEnv(mode, process.cwd(), 'VITE_');
      const missing = ['VITE_PANEL_ORIGIN', 'VITE_AUTH_ORIGIN'].filter((name) => !env[name]?.trim());
      if (missing.length > 0) {
        throw new Error(
          `Build do auth sem ${missing.join(' e ')}. Defina as origens (ex.: https://ufba.app e https://auth.ufba.app).`,
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), preloadFonts(), authHtmlFallback(), devStylesheet(), requireOrigins(mode)],
  resolve: {
    // O design system é ligado por link local; sem isso o React poderia ser carregado duas vezes.
    dedupe: ['react', 'react-dom'],
  },
  build: {
    outDir: 'dist-auth',
    // Nada de arquivos embutidos como `data:`: a CSP libera fontes e imagens só de 'self' e da API.
    assetsInlineLimit: 0,
    rollupOptions: { input: { index: 'auth.html' } },
  },
  server: { port: 3002, strictPort: true },
  preview: { port: 3002, strictPort: true },
}));
