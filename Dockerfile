# syntax=docker/dockerfile:1
#
# Imagem do web (ufba.app): compila com Node e serve os arquivos estáticos com Caddy.
# ANTES DE SUBIR: o package.json usa `link:../design-system/...` (link local) e isso não existe dentro do build.
# Troque por versões publicadas de @ufba-app/web-ui e @ufba-app/tokens (workflow Release do design-system) e atualize o pnpm-lock.yaml.
# NÃO FOI TESTADA: não havia Docker na máquina de desenvolvimento.

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml .npmrc ./

# Token de leitura (read:packages) para instalar @ufba-app/* do GitHub Packages. Só existe neste estágio:
# a imagem final não herda nada dele. Nunca escreva o valor aqui; passe como variável de build do serviço.
ARG GITHUB_TOKEN
RUN echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" > /root/.npmrc \
    && pnpm install --frozen-lockfile \
    && rm -f /root/.npmrc

COPY . .
# Endereço público da API. Fica dentro do JS gerado (é público), por isso é variável de build.
ARG VITE_API_URL=https://api.ufba.app
ENV VITE_API_URL=${VITE_API_URL}
# Origens do painel e do app de auth. O painel manda quem está sem sessão para o auth; ficam no JS gerado (são públicas).
ARG VITE_AUTH_ORIGIN=https://auth.ufba.app
ARG VITE_PANEL_ORIGIN=https://ufba.app
ENV VITE_AUTH_ORIGIN=${VITE_AUTH_ORIGIN} VITE_PANEL_ORIGIN=${VITE_PANEL_ORIGIN}
RUN pnpm build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
# O Railway define PORT; o Caddyfile escuta nela (padrão 8080).
EXPOSE 8080
