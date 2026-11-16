import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';
import { defineConfig } from 'astro/config';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import remarkSafe from './src/lib/remark-safe';

/**
 * Site de documentação (docs.ufba.app). 100% estático: o conteúdo vem do memory em tempo de build
 * (scripts/fetch-content.ts → src/content/docs/, fora do git) e nada é buscado pelo navegador.
 */

const manifestPath = fileURLToPath(new URL('./src/content/manifest.json', import.meta.url));
if (!existsSync(manifestPath)) {
  throw new Error('Sem conteúdo: rode `pnpm --filter @ufba-app/docs content` (precisa de MEMORY_DOCS_KEY) antes do build.');
}

/** Nomes das seções da barra lateral: a pasta no memory vira o rótulo em pt-BR (o resto vira "Primeira Maiúscula"). */
const SECTION_LABELS: Record<string, string> = {
  comecar: 'Começar',
  assistentes: 'Assistentes',
  fontes: 'Fontes',
  memoria: 'Memória',
  seguranca: 'Segurança',
  projeto: 'Projeto',
};
const humanize = (name: string) => name.replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase());

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { pages: string[] };
const SECTION_ORDER = Object.keys(SECTION_LABELS);
const rank = (folder: string) => {
  const index = SECTION_ORDER.indexOf(folder.toLowerCase());
  return index === -1 ? SECTION_ORDER.length : index;
};
const folders = [...new Set(manifest.pages.filter((p) => p.includes('/')).map((p) => p.split('/')[0] as string))].sort(
  (a, b) => rank(a) - rank(b) || a.localeCompare(b),
);
const rootPages = manifest.pages.filter((p) => !p.includes('/') && p !== 'index.md').map((p) => p.replace(/\.md$/, '').toLowerCase());

const sidebar = [
  ...(rootPages.length > 0 ? [{ label: 'Geral', items: rootPages.map((slug) => ({ slug })) }] : []),
  ...folders.map((folder) => ({
    label: SECTION_LABELS[folder.toLowerCase()] ?? humanize(folder),
    collapsed: false,
    items: [{ autogenerate: { directory: folder, collapsed: false } }],
  })),
];

export default defineConfig({
  site: 'https://docs.ufba.app',
  // Markdown só markdown: sem HTML cru, imagem de fora nem link perigoso (src/lib/remark-safe.ts).
  markdown: { processor: unified({ remarkPlugins: [remarkSafe] }) },
  integrations: [
    starlight({
      title: 'ufba.app docs',
      description: 'Como conectar as suas fontes, autorizar um assistente e usar o ufba.app.',
      defaultLocale: 'root',
      locales: { root: { label: 'Português', lang: 'pt-BR' } },
      favicon: '/brasao.svg',
      lastUpdated: true,
      social: [{ icon: 'github', label: 'Código no GitHub', href: 'https://github.com/ufba-app' }],
      sidebar,
      customCss: [
        '@fontsource/sora/600.css',
        '@fontsource/sora/800.css',
        '@fontsource/plus-jakarta-sans/500.css',
        '@fontsource/plus-jakarta-sans/700.css',
        '@fontsource/plus-jakarta-sans/800.css',
        '@fontsource/jetbrains-mono/500.css',
        '@fontsource/jetbrains-mono/600.css',
        '@ufba-app/tokens/tokens.css',
        './src/styles/theme.css',
      ],
      components: {
        SiteTitle: './src/components/SiteTitle.astro',
        SocialIcons: './src/components/SocialIcons.astro',
        TableOfContents: './src/components/TableOfContents.astro',
        Footer: './src/components/Footer.astro',
      },
      expressiveCode: {
        // Bloco de código marinho nos dois temas, como no canvas.
        themes: ['night-owl'],
        useStarlightDarkModeSwitch: false,
        useStarlightUiThemeColors: false,
        styleOverrides: { borderRadius: '18px', codeBackground: '#12195a', borderColor: '#12195a', codeFontFamily: 'var(--sl-font-mono)' },
      },
    }),
  ],
});
