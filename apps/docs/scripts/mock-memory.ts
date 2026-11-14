/**
 * memory simulado para desenvolver o site sem a chave de verdade: `pnpm --filter @ufba-app/docs mock`.
 * Depois: MEMORY_BASE_URL=http://localhost:4010 MEMORY_DOCS_KEY=dev-mock-key pnpm --filter @ufba-app/docs content
 * O conteúdo abaixo é de exemplo (textos do canvas) e inclui páginas que NÃO devem sair no site (sem a tag public)
 * e uma página com HTML cru e link perigoso, para conferir que o render os neutraliza.
 */
import { createServer } from 'node:http';

const KEY = 'dev-mock-key';
const BASE = '/api/v1/workspaces/ufba-app/projects/docs/pages';

type Page = { path: string; title: string; tags: string[]; order?: number; body: string };

const PAGES: Page[] = [
  {
    path: 'index.md',
    title: 'Documentação do ufba.app',
    tags: ['public'],
    body: 'Como conectar as suas fontes, autorizar um assistente e usar.',
  },
  {
    path: 'comecar/visao-geral.md',
    title: 'Visão geral',
    tags: ['public'],
    order: 1,
    body: '# Visão geral\n\nO ufba.app deixa um assistente de IA ler os seus dados acadêmicos, só leitura, quando você autoriza.\n\n## Como funciona\n\nVocê entra com a conta @ufba.br, conecta as fontes e autoriza o assistente.\n\n## Fontes\n\n| Fonte | O que o assistente lê |\n| --- | --- |\n| SIGAA | Matérias, turmas e prazos |\n| Moodle | Atividades e avisos |\n| Classroom | Turmas e tarefas |',
  },
  {
    path: 'comecar/entrar-e-conectar.md',
    title: 'Entrar e conectar',
    tags: ['public'],
    order: 2,
    body: 'Entre no ufba.app com a sua conta @ufba.br e conecte ao menos uma fonte em **Conexões**.\n\n:::tip[Tudo some junto]\nRevogar apaga os tokens do app e a senha do SIGAA cifrada para ele.\n:::',
  },
  {
    path: 'assistentes/conectar-o-claude.md',
    title: 'Conectar o Claude',
    tags: ['public'],
    order: 1,
    body: '# Conectar o Claude\n\nAdicione o ufba.app ao seu assistente e autorize a leitura dos seus dados acadêmicos.\n\n:::note[Antes de começar]\nEntre no ufba.app e conecte ao menos uma fonte.\n:::\n\n## Passos\n\n1. Adicione o servidor ao Claude.\n2. Autorize o pedido.\n3. Pergunte.\n\n```bash\nclaude mcp add --transport http ufba https://ufba.app/mcp\n```\n\n:::caution[Confira o endereço]\nO selo Verificado só aparece para apps conhecidos.\n:::\n\n## Duração do acesso\n\nO acesso dura 1 hora e é renovado sozinho. A renovação vale por 30 dias.',
  },
  {
    path: 'seguranca/o-que-e-guardado.md',
    title: 'O que é guardado',
    tags: ['public'],
    order: 1,
    body: 'Login e senha cifrada do SIGAA. Nada do conteúdo das aulas.\n\nVeja o [código](https://github.com/ufba-app/api).',
  },
  {
    path: 'projeto/hostil.md',
    title: 'Página hostil (teste)',
    tags: ['public'],
    body: 'Texto antes.\n\n<script>alert("xss")</script>\n\n<img src=x onerror=alert(1)>\n\n[clique aqui](javascript:alert(1)) e [seguro](https://ufba.app).\n\n![rastreador](https://tracker.example/p.png)',
  },
  { path: 'decisions/0007-db.md', title: 'Standardised on Postgres', tags: ['adr'], body: 'Interno: não pode aparecer no site.' },
  { path: 'rascunho.md', title: 'Rascunho', tags: [], body: 'Sem tag: não pode aparecer no site.' },
];

// MOCK_ONLY_INDEX=1: só o index.md (a situação real do primeiro dia).
const ACTIVE = process.env.MOCK_ONLY_INDEX ? PAGES.filter((p) => p.path === 'index.md') : PAGES;

createServer((req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: 'unauthorized' });
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === BASE) {
    return send(200, ACTIVE.map((p) => ({ path: p.path, title: p.title, kind: 'doc', tier: 'semantic', updated_at: '2026-11-12T10:00:00.000Z' })));
  }
  if (url.pathname.startsWith(`${BASE}/`)) {
    const path = decodeURIComponent(url.pathname.slice(BASE.length + 1));
    const page = ACTIVE.find((p) => p.path === path);
    if (!page) return send(404, { error: 'not_found' });
    return send(200, {
      id: path,
      project: 'docs',
      path,
      title: page.title,
      kind: 'doc',
      updated_at: '2026-11-12T10:00:00.000Z',
      frontmatter: { tags: page.tags, ...(page.order ? { order: page.order } : {}) },
      body_markdown: page.body,
      links: [],
      backlinks: [],
    });
  }
  return send(404, { error: 'not_found' });
}).listen(4010, () => console.log(`memory simulado em http://localhost:4010 (chave: ${KEY})`));
