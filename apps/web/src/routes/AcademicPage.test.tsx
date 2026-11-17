import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { AcademicDraft, AcademicFailure, AcademicState, Curriculum, CurriculumItem } from '../contract';
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
    program: {
      name: 'ODONTOLOGIA/FO - SALVADOR - BACHARELADO - PRESENCIAL - M',
      programLabel: { raw: 'ODONTOLOGIA/FO - SALVADOR - BACHARELADO - PRESENCIAL - M', name: 'Odontologia', unit: 'FO', campus: 'Salvador', degree: 'Bacharelado', modality: 'Presencial', shift: 'Matutino', format: 'full' },
      curriculum: '2019.1',
      currentTerm: 6,
      completionDeadline: { standard: '10 semestres', maximum: '15 semestres' },
    },
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
    registration: null,
    summary: null,
    draft: null,
    ...overrides,
  };
}

function summaryFixture(): NonNullable<AcademicState['summary']> {
  return {
    programName: 'ODONTOLOGIA/FO - SALVADOR - BACHARELADO - PRESENCIAL - M',
    programLabel: { raw: 'ODONTOLOGIA/FO - SALVADOR - BACHARELADO - PRESENCIAL - M', name: 'Odontologia', unit: 'FO', campus: 'Salvador', degree: 'Bacharelado', modality: 'Presencial', shift: 'Matutino', format: 'full' },
    curriculum: '2019.1',
    currentTerm: 6,
    completionDeadline: { standard: '10 semestres', maximum: '15 semestres' },
    indices: { cr: 7.8, iap: 0.81 },
    hours: { mandatory: hours(2800, 1700), elective: hours(300, 120), complementary: hours(200, 80), total: hours(3300, 1900) },
  };
}

function readyFixture(overrides: Partial<AcademicState> = {}): AcademicState {
  return stateFixture({
    consent: true,
    status: 'READY',
    verified: true,
    reader: 'ai',
    importedAt: '2026-11-12T17:32:00.000Z',
    curriculumStatus: 'READY',
    summary: summaryFixture(),
    ...overrides,
  });
}

function item(overrides: Partial<CurriculumItem>): CurriculumItem {
  return {
    code: 'ODO101',
    name: 'Anatomia Geral',
    hours: 68,
    nature: 'REQUIRED',
    term: 1,
    state: 'DONE',
    via: [],
    missingPrerequisites: [],
    prerequisiteUnverifiable: false,
    prerequisiteExpr: null,
    corequisiteExpr: null,
    equivalenceExpr: null,
    responsibleUnit: null,
    late: false,
    lastAttempt: null,
    toRedo: false,
    ...overrides,
  };
}

function curriculumFixture(): Curriculum {
  const need = (needed: number, completed: number) => ({ needed, completed, remaining: needed - completed, source: 'estimate' as const });
  return {
    curriculumCode: '2019.1',
    sameCurriculum: true,
    estimate: true,
    required: [
      item({}),
      item({ code: 'ODO103', name: 'Biologia Celular', hours: 51, state: 'DONE_VIA_EQUIVALENCE', via: ['Biologia Geral'] }),
      item({ code: 'ODO501', name: 'Periodontia Clínica I', term: 5, state: 'ENROLLED' }),
      item({ code: 'ODO503', name: 'Cirurgia Oral I', term: 5, state: 'AVAILABLE', prerequisiteExpr: 'Anatomia Geral' }),
      item({
        code: 'ODO402',
        name: 'Dentística II',
        term: 4,
        state: 'BLOCKED',
        missingPrerequisites: ['Materiais Dentários'],
        prerequisiteExpr: 'Dentística I e Materiais Dentários',
        corequisiteExpr: 'Clínica Integrada I',
        equivalenceExpr: 'ODO41 (currículo anterior)',
        responsibleUnit: 'Departamento de Odontologia Restauradora',
      }),
    ],
    electives: [item({ code: 'OPT110', name: 'Odontologia do Esporte', hours: 34, nature: 'ELECTIVE', term: null, state: 'AVAILABLE' })],
    complementary: [item({ code: 'COMP1', name: 'Monitoria de Anatomia', hours: 60, nature: 'COMPLEMENTARY', term: null })],
    hours: { required: need(2800, 1700), elective: need(300, 120), complementary: need(200, 80), total: need(3300, 1900) },
    percentComplete: 58,
    requiredHoursToTake: 1100,
    currentTerm: 6,
    terms: { min: 10, avg: 11, max: 15 },
    prerequisiteEdges: [],
    divergences: { obsoletePending: [], substitutedPending: [], satisfiedByAdequation: [], newInCurriculum: [] },
  };
}

