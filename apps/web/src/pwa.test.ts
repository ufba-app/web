import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

/**
 * App instalável (docs/pwa.md). Os testes rodam em apps/web (mesmo cwd dos outros testes de arquivo).
 * Sem manifest completo e ícones nos tamanhos certos o navegador simplesmente não oferece "Instalar".
 */

type Icon = { src: string; sizes: string; type: string; purpose?: string };
type Manifest = {
  id: string;
  name: string;
  short_name: string;
  lang: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: Icon[];
};

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as Manifest;

/** Largura e altura de um PNG, lidas do cabeçalho (IHDR). */
function pngSize(path: string): [number, number] {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString('latin1'), `${path} não é PNG`).toBe('PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

const publicPath = (url: string) => `public${url}`;

test('o manifest tem o que o navegador exige para oferecer "Instalar"', () => {
  expect(manifest.name).toBeTruthy();
  expect(manifest.short_name).toBeTruthy();
  expect(manifest.short_name.length).toBeLessThanOrEqual(12); // o nome embaixo do ícone na tela inicial
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  expect(manifest.scope).toBe('/');
  expect(manifest.id).toBe('/');
  expect(manifest.lang).toBe('pt-BR');
  expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
});

test('há ícone de 192 e de 512 e um maskable, e cada arquivo tem o tamanho que declara', () => {
  const sizes = (purpose: string) => manifest.icons.filter((i) => (i.purpose ?? 'any') === purpose).map((i) => i.sizes);
  expect(sizes('any')).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(sizes('maskable')).toContain('512x512');
  for (const icon of manifest.icons) {
    expect(icon.type).toBe('image/png');
    expect(existsSync(publicPath(icon.src)), `${icon.src} não existe`).toBe(true);
    const [w, h] = pngSize(publicPath(icon.src));
    expect(`${w}x${h}`, icon.src).toBe(icon.sizes);
  }
});

test.each(['index.html', 'shell.html'])('%s liga o manifest, o ícone do iPhone e a cor da barra', (file) => {
  const html = readFileSync(file, 'utf8');
  expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
  expect(html).toMatch(/<link rel="apple-touch-icon" href="(\/icons\/apple-touch-icon\.png)" \/>/);
  expect(html).toContain(`<meta name="theme-color" content="${manifest.theme_color}" />`);
  expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
  expect(html).toContain('<meta name="mobile-web-app-capable" content="yes" />');
});

test('o ícone do iPhone existe e tem 180x180 (o iOS não aceita outro tamanho sem pedir)', () => {
  expect(pngSize('public/icons/apple-touch-icon.png')).toEqual([180, 180]);
});

test('o Caddy serve o manifest com o tipo certo', () => {
  const caddy = readFileSync('Caddyfile', 'utf8');
  expect(caddy).toMatch(/@manifest path \/manifest\.webmanifest/);
  expect(caddy).toMatch(/header @manifest Content-Type "application\/manifest\+json"/);
});

test('o app de login (outra origem) não declara o manifest do painel', () => {
  expect(readFileSync('auth.html', 'utf8')).not.toContain('manifest.webmanifest');
});
