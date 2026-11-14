/**
 * Plugin remark que deixa o markdown do memory "só markdown": sem HTML cru, sem imagem de fora e sem link com
 * protocolo perigoso (`javascript:`, `data:`, ...). O conteúdo vem de outro sistema; o site não confia nele.
 * - HTML cru vira texto visível (o leitor vê a tag escrita, ela não executa).
 * - Imagem vira o texto alternativo.
 * - Link com protocolo fora de http, https e mailto perde o link e fica só o texto.
 */

type Node = {
  type: string;
  value?: string;
  url?: string;
  alt?: string | null;
  children?: Node[];
};

const SAFE_PROTOCOL = /^(?:https?|mailto):/i;
const ANY_PROTOCOL = /^[a-z][a-z0-9+.-]*:/i;
/** Caracteres que o navegador ignora dentro do protocolo (java<quebra>script:), tirados antes de conferir. */
const isInvisible = (char: string) => {
  const code = char.charCodeAt(0);
  return code <= 32 || (code >= 127 && code <= 159) || (code >= 0x200b && code <= 0x200f) || code === 0x2028 || code === 0x2029 || code === 0xfeff;
};

export function isSafeUrl(url: string): boolean {
  const normalized = [...url].filter((char) => !isInvisible(char)).join('');
  if (normalized.startsWith('//')) return false;
  return SAFE_PROTOCOL.test(normalized) || !ANY_PROTOCOL.test(normalized);
}

const BLOCK_PARENTS = new Set(['root', 'blockquote', 'listItem']);

function clean(node: Node): void {
  if (!node.children) return;
  const next: Node[] = [];
  for (const child of node.children) {
    if (child.type === 'html') {
      const text: Node = { type: 'text', value: child.value ?? '' };
      next.push(BLOCK_PARENTS.has(node.type) ? { type: 'paragraph', children: [text] } : text);
      continue;
    }
    if (child.type === 'image' || child.type === 'imageReference') {
      const alt = child.alt?.trim();
      if (alt) next.push({ type: 'text', value: alt });
      continue;
    }
    if (child.type === 'link' && !isSafeUrl(child.url ?? '')) {
      clean(child);
      next.push(...(child.children ?? []));
      continue;
    }
    if (child.type === 'definition' && !isSafeUrl(child.url ?? '')) {
      child.url = '#';
    }
    clean(child);
    next.push(child);
  }
  node.children = next;
}

export default function remarkSafe() {
  return (tree: Node) => clean(tree);
}
