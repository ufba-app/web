/**
 * Ordem das páginas no menu lateral e na ordem dos cartões do início.
 *
 * O memory não guarda o campo `order` de uma página escrita pelas ferramentas de memória (só título, tags e resumo),
 * e sem ele o Starlight ordena pelo nome do arquivo ("Entrar" antes de "Visão geral"). Esta lista só vale quando a
 * página NÃO traz `order`: um `order` vindo do memory sempre vence. Página fora da lista fica depois das listadas,
 * em ordem alfabética.
 */
export const PAGE_ORDER: readonly string[] = [
  'comecar/visao-geral',
  'comecar/entrar',
  'fontes/sigaa',
  'fontes/moodle',
  'fontes/classroom',
  'assistentes/conectar-o-claude',
  'assistentes/autorizar-e-revogar-apps',
  'memoria/o-que-e',
  'memoria/para-alunos',
  'memoria/para-a-equipe',
  'memoria/conectar-um-computador',
  'memoria/permissoes',
  'memoria/privacidade',
  'seguranca/o-que-e-guardado',
  'seguranca/liberar-o-sigaa-com-o-celular',
  'projeto/codigo-aberto',
  'projeto/glossario',
];

/** Posição (1, 2, 3…) de um caminho do memory (`pasta/arquivo.md`) em PAGE_ORDER, ou `undefined` se não estiver. */
export function listedOrder(path: string): number | undefined {
  const index = PAGE_ORDER.indexOf(path.replace(/\.md$/, ''));
  return index === -1 ? undefined : index + 1;
}
