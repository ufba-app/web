import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { AcademicState, Me } from '../contract';
import { meFixture } from '../contract/fixtures';
import { notify } from '../lib/notify';
import { renderApp } from '../test/render';
import { API, server } from '../test/server';

/** Menu do painel: botão do SIGAA, perfil do celular (matrícula e curso) e a barra de baixo. */

const withSigaa = (status: Me['connections']['sigaa']['status']): Me => {
  const base = meFixture();
  return { ...base, connections: { ...base.connections, sigaa: { ...base.connections.sigaa, status } } };
};

const NO_ACADEMIC: AcademicState = {
  available: true,
  consent: false,
  status: 'NONE',
  failure: null,
  verified: null,
  reader: null,
  importedAt: null,
  curriculumStatus: 'NONE',
  registration: null,
  summary: null,
  draft: null,
};

const hours = { required: 100, completed: 40, pending: 60 };
const IMPORTED: AcademicState = {
  ...NO_ACADEMIC,
  consent: true,
  status: 'READY',
  importedAt: '2026-11-10T12:00:00.000Z',
  curriculumStatus: 'READY',
  registration: '222115043',
  summary: {
    programName: 'Odontologia',
    curriculum: '2019.1',
    currentTerm: 5,
    completionDeadline: { standard: '2029.1', maximum: '2031.1' },
    indices: { cr: 7.8, iap: 7.1 },
    hours: { mandatory: hours, elective: hours, complementary: hours, total: hours },
  },
};

function serve(me: Me, academic: AcademicState = NO_ACADEMIC) {
  server.use(
    http.get(`${API}/me`, () => HttpResponse.json(me)),
    http.get(`${API}/me/academic`, () => HttpResponse.json(academic)),
    http.get(`${API}/authorized-apps`, () => HttpResponse.json({ apps: [] })),
  );
}

const sidebar = () => screen.getByRole('navigation', { name: 'Navegação principal' });
const mobileBar = () => screen.getByRole('navigation', { name: 'Menu do celular' });

beforeEach(() => {
  vi.mocked(notify.error).mockClear();
});

describe('botão do SIGAA no menu', () => {
  it('conectado: "Abrir o SIGAA" logo no alto da lateral', async () => {
    serve(withSigaa('connected'));
    renderApp('/authorized-apps');
    expect(await within(sidebar()).findByRole('button', { name: 'Abrir o SIGAA' })).toBeInTheDocument();
    expect(within(sidebar()).queryByRole('link', { name: 'Reconectar SIGAA' })).toBeNull();
  });

  it.each(['password_required', 'locked'] as const)('com o SIGAA %s: "Reconectar SIGAA" leva a Conexões', async (status) => {
    serve(withSigaa(status));
    renderApp('/authorized-apps');
    const link = await within(sidebar()).findByRole('link', { name: 'Reconectar SIGAA' });
    expect(link).toHaveAttribute('href', '/connections');
    expect(within(sidebar()).queryByRole('button', { name: 'Abrir o SIGAA' })).toBeNull();
  });

  it('desconectado: nenhum botão do SIGAA', async () => {
    serve(withSigaa('disconnected'));
    renderApp('/authorized-apps');
    await within(sidebar()).findByRole('link', { name: 'Apps autorizados' });
    expect(screen.queryByRole('button', { name: 'Abrir o SIGAA' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Reconectar SIGAA' })).toBeNull();
  });

  it('o clique abre a janela e pede a URL de abertura; o SIGAA fechado vira aviso', async () => {
    const popup = { opener: {}, location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockImplementation(() => popup as unknown as Window);
    serve(withSigaa('connected'));
    server.use(
      http.post(`${API}/connections/sigaa/launch`, () =>
        HttpResponse.json({ error: 'source_not_connected', message: 'x' }, { status: 409 }),
      ),
    );
    renderApp('/authorized-apps');
    await userEvent.click(await within(sidebar()).findByRole('button', { name: 'Abrir o SIGAA' }));

    expect(open).toHaveBeenCalledWith('/opening.html', '_blank');
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Libere o SIGAA neste navegador antes de abri-lo.'));
    expect(popup.close).toHaveBeenCalled();
    open.mockRestore();
  });
});

describe('menu do celular', () => {
  it('a barra de baixo tem os 4 atalhos e marca a página atual', async () => {
    serve(withSigaa('connected'));
    renderApp('/connections');
    const bar = await screen.findByRole('navigation', { name: 'Menu do celular' });
    expect(within(bar).getAllByRole('link').map((a) => a.textContent)).toEqual(['Painel', 'Curso', 'Memória', 'Conexões']);
    expect(within(bar).getByRole('link', { name: 'Conexões' })).toHaveAttribute('aria-current', 'page');
    expect(within(mobileBar()).getByRole('link', { name: 'Curso' })).toHaveAttribute('href', '/academic');
  });

  it('o perfil mostra "matrícula · curso" quando o histórico do SIGAA já foi importado', async () => {
    serve(withSigaa('connected'), IMPORTED);
    renderApp('/connections');
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir menu completo' }));
    const sheet = screen.getByRole('region', { name: 'Menu completo' });
    expect(await within(sheet).findByText('222115043 · Odontologia')).toBeInTheDocument();
    expect(within(sheet).getByText('Marina Costa')).toBeInTheDocument();
  });

  it('sem importação, o perfil mostra o e-mail', async () => {
    serve(withSigaa('connected'), NO_ACADEMIC);
    renderApp('/connections');
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir menu completo' }));
    const sheet = screen.getByRole('region', { name: 'Menu completo' });
    expect(await within(sheet).findByText('marina.costa@ufba.br')).toBeInTheDocument();
  });

  it('a folha tem o botão do SIGAA, os grupos e o Sair na base', async () => {
    serve(withSigaa('connected'), IMPORTED);
    renderApp('/connections');
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir menu completo' }));
    const sheet = screen.getByRole('region', { name: 'Menu completo' });
    expect(await within(sheet).findByRole('button', { name: 'Abrir o SIGAA' })).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: /Apps autorizados/ })).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: /Memória/ })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });
});
