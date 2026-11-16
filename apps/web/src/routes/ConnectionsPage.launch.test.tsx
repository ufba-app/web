import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Me } from '../contract';
import { meFixture } from '../contract/fixtures';
import { mockLocationAssign, renderApp } from '../test/render';
import { API, server } from '../test/server';

/**
 * O botão "Abrir o SIGAA já logado" só abre a aba `/opening.html` NO CLIQUE. Quem pede o link à API e segue para o
 * SIGAA é essa aba (src/opening/openingPage.test.ts): o painel não espera a API nem controla a aba de longe.
 */

type FakeWindow = { opener: unknown };

let me: Me;
let apiCalls: string[];
let openSpy: ReturnType<typeof vi.spyOn>;
let popup: FakeWindow;

const withSigaa = (status: Me['connections']['sigaa']['status']): Me => {
  const base = meFixture();
  return { ...base, connections: { ...base.connections, sigaa: { ...base.connections.sigaa, status } } };
};

beforeEach(() => {
  me = meFixture();
  apiCalls = [];
  popup = { opener: {} };
  openSpy = vi.spyOn(window, 'open').mockImplementation(() => popup as unknown as Window);
  server.use(
    http.get(`${API}/me`, () => HttpResponse.json(me)),
    // O painel NÃO pede o link nem abre a URL de abertura: se pedir, o teste vê.
    http.post(`${API}/connections/sigaa/launch`, () => {
      apiCalls.push('POST /connections/sigaa/launch');
      return HttpResponse.json({ launchUrl: `${API}/sigaa/launch?t=x` });
    }),
    http.get(`${API}/sigaa/launch`, () => {
      apiCalls.push('GET /sigaa/launch');
      return new HttpResponse(null, { status: 403 });
    }),
  );
});

/** O cartão do SIGAA da página: a lateral e a folha do menu também têm um botão "Abrir o SIGAA". */
const sigaaCard = async () => (await screen.findByRole('heading', { name: 'SIGAA', level: 3 })).closest('article')!;
const openButton = async () => within(await sigaaCard()).findByRole('button', { name: 'Abrir o SIGAA' });
const cardButton = async () => within(await sigaaCard()).queryByRole('button', { name: 'Abrir o SIGAA' });

describe('/connections · Abrir o SIGAA já logado', () => {
  it('aparece só com o SIGAA conectado, ao lado de Desconectar', async () => {
    renderApp('/connections');
    expect(await openButton()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desconectar o SIGAA' })).toBeInTheDocument();
  });

  it.each(['disconnected', 'password_required', 'locked'] as const)('não aparece com o SIGAA %s', async (status) => {
    me = withSigaa(status);
    renderApp('/connections');
    await screen.findByRole('heading', { name: 'SIGAA', level: 3 });
    expect(await cardButton()).toBeNull();
  });

  it('abre a aba /opening.html NO CLIQUE, sem ligação com o painel, e não chama a API', async () => {
    renderApp('/connections');
    await userEvent.click(await openButton());

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith('/opening.html', '_blank');
    // A aba nova perde a ligação com o painel: a página do SIGAA não o alcança.
    expect(popup.opener).toBeNull();
    // O link de uso único só nasce na aba nova, nunca aqui: o painel não pede nada à API.
    expect(apiCalls).toEqual([]);
  });

  it('cada clique abre uma aba (o link é de uso único e quem pede é a aba)', async () => {
    renderApp('/connections');
    await userEvent.click(await openButton());
    await userEvent.click(await openButton());
    expect(openSpy).toHaveBeenCalledTimes(2);
    expect(apiCalls).toEqual([]);
  });

  it('navegador bloqueou a aba (window.open devolve null): a mesma página abre nesta aba', async () => {
    openSpy.mockImplementation(() => null);
    const assign = mockLocationAssign();
    renderApp('/connections');
    await userEvent.click(await openButton());
    expect(assign).toHaveBeenCalledWith('/opening.html');
    expect(apiCalls).toEqual([]);
  });
});
