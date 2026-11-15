import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { AcademicDraft, AcademicFailure, AcademicState } from '../contract';
import { meFixture } from '../contract/fixtures';
import { notify } from '../lib/notify';
import { meHandler, renderApp } from '../test/render';
import { API, server } from '../test/server';

/** Dados fixos no formato da branch da API `feat/vida-academica-persistencia` (f7e3b1b). */
const hours = (required: number, completed: number) => ({ required, completed, pending: required - completed });

function draftFixture(overrides: Partial<AcademicDraft> = {}): AcademicDraft {
  return {
    contractVersion: '1',
    document: { issuedOn: '2026-11-10' },
    program: { name: 'Odontologia', curriculum: '2019.1', currentTerm: 6, completionDeadline: { standard: '10 semestres', maximum: '15 semestres' } },
    indices: { cr: 7.8, iap: 0.81 },
    components: [
      { term: '1º semestre', kind: 'OBRIGATORIA', code: 'ODO101', name: 'Anatomia Geral', hours: 68, grade: 8.5, status: 'Aprovado' },
      { term: '1º semestre', kind: 'OBRIGATORIA', code: 'ODO102', name: 'Histologia', hours: 68, grade: 7, status: 'Aprovado' },
      { term: '3º semestre', kind: 'OBRIGATORIA', code: 'ODO303', name: 'Farmacologia', hours: 68, grade: 3.5, status: 'Reprovado' },
      { term: '', kind: null, code: 'LET001', name: 'Aproveitamento de estudos: Língua Portuguesa', hours: 34, grade: null, status: 'Cumprido' },
    ],
    hours: { mandatory: hours(2800, 1700), elective: hours(300, 120), complementary: hours(200, 80), total: hours(3300, 1900) },
    pendingMandatory: { declaredTotal: 1100, items: [{ code: 'ODO901', name: 'Estágio Supervisionado I', hours: 200, enrolled: false }] },
    equivalences: [],
    notes: ['Histórico emitido em 10/11/2026.'],
    verification: { verified: true, warnings: [], reader: 'ai' },
    ...overrides,
  };
}

function stateFixture(overrides: Partial<AcademicState> = {}): AcademicState {
  return {
    available: true,
    consent: false,
    status: 'NONE',
    failure: null,
    verified: null,
    reader: null,
    importedAt: null,
    curriculumStatus: 'NONE',
    summary: null,
    draft: null,
    ...overrides,
  };
}

let state: AcademicState;
let calls: string[];

