import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { API, server } from '../test/server';
import { runOpening, type OpeningNav } from './openingPage';

/**
 * A aba `/opening.html` (aberta pelo "Abrir o SIGAA já logado") pede o link de uso único à API e segue para ele.
 * Aqui o que importa: o token é pedido AGORA, o painel nunca busca a URL por fetch, e todo erro aparece NA aba.
 */

const LAUNCH_URL = `${API}/sigaa/launch?t=token-de-uso-unico`;

let root: HTMLElement;
let nav: { [K in keyof OpeningNav]: ReturnType<typeof vi.fn> };
let posts: Array<{ body: unknown; csrf: string | null }>;
let launchGets: number;

beforeEach(() => {
  document.body.innerHTML = `
    <div class="boot" id="opening" role="status">
      <img class="boot__mark" src="/brasao.svg" alt="" />
      <span class="boot__sr">Abrindo o SIGAA</span>
    </div>`;
  root = document.getElementById('opening') as HTMLElement;
  nav = { replace: vi.fn(), close: vi.fn(), home: vi.fn() };
  posts = [];
  launchGets = 0;
  server.use(
    http.post(`${API}/connections/sigaa/launch`, async ({ request }) => {
      posts.push({ body: await request.json(), csrf: request.headers.get('x-ufba') });
      return HttpResponse.json({ launchUrl: LAUNCH_URL });
    }),
    // A página NUNCA busca a URL de abertura por fetch (a API recusa com 403, e a senha não pode passar pelo JS).
    http.get(`${API}/sigaa/launch`, () => {
      launchGets += 1;
      return new HttpResponse(null, { status: 403 });
    }),
  );
});

const run = () => runOpening(root, nav as unknown as OpeningNav);
const failWith = (status: number, error: string, message = 'Falhou do lado da API.') =>
  server.use(http.post(`${API}/connections/sigaa/launch`, () => HttpResponse.json({ error, message }, { status })));

describe('abrindo o SIGAA', () => {
  it('pede o link com a sessão do painel (X-UFBA e corpo {}) e segue para ele, trocando a página', async () => {
    await run();
    expect(posts).toEqual([{ body: {}, csrf: '1' }]);
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith(LAUNCH_URL);
    // Navegação de página inteira: o `fetch` nunca vai à URL de abertura.
    expect(launchGets).toBe(0);
    // Deu certo: continua só o brasão, sem erro.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(root.querySelector('.boot__mark')).not.toBeNull();
  });

  it('o token só é pedido quando a página roda, uma vez por abertura', async () => {
    expect(posts).toHaveLength(0); // nada pede o link antes
    await run();
    expect(posts).toHaveLength(1);
  });

  it.each([
    ['409 source_not_connected', 409, 'source_not_connected', 'Libere o SIGAA neste navegador antes de abri-lo.'],
    ['429 too_many_attempts', 429, 'too_many_attempts', 'Muitas aberturas seguidas. Espere alguns minutos e tente de novo.'],
    ['401 session_expired', 401, 'session_expired', 'Sua sessão venceu. Entre de novo no painel.'],
    ['500 outro erro', 500, 'internal_error', 'Falhou do lado da API.'],
  ])('%s: o erro aparece na própria aba, sem navegar', async (_label, status, code, text) => {
    failWith(status, code);
    await run();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Não deu para abrir o SIGAA');
    expect(alert).toHaveTextContent(text);
    expect(nav.replace).not.toHaveBeenCalled();
    // O brasão piscando sai, e o foco vai para o botão principal.
    expect(root.querySelector('.boot__mark')).toBeNull();
    expect(screen.getByRole('button', { name: 'Voltar ao painel' })).toHaveFocus();
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>1</script>', 'isso-nao-e-url', ''])(
    'a API devolveu uma URL que não é de navegação (%s): não navega e avisa',
    async (launchUrl) => {
      server.use(http.post(`${API}/connections/sigaa/launch`, () => HttpResponse.json({ launchUrl })));
      await run();
      expect(nav.replace).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('Não deu para abrir o SIGAA agora. Tente de novo.');
    },
  );

  it('falha de rede: mostra o erro na aba, sem navegar', async () => {
    server.use(http.post(`${API}/connections/sigaa/launch`, () => HttpResponse.error()));
    await run();
    expect(screen.getByRole('alert')).toHaveTextContent('Não deu para abrir o SIGAA');
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('a mensagem da API entra como texto, nunca como HTML', async () => {
    failWith(500, 'internal_error', '<img src=x onerror="window.pwned=1"><b>oi</b>');
    await run();
    expect(screen.getByRole('alert')).toHaveTextContent('<img src=x onerror="window.pwned=1"><b>oi</b>');
    expect(root.querySelector('img[src="x"]')).toBeNull();
    expect(root.querySelector('b')).toBeNull();
  });
});

describe('botões do erro', () => {
  it('"Voltar ao painel" leva ao painel nesta aba', async () => {
    failWith(409, 'source_not_connected');
    await run();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar ao painel' }));
    expect(nav.home).toHaveBeenCalledTimes(1);
  });

  it('"Fechar esta aba" fecha; se a aba continuar, diz para fechar pelo navegador', async () => {
    failWith(409, 'source_not_connected');
    await run();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar esta aba' }));
    expect(nav.close).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Se a aba não fechou sozinha, feche-a pelo navegador.'));
  });
});