let state: AcademicState;
let curriculum: Curriculum;
let calls: string[];

beforeEach(() => {
  state = stateFixture();
  curriculum = curriculumFixture();
  calls = [];
  window.localStorage.clear();
  vi.mocked(notify.success).mockClear();
  vi.mocked(notify.info).mockClear();
  server.use(
    meHandler(),
    http.get(`${API}/me/academic`, () => HttpResponse.json(state)),
    http.get(`${API}/me/academic/curriculum`, () => HttpResponse.json(curriculum)),
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
      state = readyFixture();
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(`${API}/me/academic`, () => {
      calls.push('delete');
      state = stateFixture({ consent: true });
      return new HttpResponse(null, { status: 204 });
    }),
    // Descarta só o rascunho (ou a falha) de uma leitura: com histórico volta a READY, sem histórico volta a NONE.
    http.delete(`${API}/me/academic/draft`, () => {
      calls.push('discard');
      state = state.summary !== null ? readyFixture() : stateFixture({ consent: true });
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
    server.use(meHandler({ ...base, connections: { ...base.connections, sigaa: { status: 'locked', login: 'marina.costa', passkey: { slots: 1 }, health: null } } }));
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

  it('a caixa "Curso" do rascunho mostra o nome formatado e os pedaços (não o texto cru); formato cru fica como veio', async () => {
    state = confirmable(draftFixture());
    const first = renderApp('/academic');
    expect(await screen.findByText('Odontologia')).toBeInTheDocument();
    expect(screen.getByText('FO · Salvador · Bacharelado · Presencial · Matutino')).toBeInTheDocument();
    expect(screen.queryByText(/ODONTOLOGIA\/FO/)).toBeNull();
    first.unmount();

    const draft = draftFixture();
    state = confirmable({
      ...draft,
      program: {
        ...draft.program,
        name: 'CURSO ESTRANHO',
        programLabel: { raw: 'CURSO ESTRANHO', name: 'CURSO ESTRANHO', unit: null, campus: null, degree: null, modality: null, shift: null, format: 'raw' },
      },
    });
    renderApp('/academic');
    expect(await screen.findByText('CURSO ESTRANHO')).toBeInTheDocument();
    expect(screen.queryByText(/ · Salvador/)).toBeNull();
  });

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
    // Pronto: abre o resumo, com as abas.
    expect(await screen.findByRole('heading', { name: 'Odontologia' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trajetória' })).toBeInTheDocument();
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

  it('Cancelar descarta só o rascunho (DELETE /draft) e, sem histórico, volta ao convite', async () => {
    state = confirmable(draftFixture());
    renderApp('/academic');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(notify.info).toHaveBeenCalledWith('Descartei o que foi lido.'));
    expect(calls).toEqual(['discard']);
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

  it('já havia uma importação (atualizar): Cancelar descarta só a nova leitura, sem aviso, e volta ao histórico', async () => {
    state = readyFixture({ status: 'NEEDS_CONFIRMATION', draft: draftFixture() });
    renderApp('/academic');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    // Não há mais o diálogo de "isso apaga tudo": a API descarta só o rascunho.
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(notify.info).toHaveBeenCalledWith('Voltei ao seu histórico.'));
    expect(calls).toEqual(['discard']);
    // O histórico anterior continua lá: abre o resumo.
    expect(await screen.findByRole('heading', { name: 'Odontologia' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trajetória' })).toBeInTheDocument();
  });

  it('o rascunho já venceu (404 import_not_found) ao cancelar: só relê o estado, sem erro', async () => {
    state = confirmable(draftFixture());
    server.use(
      http.delete(`${API}/me/academic/draft`, () => {
        state = stateFixture({ consent: true });
        return HttpResponse.json({ error: 'import_not_found', message: 'x' }, { status: 404 });
      }),
    );
    renderApp('/academic');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByRole('heading', { name: 'Quer ver sua vida acadêmica aqui?' })).toBeInTheDocument();
    expect(notify.info).not.toHaveBeenCalled();
  });
});

describe('/academic · atualização que falhou (com histórico salvo)', () => {
  const failedUpdate = (overrides: Partial<AcademicState> = {}) =>
    readyFixture({ status: 'FAILED', failure: 'SIGAA_UNAVAILABLE', ...overrides });

  it('mostra a falha e que o histórico anterior continua salvo; "Voltar ao meu histórico" descarta e reabre o resumo', async () => {
    state = failedUpdate();
    renderApp('/academic');
    expect(await screen.findByText('Não conseguimos pegar o histórico no SIGAA agora.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Não deu para atualizar' })).toBeInTheDocument();
    expect(screen.getByText('O histórico que você já tinha continua salvo.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Voltar ao meu histórico' }));
    await waitFor(() => expect(notify.info).toHaveBeenCalledWith('Voltei ao seu histórico.'));
    expect(calls).toEqual(['discard']);
    expect(await screen.findByRole('heading', { name: 'Odontologia' })).toBeInTheDocument();
  });

  it('"Tentar de novo" refaz a leitura', async () => {
    state = failedUpdate();
    renderApp('/academic');
    await userEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'Importando' })).toBeInTheDocument();
    expect(calls).toEqual(['import:x-ufba=1']);
  });

  it('com o SIGAA fechado: oferece abrir o SIGAA e, mesmo assim, deixa voltar ao histórico', async () => {
    const base = meFixture();
    server.use(meHandler({ ...base, connections: { ...base.connections, sigaa: { status: 'locked', login: 'marina.costa', passkey: { slots: 1 }, health: null } } }));
    state = failedUpdate({ failure: 'SESSION_EXPIRED' });
    renderApp('/academic');
    expect(await screen.findByRole('button', { name: 'Abrir o SIGAA' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar ao meu histórico' }));
    expect(await screen.findByRole('heading', { name: 'Odontologia' })).toBeInTheDocument();
  });

  it('falha SEM histórico anterior continua sendo o convite com "Tentar de novo"', async () => {
    state = stateFixture({ consent: true, status: 'FAILED', failure: 'READER_FAILED' });
    renderApp('/academic');
    expect(await screen.findByText('Não conseguimos ler o histórico agora.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voltar ao meu histórico' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});

describe('/academic · resumo', () => {
  it('o curso aparece formatado: nome como título e unidade, campus, grau, modalidade e turno como detalhe (não o texto cru)', async () => {
    state = readyFixture();
    renderApp('/academic');
    expect(await screen.findByRole('heading', { name: 'Odontologia' })).toBeInTheDocument();
    expect(screen.getByText('FO · Salvador · Bacharelado · Presencial · Matutino')).toBeInTheDocument();
    expect(screen.queryByText(/ODONTOLOGIA\/FO/)).toBeNull();
  });

  it('curso em formato cru: mostra o texto original como título e nenhum detalhe', async () => {
    const summary = summaryFixture();
    state = readyFixture({
      summary: { ...summary, programName: 'CURSO ESTRANHO', programLabel: { raw: 'CURSO ESTRANHO', name: 'CURSO ESTRANHO', unit: null, campus: null, degree: null, modality: null, shift: null, format: 'raw' } },
    });
    const { container } = renderApp('/academic');
    expect(await screen.findByRole('heading', { name: 'CURSO ESTRANHO' })).toBeInTheDocument();
    expect(container.querySelector('.web-va-course__detail')).toBeNull();
  });

  it('mostra curso, prazos, porcentagem, CR, IAP, horas, o que falta e o que posso cursar agora', async () => {
    state = readyFixture();
    renderApp('/academic');
    expect(await screen.findByRole('heading', { name: 'Odontologia' })).toBeInTheDocument();
    expect(screen.getByText('Período atual:', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('10 semestres')).toBeInTheDocument();
    expect(screen.getByText('15 semestres')).toBeInTheDocument();
    expect(await screen.findByText('58%')).toBeInTheDocument();
    expect(screen.getByText('7,8')).toBeInTheDocument();
    expect(screen.getByText('0,81')).toBeInTheDocument();
    expect(screen.getByText('1.900h')).toBeInTheDocument();
    expect(screen.getByText('1.400h')).toBeInTheDocument();

    // O que falta: só as obrigatórias que faltam (a cursar ou bloqueadas), por semestre.
    const missing = await screen.findByRole('heading', { name: 'O que falta' });
    const card = missing.closest('section')!;
    expect(within(card).getByRole('group', { name: '4º semestre' })).toBeInTheDocument();
    expect(within(card).getByText('Dentística II')).toBeInTheDocument();
    expect(within(card).queryByText('Anatomia Geral')).toBeNull();
    expect(within(card).getByText('180h de optativas')).toBeInTheDocument();
    expect(within(card).getByText('120h de complementares')).toBeInTheDocument();

    const now = screen.getByRole('heading', { name: 'O que posso cursar agora' }).closest('section')!;
    expect(within(now).getByText('Cirurgia Oral I')).toBeInTheDocument();
    expect(within(now).getByText(/pré-requisitos: Anatomia Geral/)).toBeInTheDocument();
    expect(within(now).getByText(/optativa/)).toBeInTheDocument();
    expect(screen.getAllByText('Estimativa').length).toBeGreaterThan(0);
    expect(screen.getByText(/pode divergir do SIGAA/)).toBeInTheDocument();
  });

  it('Esconder notas tira CR e IAP do HTML e lembra a escolha; Mostrar notas volta', async () => {
    state = readyFixture();
    renderApp('/academic');
    await userEvent.click(await screen.findByRole('button', { name: 'Esconder notas' }));
    expect(screen.queryByText('7,8')).toBeNull();
    expect(screen.queryByText('0,81')).toBeNull();
    expect(window.localStorage.getItem('ufba:academic:hide-grades')).toBe('1');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar notas' }));
    expect(screen.getByText('7,8')).toBeInTheDocument();
    expect(window.localStorage.getItem('ufba:academic:hide-grades')).toBeNull();
  });

  it('sem a grade do curso: avisa, mantém o histórico e a porcentagem sai das horas', async () => {
    state = readyFixture({ curriculumStatus: 'UNAVAILABLE' });
    renderApp('/academic');
    expect(await screen.findByText('Grade ainda indisponível.')).toBeInTheDocument();
    expect(screen.getByText('O que falta depende da grade do curso.')).toBeInTheDocument();
    expect(screen.getByText('Disponível quando a grade do curso estiver pronta.')).toBeInTheDocument();
    expect(screen.getByText('58%')).toBeInTheDocument(); // 1.900 de 3.300 horas
    expect(screen.getByText('180h de optativas')).toBeInTheDocument();
  });

  it('as abas levam à grade e às configurações', async () => {
    state = readyFixture();
    renderApp('/academic');
    await userEvent.click(await screen.findByRole('link', { name: 'Trajetória' }));
    // A Trajetória abre no Mapa; a Lista (a grade em cartões) é a outra visão.
    expect(await screen.findByRole('region', { name: 'Mapa de disciplinas por semestre' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Lista' }));
    expect(await screen.findByText('Cumprido via Biologia Geral')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Configurações' }));
    expect(await screen.findByRole('heading', { name: 'Sua importação' })).toBeInTheDocument();
  });

  it('antes de importar, um subcaminho volta para o convite', async () => {
    renderApp('/academic/settings');
    expect(await screen.findByRole('heading', { name: 'Quer ver sua vida acadêmica aqui?' })).toBeInTheDocument();
  });

  it('não tem violações de acessibilidade', async () => {
    state = readyFixture();
    const { container } = renderApp('/academic');
    await screen.findByText('58%');
    await screen.findByRole('heading', { name: 'O que posso cursar agora' });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('/academic/curriculum · trajetória (visão Lista)', () => {
  beforeEach(() => {
    state = readyFixture();
  });

  it('marca cada componente com o estado e o que falta', async () => {
    renderApp('/academic/curriculum?view=list');
    expect(await screen.findByRole('heading', { name: 'Optativas' })).toBeInTheDocument();
    expect(screen.getByText('Cumprido via Biologia Geral')).toBeInTheDocument();
    expect(screen.getByText('Falta: Materiais Dentários')).toBeInTheDocument();
    expect(screen.getByText('Matriculado', { selector: '.web-va-comp .web-va-st' })).toBeInTheDocument();
    expect(screen.getByText('Faltam 180h de 300h')).toBeInTheDocument();
    expect(screen.getByText('Faltam 120h de 200h')).toBeInTheDocument();
    expect(screen.getByText('Monitoria de Anatomia')).toBeInTheDocument();
    expect(screen.getByText('5º semestre')).toBeInTheDocument();
  });

  it('abrir um componente mostra pré-requisitos, o que falta e as equivalências', async () => {
    renderApp('/academic/curriculum?view=list');
    await userEvent.click(await screen.findByRole('button', { name: /ODO402/ }));
    const dialog = await screen.findByRole('dialog', { name: /Dentística II/ });
    expect(within(dialog).getByText('Falta, bloqueado')).toBeInTheDocument();
    expect(within(dialog).getByText('Dentística I e Materiais Dentários')).toBeInTheDocument();
    expect(within(dialog).getByText('Falta cumprir: Materiais Dentários.')).toBeInTheDocument();
    expect(within(dialog).getByText('ODO41 (currículo anterior)')).toBeInTheDocument();
    // Co-requisitos e unidade responsável (a API passou a entregar).
    expect(within(dialog).getByRole('heading', { name: 'Co-requisitos' })).toBeInTheDocument();
    expect(within(dialog).getByText('Clínica Integrada I')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Unidade responsável' })).toBeInTheDocument();
    expect(within(dialog).getByText('Departamento de Odontologia Restauradora')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('grade sendo montada (IMPORTING): diz que leva até um minuto e deixa voltar ao resumo', async () => {
    state = readyFixture({ curriculumStatus: 'IMPORTING' });
    renderApp('/academic/curriculum');
    expect(await screen.findByText('Quase lá.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Montando a grade…' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao resumo' })).toBeInTheDocument();
  });

  it('grade indisponível: explica e deixa tentar de novo; o histórico continua', async () => {
    state = readyFixture({ curriculumStatus: 'UNAVAILABLE' });
    renderApp('/academic/curriculum?view=list');
    expect(await screen.findByRole('heading', { name: 'A grade não está disponível' })).toBeInTheDocument();
    state = readyFixture({ curriculumStatus: 'READY' });
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'Optativas' })).toBeInTheDocument();
  });

  it('409 curriculum_unavailable na rota da grade também cai no estado indisponível', async () => {
    server.use(
      http.get(`${API}/me/academic/curriculum`, () =>
        HttpResponse.json({ error: 'curriculum_unavailable', message: 'x' }, { status: 409 }),
      ),
    );
    renderApp('/academic/curriculum');
    expect(await screen.findByRole('heading', { name: 'A grade não está disponível' })).toBeInTheDocument();
  });

  it('não tem violações de acessibilidade', async () => {
    const { container } = renderApp('/academic/curriculum?view=list');
    await screen.findByRole('heading', { name: 'Optativas' });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('/academic/settings · configurações', () => {
  beforeEach(() => {
    state = readyFixture();
  });

  it('mostra quando foi importado, como foi lido e se os números foram conferidos', async () => {
    renderApp('/academic/settings');
    expect(await screen.findByRole('heading', { name: 'Sua importação' })).toBeInTheDocument();
    expect(screen.getByText(/12\/11\/2026/)).toBeInTheDocument();
    expect(screen.getByText('Lido com apoio de IA')).toBeInTheDocument();
    expect(screen.getByText('Verificado')).toBeInTheDocument();
  });

  it('Atualizar histórico pede a importação e a tela passa a acompanhar', async () => {
    renderApp('/academic/settings');
    await userEvent.click(await screen.findByRole('button', { name: 'Atualizar histórico' }));
    expect(await screen.findByRole('heading', { name: 'Importando' })).toBeInTheDocument();
    expect(calls).toEqual(['import:x-ufba=1']);
  });

  it('limite de 3 por dia ao atualizar', async () => {
    server.use(http.post(`${API}/me/academic/import`, () => HttpResponse.json({ error: 'too_many_attempts', message: 'x' }, { status: 429 })));
    renderApp('/academic/settings');
    await userEvent.click(await screen.findByRole('button', { name: 'Atualizar histórico' }));
    expect(await screen.findByText('Você já tentou 3 vezes hoje. Tente amanhã.')).toBeInTheDocument();
  });

  it('revogar o consentimento pede confirmação e manda accepted:false; o que já foi importado fica', async () => {
    renderApp('/academic/settings');
    await userEvent.click(await screen.findByRole('button', { name: 'Revogar consentimento' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revogar o consentimento?' });
    expect(within(dialog).getByText(/continua salvo até você apagar/)).toBeInTheDocument();
    server.use(
      http.put(`${API}/me/academic/consent`, async ({ request }) => {
        calls.push(`consent:${JSON.stringify(await request.json())}`);
        state = { ...state, consent: false };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revogar consentimento' }));
    await waitFor(() => expect(notify.info).toHaveBeenCalledWith('Consentimento revogado.'));
    expect(calls).toEqual(['consent:{"accepted":false}']);
    expect(await screen.findByRole('button', { name: 'Autorizar de novo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar histórico' })).toBeDisabled();
  });

  it('apagar pede confirmação e só então chama DELETE; depois volta ao convite', async () => {
    renderApp('/academic/settings');
    await userEvent.click(await screen.findByRole('button', { name: 'Apagar minha vida acadêmica' }));
    const dialog = await screen.findByRole('dialog', { name: 'Apagar a vida acadêmica?' });
    expect(calls).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apagar tudo' }));
    await waitFor(() => expect(notify.info).toHaveBeenCalledWith('Apaguei a sua vida acadêmica.'));
    expect(calls).toEqual(['delete']);
    expect(await screen.findByRole('heading', { name: 'Quer ver sua vida acadêmica aqui?' })).toBeInTheDocument();
  });

  it('cancelar o diálogo de apagar não chama a API', async () => {
    renderApp('/academic/settings');
    await userEvent.click(await screen.findByRole('button', { name: 'Apagar minha vida acadêmica' }));
    const dialog = await screen.findByRole('dialog', { name: 'Apagar a vida acadêmica?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls).toEqual([]);
  });

  it('não tem violações de acessibilidade', async () => {
    const { container } = renderApp('/academic/settings');
    await screen.findByRole('heading', { name: 'Sua importação' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
