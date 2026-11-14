import { safeReturnPath } from './safe';

/**
 * Origens dos apps. O painel (ufba.app) e o auth (auth.ufba.app) são apps separados; um manda a pessoa para o
 * outro. As origens são FIXAS no build (`VITE_PANEL_ORIGIN`, `VITE_AUTH_ORIGIN`): nunca vêm da URL, de parâmetro nem
 * da API. É o que impede um link `?return=https://evil` de virar redirecionamento para fora.
 *
 * Em desenvolvimento há padrões (painel :3001, auth :3002). Em build de produção a variável é obrigatória: sem
 * padrão silencioso, para um deploy mal configurado falhar alto em vez de apontar para localhost.
 * São funções (e não constantes) para o erro aparecer só quando alguém realmente precisa da origem: o painel ainda
 * monta o login por aqui e seu build não pode quebrar ao ser carregado.
 */
const DEV_ORIGINS = { VITE_PANEL_ORIGIN: 'http://localhost:3001', VITE_AUTH_ORIGIN: 'http://localhost:3002' } as const;

function readOrigin(name: keyof typeof DEV_ORIGINS): string {
  const value = (import.meta.env[name] as string | undefined)?.trim();
  if (!value) {
    if (import.meta.env.PROD) throw new Error(`${name} não está definida no build de produção.`);
    return DEV_ORIGINS[name];
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} não é uma URL válida.`);
  }
  const onlyOrigin = url.pathname.replace(/\/+$/, '') === '' && !url.search && !url.hash;
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !onlyOrigin) {
    throw new Error(`${name} deve ser só a origem (https://host), sem caminho.`);
  }
  return url.origin;
}

export function getPanelOrigin(): string {
  return readOrigin('VITE_PANEL_ORIGIN');
}

export function getAuthOrigin(): string {
  return readOrigin('VITE_AUTH_ORIGIN');
}

/** URL completa de um caminho do painel. O caminho precisa ser relativo e seguro; qualquer outra coisa vira `/`. */
export function panelUrl(path: string | null | undefined): string {
  return `${getPanelOrigin()}${safeReturnPath(path, '/')}`;
}

/** URL completa de um caminho do auth (mesma validação de `panelUrl`). */
export function authUrl(path: string | null | undefined): string {
  return `${getAuthOrigin()}${safeReturnPath(path, '/')}`;
}
