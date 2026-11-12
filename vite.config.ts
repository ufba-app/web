import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig, type Plugin } from 'vitest/config';
import { isPanelPath } from './src/lib/panelPaths';

/**
 * Fontes que aparecem em quase toda tela (corpo e títulos, só o subconjunto latino). Sem isto o navegador só descobre
 * que precisa delas depois de baixar o CSS, e o texto pisca com outra fonte. O nome tem hash, então a lista é feita
 * a partir do que o build gerou. Preload de fonte exige `crossorigin`, mesmo sendo do mesmo domínio.
 */
const PRELOADED_FONTS = [
  /plus-jakarta-sans-latin-500-normal-[\w-]+\.woff2$/,
  /plus-jakarta-sans-latin-700-normal-[\w-]+\.woff2$/,
  /sora-latin-800-normal-[\w-]+\.woff2$/,
];

function preloadFonts(): Plugin {
  return {
    name: 'ufba:preload-fonts',
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

/**
 * Nas rotas do painel, devolve `shell.html` (sidebar em skeleton) no lugar do `index.html` (brasão). Em produção quem
 * faz isso é o Caddy (regra `@panel`); este plugin repete a regra no servidor de desenvolvimento e no `vite preview`,
 * para o F5 mostrar o mesmo flash e para o teste e2e-prod verificar o arquivo. Só para navegação de página.
 */
function panelShell(): Plugin {
  const middleware = (req: { method?: string; url?: string; headers: Record<string, string | string[] | undefined> }, _res: unknown, next: () => void) => {
    const accept = String(req.headers.accept ?? '');
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && accept.includes('text/html') && isPanelPath(url.pathname)) {
      req.url = `/shell.html${url.search}`;
    }
    next();
  };
  return {
    name: 'ufba:panel-shell',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

/**
 * No `vite dev` o CSS só chega junto com o JavaScript, então o flash (shell.html e index.html) apareceria sem estilo.
 * Aqui ele vira um `<link>` no `<head>`, como no build de produção (onde o Vite já faz isso). Só no desenvolvimento.
 */
function devStylesheet(): Plugin {
  return {
    name: 'ufba:dev-stylesheet',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [{ tag: 'link', attrs: { rel: 'stylesheet', href: '/src/styles.css' }, injectTo: 'head' }],
    },
  };
}

/**
 * O painel manda quem está sem sessão para o app de auth, e a origem dele é FIXA no build. Em produção a variável é
 * obrigatória: sem padrão silencioso, para um deploy mal configurado falhar aqui e não apontar para localhost.
 * (`.env.production.local`, que não vai ao git nem à imagem, traz as origens de desenvolvimento para builds locais.)
 */
function requireAuthOrigin(): Plugin {
  return {
    name: 'ufba:require-auth-origin',
    apply: 'build',
    config(_config, { mode }) {
      const env = loadEnv(mode, process.cwd(), 'VITE_');
      if (mode === 'production' && !env.VITE_AUTH_ORIGIN?.trim()) {
        throw new Error('VITE_AUTH_ORIGIN não está definida: o painel precisa saber onde fica o app de auth (ex.: https://auth.ufba.app).');
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadFonts(), panelShell(), devStylesheet(), requireAuthOrigin()],
  resolve: {
    // O design system é ligado por link local; sem isso o React poderia ser carregado duas vezes.
    dedupe: ['react', 'react-dom'],
  },
  build: {
    // Nada de arquivos embutidos como `data:` no JS/CSS: a CSP libera fontes e imagens só de 'self' e da API.
    assetsInlineLimit: 0,
    // Dois HTMLs: index.html (brasão, para o resto) e shell.html (sidebar em skeleton, para o painel).
    rollupOptions: { input: { index: 'index.html', shell: 'shell.html' } },
  },
  server: { port: 3001, strictPort: true },
  preview: { port: 3001, strictPort: true },
  test: {
    environment: 'jsdom',
    // O web roda em :3001 (a API, em :3000); o padrão do jsdom seria :3000 e esconderia erros de origem.
    environmentOptions: { jsdom: { url: 'http://localhost:3001/' } },
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // O design system vem por link local, com um React próprio em `../design-system/node_modules`. Sem isto o Vitest
    // o carrega como pacote externo e o Node resolve um segundo React (hooks quebram). Processado pelo Vite,
    // o `resolve.dedupe` acima vale também nos testes.
    server: { deps: { inline: [/design-system/] } },
  },
});
