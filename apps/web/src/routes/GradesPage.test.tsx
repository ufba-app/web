import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { Attendance, Me } from '../contract';
import { attendanceFixture } from '../contract/attendanceFixture';
import { meFixture } from '../contract/fixtures';
import { meHandler, renderApp } from '../test/render';
import { API, server } from '../test/server';

/** Notas e faltas: hoje só a frequência do SIGAA (api#77), com a API simulada pelos dados fixos. */
let calls: number;
let respond: () => Response | Promise<Response>;

const withSigaa = (status: 'connected' | 'disconnected'): Me => {
  const base = meFixture();
  return { ...base, connections: { ...base.connections, sigaa: { ...base.connections.sigaa, status } } };
};

const serve = (me: Me = withSigaa('connected')) =>
  server.use(
    meHandler(me),
    http.get(`${API}/sources/sigaa/attendance`, () => {
      calls += 1;
      return respond();
    }),
  );

const json = (data: Attendance) => () => HttpResponse.json(data);

beforeEach(() => {
  calls = 0;
  respond = json(attendanceFixture());
});

describe('/grades · Notas e faltas', () => {
  it('mostra o resumo e cada disciplina com faltas contra o limite e a situação em texto, as mais arriscadas primeiro', async () => {
    serve();
    renderApp('/grades');
    expect(await screen.findByRole('heading', { name: 'Notas e faltas' })).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Por disciplina' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('b')?.textContent)).toEqual(['Embriologia', 'Anatomia', 'Bioquímica', 'Histologia', 'Saúde Coletiva']);

    const embriologia = rows[0]!;
    expect(within(embriologia).getByText('12 de 17 aulas')).toBeInTheDocument();
    expect(within(embriologia).getByText('No limite')).toBeInTheDocument();
    expect(within(embriologia).getByText('Restam 5 aulas de falta.')).toBeInTheDocument();
    expect(within(list).getAllByText('Em dia')).toHaveLength(4);

    // Resumo: faltas no semestre e disciplinas em risco, em aulas (nunca em horas).
    expect(screen.getByText('Faltas no semestre')).toBeInTheDocument();
    expect(screen.getByText('De 85 aulas permitidas no total')).toBeInTheDocument();
    expect(screen.getByText('Embriologia · restam 5 aulas')).toBeInTheDocument();
    // Sem rota de notas: a seção fica como "em breve".
    expect(screen.getByText('Notas: em breve.')).toBeInTheDocument();
  });

  it('acima do limite: selo "Acima do limite" e o quanto passou (o negativo da API vira texto, não "-3")', async () => {
    const base = attendanceFixture();
    const failed = { ...base.courses[0]!, absentClasses: 20, remainingAbsentClasses: -3, status: 'failed' as const };
    respond = json({ ...base, courses: [failed, ...base.courses.slice(1)] });
    serve();
    renderApp('/grades');
    expect(await screen.findByText('Acima do limite')).toBeInTheDocument();
    expect(screen.getByText('Passou 3 aulas do limite de faltas.')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Por disciplina' })).queryByText(/-3/)).toBeNull();
  });

  it('frequência ainda não lançada por inteiro (complete: false): marca como estimativa e explica', async () => {
    const base = attendanceFixture();
    respond = json({ ...base, courses: base.courses.map((course, index) => (index === 0 ? { ...course, complete: false } : course)) });
    serve();
    renderApp('/grades');
    expect((await screen.findAllByText('Estimativa')).length).toBeGreaterThan(0);
    expect(screen.getByText(/ainda não foi lançada por inteiro/)).toBeInTheDocument();
  });

  it('enquanto lê (são até 24 requisições ao SIGAA): skeleton com a forma da tela, sem spinner, e diz o que faz', async () => {
    respond = () => new Promise<Response>(() => {});
    serve();
    const { container } = renderApp('/grades');
    await waitFor(() => expect(container.querySelector('.gr-sk')).not.toBeNull());
    expect(container.querySelector('.gr-sk')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Lendo a frequência no SIGAA. Pode levar alguns segundos.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Por disciplina' })).toBeNull();
  });

  it('o SIGAA não respondeu (502): aviso da fonte com "Tentar de novo", e pedir de novo é um clique da pessoa', async () => {
    respond = () => HttpResponse.json({ error: 'source_unavailable', message: 'O SIGAA não respondeu.' }, { status: 502 });
    serve();
    renderApp('/grades');
    expect(await screen.findByText('O SIGAA não entregou a frequência agora.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Por disciplina' })).toBeNull();
    expect(calls).toBe(1);
    respond = json(attendanceFixture());
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('list', { name: 'Por disciplina' })).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('sem SIGAA conectado: convida a conectar e NEM chama a API (a leitura custa até 24 requisições)', async () => {
    serve(withSigaa('disconnected'));
    renderApp('/grades');
    expect(await screen.findByText('Conecte o SIGAA para ver suas faltas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conectar o SIGAA' })).toBeInTheDocument();
    expect(calls).toBe(0);
  });

  it('a API diz que a fonte não está conectada (409): mesmo convite, sem erro solto', async () => {
    respond = () => HttpResponse.json({ error: 'source_not_connected', message: 'Conecte o SIGAA.' }, { status: 409 });
    serve();
    renderApp('/grades');
    expect(await screen.findByText('Conecte o SIGAA para ver suas faltas')).toBeInTheDocument();
    expect(screen.queryByText('O SIGAA não entregou a frequência agora.')).toBeNull();
  });

  it('sem turmas no semestre: mensagem em vez de uma lista vazia', async () => {
    respond = json({ courses: [], summary: { absentClasses: 0, allowedAbsentClasses: 0, atRiskCourses: 0 } });
    serve();
    renderApp('/grades');
    expect(await screen.findByText('Nenhuma disciplina com frequência')).toBeInTheDocument();
  });

  it('lê uma vez ao abrir: sem polling nem nova leitura sozinha ao voltar para a janela', async () => {
    serve();
    renderApp('/grades');
    await screen.findByRole('list', { name: 'Por disciplina' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(calls).toBe(1);
  });

  it('não tem violações de acessibilidade (axe)', async () => {
    serve();
    const { container } = renderApp('/grades');
    await screen.findByRole('list', { name: 'Por disciplina' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
