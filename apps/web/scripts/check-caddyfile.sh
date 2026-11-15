#!/usr/bin/env bash
# Prova o Caddyfile do painel num Caddy de verdade (imagem oficial), sem rodar binário na máquina de ninguém.
# Roda no CI (job `ci`, depois do build do painel) e em qualquer máquina com Docker:
#   pnpm --filter @ufba-app/web build && bash apps/web/scripts/check-caddyfile.sh
# 1) `caddy validate` no Caddyfile; 2) sobe o container servindo apps/web/dist e confere os redirects com curl.
# Sem segredo: as origens abaixo são de exemplo (públicas).
set -euo pipefail

CADDY_IMAGE="${CADDY_IMAGE:-caddy:2.11.9}"
PANEL_ORIGIN="https://meu.ufba.app"
AUTH_ORIGIN="https://auth.ufba.app"
PORT_HOST="${CADDY_TEST_PORT:-8089}"
NAME="caddy-check-$$"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
caddyfile="$root/Caddyfile"
dist="$root/dist"

[ -f "$caddyfile" ] || { echo "Caddyfile não encontrado em $caddyfile" >&2; exit 1; }
[ -f "$dist/shell.html" ] || { echo "Falta $dist/shell.html: rode o build do painel antes." >&2; exit 1; }

echo "== caddy validate ($CADDY_IMAGE)"
docker run --rm \
  -e VITE_PANEL_ORIGIN="$PANEL_ORIGIN" -e VITE_AUTH_ORIGIN="$AUTH_ORIGIN" \
  -v "$caddyfile:/etc/caddy/Caddyfile:ro" \
  "$CADDY_IMAGE" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "== subindo o Caddy em :$PORT_HOST"
docker run -d --name "$NAME" -p "$PORT_HOST:8080" \
  -e VITE_PANEL_ORIGIN="$PANEL_ORIGIN" -e VITE_AUTH_ORIGIN="$AUTH_ORIGIN" \
  -v "$caddyfile:/etc/caddy/Caddyfile:ro" -v "$dist:/srv:ro" \
  "$CADDY_IMAGE" >/dev/null

base="http://127.0.0.1:$PORT_HOST"
for _ in $(seq 1 30); do
  curl -s -o /dev/null "$base/" && break
  sleep 1
done
curl -s -o /dev/null "$base/" || { echo "Caddy não respondeu:" >&2; docker logs "$NAME" >&2; exit 1; }

fail=0
# expect <descrição> <status esperado> <Location esperado ou vazio> -- <argumentos do curl>
expect() {
  local desc="$1" want_status="$2" want_location="$3"
  shift 4
  local out status location
  out="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$@")"
  status="${out%% *}"
  location="${out#* }"
  if [ "$status" = "$want_status" ] && { [ -z "$want_location" ] || [ "$location" = "$want_location" ]; }; then
    echo "ok   $desc -> $status ${location}"
  else
    echo "FAIL $desc: esperado $want_status ${want_location:-(sem Location)}, veio $status ${location}" >&2
    fail=1
  fi
}

cookie='Cookie: ufba_signed_in=1'

expect 'sem cookie em /connections vai para o login (302, return=caminho)' 302 "$AUTH_ORIGIN/sign-in?return=/connections" -- "$base/connections"
expect 'sem cookie em / vai para o login com return=/' 302 "$AUTH_ORIGIN/sign-in?return=/" -- "$base/"
expect 'sem cookie em subrota do painel' 302 "$AUTH_ORIGIN/sign-in?return=/authorized-apps/x" -- "$base/authorized-apps/x"
expect 'cookie parecido (ufba_signed_in=0) continua sem sessão' 302 "$AUTH_ORIGIN/sign-in?return=/connections" -- -H 'Cookie: ufba_signed_in=0' "$base/connections"
expect 'cookie de sessão sozinho não vale (o painel nunca o recebe)' 302 "$AUTH_ORIGIN/sign-in?return=/connections" -- -H 'Cookie: __Host-ufba_session=x' "$base/connections"
expect 'com o marcador entre outros cookies serve o painel' 200 '' -- -H 'Cookie: a=b; ufba_signed_in=1; c=d' "$base/connections"
expect 'com o marcador serve o painel em /' 200 '' -- -H "$cookie" "$base/"
expect 'captura do Moodle nunca redireciona (token na URL)' 200 '' -- "$base/connections/moodle/capture?token=x"
expect 'rota que não é do painel não redireciona' 200 '' -- "$base/qualquer-coisa"
expect 'healthz sem cookie responde 200 (healthcheck do Railway)' 200 '' -- "$base/healthz"
expect 'healthz com Host ufba.app também responde 200, sem redirect' 200 '' -- -H 'Host: ufba.app' "$base/healthz"

health_headers="$(curl -s -D - -o /dev/null "$base/healthz" | tr -d '\r')"
case "$health_headers" in
  *[Cc]ache-[Cc]ontrol:*no-store*) echo "ok   healthz com Cache-Control: no-store" ;;
  *) echo "FAIL healthz sem Cache-Control: no-store" >&2; fail=1 ;;
esac
if [ -z "$(curl -s "$base/healthz")" ]; then
  echo "ok   healthz sem corpo"
else
  echo "FAIL healthz devolveu corpo" >&2
  fail=1
fi

expect 'Host ufba.app vai para o painel (301, caminho e query preservados)' 301 "$PANEL_ORIGIN/connections?x=1" -- -H 'Host: ufba.app' "$base/connections?x=1"

body="$(curl -s -H "$cookie" "$base/connections")"
case "$body" in
  *'<title>'*) echo "ok   o painel com sessão devolve HTML" ;;
  *) echo "FAIL o painel com sessão não devolveu HTML" >&2; fail=1 ;;
esac

if [ "$fail" -ne 0 ]; then
  echo "--- logs do Caddy" >&2
  docker logs "$NAME" >&2 || true
  exit 1
fi
echo "Caddyfile do painel: todas as verificações passaram."