beforeEach(() => {
  state = stateFixture();
  calls = [];
  vi.mocked(notify.success).mockClear();
  vi.mocked(notify.info).mockClear();
  server.use(
    meHandler(),
    http.get(`${API}/me/academic`, () => HttpResponse.json(state)),
    http.put(`${API}/me/academic/consent`, async ({ request }) => {
      calls.push(`consent:${JSON.stringify(await request.json())}`);
      state = { ...state, consent: true };
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(`${API}/me/academic/import`, ({ request }) => {
      calls.push(`import:x-ufba=${request.headers.get('x-ufba')}`);
      state = { ...state, status: 'RUNNING' };
      return new HttpResponse(null, { status: 202 });
    }),
    http.post(`${API}/me/academic/confirm`, () => {
      calls.push('confirm');
      state = { ...state, status: 'READY', draft: null };
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(`${API}/me/academic`, () => {
      calls.push('delete');
      state = stateFixture({ consent: true });
      return new HttpResponse(null, { status: 204 });
    }),
  );
});

describe('/academic · convite e consentimento', () => {
  it('diz para onde vão os dados e o que não é enviado, antes de qualquer leitura', async () => {
    renderApp('/academic');
    expect(await screen.findByRole('heading', { name: 'Quer ver sua vida acadêmica aqui?' })).toBeInTheDocument();
    expect(screen.getByText(/as disciplinas e as notas/)).toBeInTheDocument();
    expect(screen.getByText(/provedor de IA \(Anthropic\)/)).toBeInTheDocument();
    for (const item of ['Nome', 'Matrícula', 'CPF', 'Nascimento', 'Nomes de professores']) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
    expect(screen.getByText('Você pode apagar tudo quando quiser.')).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('Importar aceita o consentimento e só depois pede a importação; a tela passa a acompanhar', async () => {
    renderApp('/academic');
    await userEvent.click(await screen.findByRole('button', { name: 'Importar' }));

    expect(await screen.findByRole('heading', { name: 'Importando' })).toBeInTheDocument();
    expect(calls).toEqual(['consent:{"accepted":true}', 'import:x-ufba=1']);
  });

  it('quem já aceitou não aceita de novo', async () => {
    state = stateFixture({ consent: true });
    renderApp('/academic');
    await userEvent.click(await screen.findByRole('button', { name: 'Importar' }));
    expect(await screen.findByRole('heading', { name: 'Importando' })).toBeInTheDocument();
    expect(calls).toEqual(['import:x-ufba=1']);
  });

  it('"Agora não" volta para o início e não chama a API', async () => {
    renderApp('/academic');
    await userEvent.click(await screen.findByRole('button', { name: 'Agora não' }));
    expect(await screen.findByRole('heading', { name: 'Painel' })).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('sem chave da IA (available=false): esconde a oferta', async () => {
    state = stateFixture({ available: false });
    renderApp('/academic');
    expect(await screen.findByRole('heading', { name: 'Importação indisponível' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Importar' })).toBeNull();
  });
});

describe('/academic · SIGAA fechado', () => {
  it('SIGAA trancado na sessão: manda abrir em Conexões antes de oferecer a importação', async () => {
    const base = meFixture();
    server.use(meHandler({ ...base, connections: { ...base.connections, sigaa: { status: 'locked', login: 'marina.costa', passkey: { slots: 1 } } } }));
    renderApp('/academic');
    expect(await screen.findByRole('heading', { name: 'Abra o SIGAA primeiro' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Importar' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Ir para Conexões' }));
    expect(await screen.findByRole('heading', { name: 'Conexões' })).toBeInTheDocument();
  });

  it('a API recusa com 409 source_not_connected: mostra o mesmo caminho', async () => {
    server.use(
      http.post(`${API}/me/academic/import`, () =>
        HttpResponse.json({ error: 'source_not_connected', message: 'Abra o SIGAA.' }, { status: 409 }),
      ),
    );
    renderApp('/academic');
    await userEvent.click(await screen.findByRole('button', { name: 'Importar' }));
    expect(await screen.findByRole('heading', { name: 'Abra o SIGAA primeiro' })).toBeInTheDocument();
  });
});

describe('/academic · erros ao pedir a importação', () => {
  it.each([
    [429, 'too_many_attempts', 'Você já tentou 3 vezes hoje. Tente amanhã.'],
    [503, 'import_unavailable', 'A importação está indisponível no momento. Tente mais tarde.'],
  ])('%s %s', async (status, code, text) => {
    server.use(http.post(`${API}/me/academic/import`, () => HttpResponse.json({ error: code, message: 'x' }, { status })));
    state = stateFixture({ consent: true });
    renderApp('/academic');
    await userEvent.click(await screen.findByRole('button', { name: 'Importar' }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar' })).toBeInTheDocument();
  });
});

describe('/academic · importando', () => {
  it('acompanha por polling até pedir a confirmação', { timeout: 15_000 }, async () => {
    state = stateFixture({ consent: true, status: 'RUNNING' });
    renderApp('/academic');
    expect(await screen.findByRole('heading', { name: 'Importando' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Importando o histórico' })).toBeInTheDocument();

    state = stateFixture({ consent: true, status: 'NEEDS_CONFIRMATION', draft: draftFixture(), reader: 'ai', verified: true });
    expect(await screen.findByRole('heading', { name: 'Confira o que lemos' }, { timeout: 8000 })).toBeInTheDocument();
  });
});

describe('/academic · falhas durante a importação', () => {
  it.each<[AcademicFailure, string]>([
    ['SIGAA_UNAVAILABLE', 'Não conseguimos pegar o histórico no SIGAA agora.'],
    ['PDF_INVALID', 'Isso não parece um histórico escolar.'],
    ['REDACTION_REFUSED', 'Por segurança, não enviamos nada: não conseguimos garantir que seus dados pessoais ficariam de fora.'],
    ['READER_FAILED', 'Não conseguimos ler o histórico agora.'],
  ])('%s mostra o texto e deixa tentar de novo', async (failure, text) => {
    state = stateFixture({ consent: true, status: 'FAILED', failure });
    renderApp('/academic');
    expect(await screen.findByText(text)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'Importando' })).toBeInTheDocument();
    expect(calls).toEqual(['import:x-ufba=1']);
  });
});

describe('/academic · confira o que lemos', () => {
  const confirmable = (draft: AcademicDraft) =>
    stateFixture({ consent: true, status: 'NEEDS_CONFIRMATION', draft, reader: 'ai', verified: draft.verification.verified });

  it('mostra curso, CR, IAP, horas, o histórico por semestre e as pendências; nada de identidade', async () => {
    state = confirmable(draftFixture());
    renderApp('/academic');
    expect(await screen.findByRole('heading', { name: 'Confira o que lemos' })).toBeInTheDocument();
    expect(screen.getByText('Odontologia')).toBeInTheDocument();
    expect(screen.getByText('Período atual: 6º')).toBeInTheDocument();
    expect(screen.getByText('7,8')).toBeInTheDocument();
    expect(screen.getByText('0,81')).toBeInTheDocument();
    expect(screen.getByText('Lido com apoio de IA')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '1º semestre' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Sem semestre' })).toBeInTheDocument();
    expect(screen.getByText('Anatomia Geral')).toBeInTheDocument();
    expect(screen.getByText('Reprovado')).toBeInTheDocument();
    expect(screen.getByText('Estágio Supervisionado I')).toBeInTheDocument();
    // Números fecharam: nada de faixa nem caixa obrigatória.
    expect(screen.queryByText('Os números não fecharam.')).toBeNull();
    expect(screen.queryByLabelText('Conferi e quero salvar assim')).toBeNull();
  });

  it('Confirmar grava, avisa por toast e a tela sai do rascunho', async () => {
    state = confirmable(draftFixture());
    renderApp('/academic');
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Histórico salvo.'));
    expect(calls).toEqual(['confirm']);
    expect(await screen.findByText(/Sua vida acadêmica foi importada/)).toBeInTheDocument();
  });

  it('números que não fecharam: mostra os avisos e só libera Confirmar depois do clique explícito', async () => {
    state = confirmable(
      draftFixture({
        verification: {
          verified: false,
          warnings: ['O CR calculado (7,6) não bate com o do documento (7,8).', 'A soma das horas por natureza é 1.900h, mas o documento diz 1.980h.'],
          reader: 'ai',
        },
      }),
    );
    renderApp('/academic');
    expect(await screen.findByText('Os números não fecharam.')).toBeInTheDocument();
    expect(screen.getByText('O CR calculado (7,6) não bate com o do documento (7,8).')).toBeInTheDocument();

    const confirm = screen.getByRole('button', { name: 'Confirmar' });
    expect(confirm).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Conferi e quero salvar assim'));
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => expect(calls).toEqual(['confirm']));
  });

  it('o rascunho venceu (404 import_not_found): avisa e volta a ler o estado', async () => {
    state = confirmable(draftFixture());
    server.use(
      http.post(`${API}/me/academic/confirm`, () => {
        state = stateFixture({ consent: true });
        return HttpResponse.json({ error: 'import_not_found', message: 'x' }, { status: 404 });
      }),
    );
    renderApp('/academic');
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('heading', { name: 'Quer ver sua vida acadêmica aqui?' })).toBeInTheDocument();
  });

  it('Tentar de novo refaz a leitura', async () => {
    state = confirmable(draftFixture());
    renderApp('/academic');
    await userEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'Importando' })).toBeInTheDocument();
    expect(calls).toEqual(['import:x-ufba=1']);
  });

  it('Cancelar descarta o que foi lido (DELETE) e volta ao convite', async () => {
    state = confirmable(draftFixture());
    renderApp('/academic');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(notify.info).toHaveBeenCalledWith('Descartei o que foi lido.'));
    expect(calls).toEqual(['delete']);
    expect(await screen.findByRole('heading', { name: 'Quer ver sua vida acadêmica aqui?' })).toBeInTheDocument();
  });

  it('não tem violações de acessibilidade', async () => {
    state = confirmable(draftFixture());
    const { container } = renderApp('/academic');
    const main = await screen.findByRole('heading', { name: 'Confira o que lemos' });
    expect(within(container).getByText('Seu histórico')).toBeInTheDocument();
    expect(main).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
