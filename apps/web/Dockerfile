# syntax=docker/dockerfile:1
#
# Imagem do painel (meu.ufba.app): compila com Node e serve os arquivos estáticos com Caddy.
# O contexto do build é a RAIZ do monorepo (precisa de packages/web-ui e packages/tokens):
#   docker build -f apps/web/Dockerfile .
# Sem token e sem registry privado: o design system vem do próprio workspace.
# NÃO FOI TESTADA: não havia Docker na máquina de desenvolvimento.

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

# Manifestos primeiro: a camada de `pnpm install` só refaz quando as dependências mudam.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/tokens/package.json packages/tokens/
COPY packages/web-ui/package.json packages/web-ui/
RUN pnpm install --frozen-lockfile

COPY . .
# Endereço público da API. Fica dentro do JS gerado (é público), por isso é variável de build.
ARG VITE_API_URL=https://api.ufba.app
ENV VITE_API_URL=${VITE_API_URL}
# Origens do painel e do app de auth. O painel manda quem está sem sessão para o auth; ficam no JS gerado (são públicas).
# A origem do painel NÃO tem padrão: é o destino do redirect do Caddy e a base dos links; um padrão silencioso
# apontaria para o lugar errado. Sem ela o build falha.
ARG VITE_AUTH_ORIGIN=https://auth.ufba.app
ARG VITE_PANEL_ORIGIN
ENV VITE_AUTH_ORIGIN=${VITE_AUTH_ORIGIN} VITE_PANEL_ORIGIN=${VITE_PANEL_ORIGIN}
RUN test -n "$VITE_PANEL_ORIGIN" || (echo "VITE_PANEL_ORIGIN não está definida (ex.: https://meu.ufba.app)." >&2 && exit 1)
# Compila tokens e web-ui e depois o painel.
RUN pnpm build

FROM caddy:2-alpine
# O Caddy lê VITE_PANEL_ORIGIN (redirect do ufba.app) e VITE_AUTH_ORIGIN (redirect de quem não tem sessão) em tempo
# de execução; repassa os valores do build.
ARG VITE_PANEL_ORIGIN
ARG VITE_AUTH_ORIGIN=https://auth.ufba.app
ENV VITE_PANEL_ORIGIN=${VITE_PANEL_ORIGIN} VITE_AUTH_ORIGIN=${VITE_AUTH_ORIGIN}
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
# O Railway define PORT; o Caddyfile escuta nela (padrão 8080).
EXPOSE 8080
