import { docsSchema } from '@astrojs/starlight/schema';
import { docsLoader } from '@astrojs/starlight/loaders';
import { defineCollection } from 'astro:content';

/** O conteúdo não mora no repositório: é baixado do memory para `src/content/docs/` (ignorado pelo git) a cada build. */
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
