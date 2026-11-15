// Gera os ícones do app instalável (PNG) a partir de public/brasao.svg. Rode quando o brasão mudar:
//   node scripts/make-icons.mjs        (dentro de apps/web; usa o Chromium do Playwright, já instalado para o e2e)
// Saída em public/icons/. Todos têm fundo branco sólido (o iOS não aceita transparência e o Android recorta em círculo).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const root = new URL('../public/', import.meta.url);
const svg = readFileSync(new URL('brasao.svg', root), 'utf8');
mkdirSync(new URL('icons/', root), { recursive: true });

/** tamanho (px), quanto da largura o brasão ocupa e nome do arquivo.
 *  `maskable`: o Android corta em círculo ou quadrado arredondado; só os 80% do meio são garantidos, por isso o brasão fica menor. */
const ICONS = [
  { size: 192, fill: 0.78, name: 'icon-192.png' },
  { size: 512, fill: 0.78, name: 'icon-512.png' },
  { size: 512, fill: 0.58, name: 'icon-maskable-512.png' },
  { size: 180, fill: 0.7, name: 'apple-touch-icon.png' },
];

const browser = await chromium.launch();
try {
  for (const { size, fill, name } of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;background:#fff}#s{position:absolute;inset:0}</style><div id="s">${svg}</div>`,
    );
    // Mede o desenho de verdade (o SVG tem folga em volta) e o centraliza ocupando `fill` da largura.
    await page.evaluate(
      ({ size, fill }) => {
        const el = document.querySelector('#s svg');
        el.removeAttribute('width');
        el.removeAttribute('height');
        const box = el.getBBox();
        const scale = (size * fill) / Math.max(box.width, box.height);
        el.setAttribute('width', String(size));
        el.setAttribute('height', String(size));
        el.setAttribute('viewBox', `${box.x - (size / scale - box.width) / 2} ${box.y - (size / scale - box.height) / 2} ${size / scale} ${size / scale}`);
      },
      { size, fill },
    );
    writeFileSync(new URL(`icons/${name}`, root), await page.screenshot({ type: 'png' }));
    console.log(`icons/${name} (${size}x${size})`);
    await page.close();
  }
} finally {
  await browser.close();
}
