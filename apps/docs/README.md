# docs

Site de documentação pública do ufba.app (`docs.ufba.app`): Astro + Starlight, 100% estático, com o visual do canvas
(tela "8 · Docs") sobre os tokens do design system (`@ufba-app/tokens`).

## De onde vem o conteúdo

Não está neste repositório. A documentação nasce no **memory** (`memory.ufba.app`): as páginas formalizadas ficam no
projeto `docs` do workspace `ufba-app` e só entram no site as que têm `public` em `frontmatter.tags`. A cada build,
`scripts/fetch-content.ts` lê a API somente leitura do memory e grava os arquivos em `src/content/docs/` (ignorado pelo
git). O navegador nunca fala com o memory.

```
memory ──(Bearer MEMORY_DOCS_KEY, só no build)──► fetch-content ──► src/content/docs ──► astro build ──► dist/ ──► GitHub Pages
```

O que o build faz com cada página, em ordem, e qualquer problema derruba o build **antes** de gravar ou publicar:

1. lista as páginas e lê uma a uma (a lista não traz tags); mantém só as com a tag `public`;
2. recusa caminhos fora do padrão (`a/b.md`, sem `..`, barra invertida ou arquivo oculto);
3. exige ao menos 1 página pública (`DOCS_MIN_PAGES`): projeto vazio, inexistente ou memory fora do ar **falha**, não
   publica um site vazio. O GitHub Pages continua servindo a última versão boa;
4. varre o texto atrás de segredos (`src/lib/secret-scan.ts`: chaves privadas, tokens de GitHub/AWS/Slack/Google/LLM,
   JWT, `Bearer`, URL com senha, `senha = <valor aleatório>` e o valor da própria `MEMORY_DOCS_KEY`). Achou, falha e o
   log diz arquivo, linha e regra, nunca o valor. No CI o gitleaks passa de novo pela pasta;
5. grava só título, descrição, ordem (`order`) e data (`updated_at`) no frontmatter. Tags e o resto não passam.

Markdown sem HTML cru (`src/lib/remark-safe.ts`): tags HTML viram texto visível, imagens viram o texto alternativo e
links só com `http`, `https`, `mailto`, relativo ou âncora. `pnpm check:dist` confere o site pronto (sem a chave, sem
`javascript:`).

### Como escrever uma página no memory

Pasta = seção da barra lateral (`comecar/`, `assistentes/`, `fontes/`, `seguranca/`, `projeto/` têm nome em pt-BR; outras
pastas viram "Primeira Maiúscula"). Frontmatter: `tags: [public]`, e opcionais `description` e `order` (número, ordem na
seção). Avisos: `:::note[Título]`, `:::tip`, `:::caution`, `:::danger`. Páginas na raiz entram em "Geral". O início
(`/`) é gerado pelo site, com um cartão por seção; o `index.md` do memory dá o título e a descrição do bloco de cor
(`description`, ou o corpo se for uma frase curta) e, se tiver mais texto, ele aparece abaixo dos cartões. O aviso
"conflicts with higher priority route /" do build é esperado: a página inicial do site vence a rota do `index.md`.

## Rodando

```bash
pnpm install
pnpm --filter @ufba-app/tokens build        # o CSS importa o dist dos tokens

# com a chave de verdade (nunca commite):
MEMORY_DOCS_KEY=… pnpm --filter @ufba-app/docs build

# sem a chave: memory simulado (páginas de exemplo, uma delas com HTML hostil para testar o render)
pnpm --filter @ufba-app/docs mock                                  # terminal 1, porta 4010
MEMORY_BASE_URL=http://localhost:4010 MEMORY_DOCS_KEY=dev-mock-key \
  pnpm --filter @ufba-app/docs build                               # terminal 2
pnpm --filter @ufba-app/docs preview                               # http://localhost:3003
```

Variáveis: `MEMORY_DOCS_KEY` (obrigatória), `MEMORY_BASE_URL` (`https://memory.ufba.app`), `MEMORY_WORKSPACE`
(`ufba-app`), `MEMORY_PROJECT` (`docs`), `DOCS_MIN_PAGES` (`1`).

`pnpm --filter @ufba-app/docs build:site` roda só o Astro (precisa do conteúdo já baixado). `typecheck` e `test`
(Vitest) cobrem cliente, filtro público, varredura de segredos, montagem do conteúdo e o plugin de markdown.

## Publicação

`.github/workflows/docs.yml`: push na `main` que toque `apps/docs/**` ou `packages/**`, a cada 6 horas e manual
(`workflow_dispatch`). Só o passo de baixar o conteúdo recebe o secret `MEMORY_DOCS_KEY`; o build do site não o vê.
O domínio vem de `public/CNAME` (`docs.ufba.app`). Pré-requisitos (feitos pelo André, uma vez): Settings → Pages →
Source: GitHub Actions; domínio `docs.ufba.app`; DNS `docs  CNAME  ufba-app.github.io`.
