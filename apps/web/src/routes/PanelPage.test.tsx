import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { Me, MyCalendar } from '../contract';
import { meFixture } from '../contract/fixtures';
import { legacyDeliveryItems, myCalendarFixture } from '../contract/panelFixture';
import { meHandler, renderApp } from '../test/render';
import { API, server } from '../test/server';

/**
 * O Painel com o calendário já compilado pela API (GET /me/calendar, api#61). "Hoje" é fixado em 15/11/2026 (domingo) no
 * fuso da UFBA, e a API é simulada com os dados fixos de `panelFixture`.
 */
let requests: Array<{ from: string | null; to: string | null }>;
let calendar: (from: string, to: string) => MyCalendar;

const withSiasb = (): Me => {
  const base = meFixture();
  return { ...base, connections: { ...base.connections, siasb: { ...base.connections.siasb, offered: true, status: 'connected' } } };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-15T15:00:00.000Z')); // 12:00 em Salvador
  requests = [];
  calendar = (from, to) => myCalendarFixture({ from, to });
  server.use(
    meHandler(),
    http.get(`${API}/me/calendar`, ({ request }) => {
      const url = new URL(request.url);
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      requests.push({ from, to });
      return HttpResponse.json(calendar(from ?? '', to ?? ''));
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('/ · Painel', () => {
  it('abre no mês de hoje, pede à API o intervalo visível (a grade com os dias de fora) e mostra o dia de hoje', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: /Novembro/ })).toHaveTextContent('Novembro2026');
    expect(requests).toEqual([{ from: '2026-11-01', to: '2026-12-05' }]);
    // O cabeçalho da página diz o dia de hoje; o dia escolhido começa em hoje.
    expect(screen.getByText('Domingo, 15 de novembro', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Domingo, 15 de novembro' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^15 de novembro/ })).toHaveAttribute('aria-current', 'date');
  });

  it('escolher um dia mostra o que há nele: a aula, com horário e sala', async () => {
    renderApp('/');
    const user = userEvent.setup({ advanceTimers: () => {} });
    await user.click(await screen.findByRole('button', { name: /^17 de novembro/ }));
    const detail = await screen.findByRole('region', { name: 'Terça, 17 de novembro' });
    expect(within(detail).getByText('Histologia')).toBeInTheDocument();
    expect(within(detail).getByText('10:00–12:00 · Lab. 2')).toBeInTheDocument();
    expect(within(detail).getByText('1 coisa')).toBeInTheDocument();
  });

  it('ENTREGAS e PROVAS que a API ainda mande não aparecem (decisão do André): nem no dia, nem na grade, nem na legenda', async () => {
    calendar = (from, to) => {
      const base = myCalendarFixture({ from, to });
      return { ...base, days: base.days.map((d) => (d.date === '2026-11-17' ? { ...d, items: [...legacyDeliveryItems('2026-11-17'), ...d.items] } : d)) };
    };
    const { container } = renderApp('/');
    const user = userEvent.setup({ advanceTimers: () => {} });
    await user.click(await screen.findByRole('button', { name: /^17 de novembro/ }));
    const detail = await screen.findByRole('region', { name: 'Terça, 17 de novembro' });
    expect(within(detail).queryByText(/Prova 2/)).toBeNull();
    expect(within(detail).queryByText(/Relatório de prática/)).toBeNull();
    expect(within(detail).getByText('1 coisa')).toBeInTheDocument(); // só a aula
    expect(screen.getByRole('button', { name: /^17 de novembro/ })).toHaveAccessibleName('17 de novembro: Aula, Histologia');
    expect(container.querySelector('.pn-legenda')).not.toHaveTextContent(/Entrega|Prova/);
  });

  it('feriado: aparece como "Sem aula" e nenhuma aula nesse dia', async () => {
    renderApp('/');
    const user = userEvent.setup({ advanceTimers: () => {} });
    await user.click(await screen.findByRole('button', { name: /^20 de novembro/ }));
    const detail = await screen.findByRole('region', { name: 'Sexta, 20 de novembro' });
    expect(within(detail).getByText('Consciência Negra')).toBeInTheDocument();
    expect(within(detail).getByText('Sem aula', { selector: '.pn-selo' })).toBeInTheDocument();
    expect(within(detail).queryByText('Aula', { selector: '.pn-selo' })).toBeNull();
  });

  it('a sessão da clínica (SIASB) aparece para quem a API manda, com o nome fixo e o selo "Clínica"', async () => {
    server.use(meHandler(withSiasb()));
    renderApp('/');
    const user = userEvent.setup({ advanceTimers: () => {} });
    await user.click(await screen.findByRole('button', { name: /^12 de novembro/ }));
    const detail = await screen.findByRole('region', { name: 'Quinta, 12 de novembro' });
    expect(within(detail).getByText('Sessão na clínica')).toBeInTheDocument();
    expect(within(detail).getByText('Clínica', { selector: '.pn-selo' })).toBeInTheDocument();
  });

  it('próximo mês: pede o intervalo do mês seguinte e o título muda; "Hoje" volta', async () => {
    renderApp('/');
    const user = userEvent.setup({ advanceTimers: () => {} });
    await user.click(await screen.findByRole('button', { name: 'Próximo mês' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /Dezembro/ })).toBeInTheDocument());
    await waitFor(() => expect(requests).toContainEqual({ from: '2026-11-29', to: '2027-01-02' }));
    await user.click(screen.getByRole('button', { name: 'Hoje' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /Novembro/ })).toBeInTheDocument());
  });

  it('semana: pede só os 7 dias da semana e a navegação anda de 7 em 7', async () => {
    renderApp('/');
    const user = userEvent.setup({ advanceTimers: () => {} });
    await user.click(await screen.findByRole('button', { name: 'Semana' }));
    await waitFor(() => expect(requests).toContainEqual({ from: '2026-11-15', to: '2026-11-21' }));
    await user.click(screen.getByRole('button', { name: 'Próxima semana' }));
    await waitFor(() => expect(requests).toContainEqual({ from: '2026-11-22', to: '2026-11-28' }));
  });

  it('enquanto o primeiro intervalo chega, a forma do calendário aparece em esqueleto (sem spinner)', async () => {
    server.use(http.get(`${API}/me/calendar`, async () => new Promise(() => {})));
    const { container } = renderApp('/');
    await waitFor(() => expect(container.querySelector('.pn-cal--sk')).not.toBeNull());
    expect(container.querySelector('.pn-cal--sk')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('region', { name: 'Calendário' })).toBeNull();
  });

  it('uma fonte que falhou: o resto aparece e um aviso diz qual (com "Tentar de novo")', async () => {
    calendar = (from, to) => myCalendarFixture({ from, to, sources: [{ source: 'sigaa', status: 'failed' }, { source: 'siasb', status: 'ok' }] });
    renderApp('/');
    expect(await screen.findByText(/Não deu para atualizar SIGAA agora/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Calendário' })).toBeInTheDocument();
    const before = requests.length;
    await userEvent.setup({ advanceTimers: () => {} }).click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(requests.length).toBeGreaterThan(before));
  });

  it('Moodle e Classroom não são assunto do Painel: uma falha ou reconexão deles não gera aviso', async () => {
    calendar = (from, to) =>
      myCalendarFixture({ from, to, sources: [{ source: 'moodle', status: 'failed' }, { source: 'classroom', status: 'reconnect_required' }] });
    renderApp('/');
    await screen.findByRole('region', { name: 'Calendário' });
    expect(screen.queryByText(/Não deu para atualizar/)).toBeNull();
    expect(screen.queryByText(/Reconecte/)).toBeNull();
  });

  it('fonte pedindo reconexão: avisa e leva a Conexões', async () => {
    calendar = (from, to) => myCalendarFixture({ from, to, sources: [{ source: 'sigaa', status: 'reconnect_required' }, { source: 'siasb', status: 'reconnect_required' }] });
    renderApp('/');
    expect(await screen.findByText(/Reconecte SIGAA e SIASB para ver tudo no calendário/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir Conexões' })).toBeInTheDocument();
  });

  it('a API recusou o intervalo (400) ou caiu: erro em texto, com "Tentar de novo", e a tela segue', async () => {
    server.use(http.get(`${API}/me/calendar`, () => HttpResponse.json({ error: 'internal_error', message: 'Falhou.' }, { status: 500 })));
    renderApp('/');
    expect(await screen.findByText(/Não deu para carregar o calendário agora/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Calendário' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  const withoutSigaa = (): Me => ({
    ...meFixture(),
    connections: { ...meFixture().connections, sigaa: { status: 'disconnected', login: null, passkey: { slots: 0 } } },
  });

  it('sem o SIGAA (e sem SIASB) conectado: a faixa "Conecte o SIGAA" e o calendário só com feriados; Moodle e Classroom não contam', async () => {
    // O Moodle e o Classroom continuam conectados em meFixture: mesmo assim a faixa aparece (não são fontes do calendário).
    server.use(meHandler(withoutSigaa()));
    calendar = (from, to) => myCalendarFixture({ from, to, days: myCalendarFixture().days.filter((d) => d.nonTeaching), sources: [] });
    renderApp('/');
    expect(await screen.findByText('Conecte o SIGAA para ver suas aulas')).toBeInTheDocument();
    expect(screen.getByText('Por enquanto o calendário mostra só feriados e dias sem aula.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conectar o SIGAA' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^2 de novembro/ })).toHaveAccessibleName('2 de novembro: Sem aula, Finados');
  });

  it('só com o SIASB conectado (e acesso a ele) também não há a faixa', async () => {
    const me = withSiasb();
    server.use(meHandler({ ...me, connections: { ...me.connections, sigaa: { status: 'disconnected', login: null, passkey: { slots: 0 } } } }));
    renderApp('/');
    await screen.findByRole('region', { name: 'Calendário' });
    expect(screen.queryByText('Conecte o SIGAA para ver suas aulas')).toBeNull();
  });

  it('com o SIGAA conectado não há a faixa de conectar', async () => {
    renderApp('/');
    await screen.findByRole('region', { name: 'Calendário' });
    expect(screen.queryByText('Conecte o SIGAA para ver suas aulas')).toBeNull();
  });

  it('o Mural de avisos ainda não aparece (a API não tem a lista de avisos)', async () => {
    renderApp('/');
    await screen.findByRole('region', { name: 'Calendário' });
    expect(screen.queryByRole('complementary', { name: 'Mural de avisos' })).toBeNull();
  });

  it('não tem violações de acessibilidade (axe)', async () => {
    const { container } = renderApp('/');
    await screen.findByRole('region', { name: 'Calendário' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
