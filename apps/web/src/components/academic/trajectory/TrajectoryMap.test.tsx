import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { trajectoryCurriculumFixture } from '../../../contract/trajectoryFixture';
import { TrajectoryMap } from './TrajectoryMap';

/** O mapa com os DADOS FIXOS do contrato novo (src/contract/trajectoryFixture.ts). O layout não é calculado no jsdom. */
const card = (code: string) => screen.getByRole('button', { name: new RegExp(`^${code},`) });
const lines = (container: HTMLElement, kind: 'soft' | 'strong') => container.querySelectorAll(`.tj-ln--${kind}`);

describe('TrajectoryMap', () => {
  it('mostra a legenda, o bloco dos semestres concluídos e uma coluna por semestre, com "agora" no atual', () => {
    render(<TrajectoryMap curriculum={trajectoryCurriculumFixture()} />);
    const legend = screen.getByRole('list', { name: 'Legenda do mapa' });
    for (const text of ['Concluída', 'Cursando', 'Pode cursar', 'A refazer', 'Bloqueada por pré-requisito']) {
      expect(within(legend).getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByText('1º–3º sem')).toBeInTheDocument();
    expect(screen.getByText('20 componentes concluídos')).toBeInTheDocument();
    expect(screen.getByText('1.110h')).toBeInTheDocument();
    expect(screen.getByText('4º sem')).toBeInTheDocument();
    expect(screen.getByText(/agora/).closest('.tj-col')).toHaveTextContent('5º sem · agora');
    // O bloco não vira 20 cartões: só os componentes dos semestres que ainda têm algo a fazer.
    expect(screen.queryByRole('button', { name: /^MATA02,/ })).toBeNull();
  });

  it('cada cartão diz o estado em texto (a cor nunca fala sozinha) e mostra o canto certo', () => {
    render(<TrajectoryMap curriculum={trajectoryCurriculumFixture()} />);
    expect(card('ENGC50')).toHaveAccessibleName('ENGC50, Estruturas de Dados, concluída');
    expect(card('ENGC50')).toHaveTextContent(/\d,\d|\d/); // a nota
    expect(card('ENGG56')).toHaveAccessibleName('ENGG56, Redes de Computadores I, cursando');
    expect(card('ENGG56')).toHaveTextContent('AGORA');
    expect(card('MAT174')).toHaveAccessibleName('MAT174, Cálculo Numérico, pode cursar');
    expect(card('MAT174')).toHaveTextContent('LIVRE');
    expect(card('MATA58')).toHaveAccessibleName('MATA58, Sistemas Operacionais, bloqueada por pré-requisito');
    expect(card('MATA58').querySelector('svg')).not.toBeNull(); // o cadeado
  });

  it('reprovada ou trancada aparece "a refazer", nunca como livre', () => {
    render(<TrajectoryMap curriculum={trajectoryCurriculumFixture()} />);
    expect(card('ENGC24')).toHaveAccessibleName('ENGC24, Probabilidade e Processos, a refazer');
    expect(card('ENGC24')).toHaveClass('tj-no--redo');
    expect(card('ENGC24')).toHaveTextContent('REFAZER');
  });

  it('sem escolher nada: só as ligações do semestre atual, em tom mais claro, e nenhum cartão apagado', () => {
    const { container } = render(<TrajectoryMap curriculum={trajectoryCurriculumFixture()} />);
    expect(lines(container, 'soft').length).toBeGreaterThan(0);
    expect(lines(container, 'strong').length).toBe(0);
    expect(container.querySelector('.tj-lona--sel')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Caminho de uma disciplina' })).toBeInTheDocument();
    expect(screen.getByText(/só as ligações do semestre atual/)).toBeInTheDocument();
  });

  it('escolher uma disciplina mostra o caminho completo (linhas fortes), realça o caminho e apaga o resto', async () => {
    const { container } = render(<TrajectoryMap curriculum={trajectoryCurriculumFixture()} />);
    await userEvent.click(card('MATA58')); // Sistemas Operacionais: exige MATA49 e MATA40, libera MATA59
    expect(card('MATA58')).toHaveAttribute('aria-pressed', 'true');
    expect(card('MATA58')).toHaveClass('tj-no--sel');
    expect(lines(container, 'soft').length).toBe(0);
    expect(lines(container, 'strong').length).toBeGreaterThan(0);
    expect(container.querySelector('.tj-lona--sel')).not.toBeNull();
    // No caminho: o que ela exige (inclusive o pré-requisito do pré-requisito) e o que ela libera.
    for (const code of ['MATA49', 'MATA40', 'ENGC50', 'MATA59']) expect(card(code)).toHaveClass('tj-no--rel');
    // Fora do caminho (o CSS apaga a 42%): sem a classe de caminho.
    expect(card('ENGC32')).not.toHaveClass('tj-no--rel');
    expect(card('MAT174')).not.toHaveClass('tj-no--rel');
  });

  it('o painel mostra código, carga, nome, chips, o que exige (com a situação de cada um) e o que libera', async () => {
    render(<TrajectoryMap curriculum={trajectoryCurriculumFixture()} />);
    await userEvent.click(card('MATA58'));
    const panel = screen.getByRole('heading', { name: 'Sistemas Operacionais' }).closest('section')!;
    expect(within(panel).getByText('MATA58 · 60h')).toBeInTheDocument();
    expect(within(panel).getByText('Bloqueada por pré-requisito')).toBeInTheDocument();
    expect(within(panel).getByText('Obrigatória')).toBeInTheDocument();
    expect(within(panel).getByText('6º semestre')).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Exige' })).toBeInTheDocument();
    expect(within(panel).getByText(/MATA49 · Banco de Dados/)).toBeInTheDocument();
    expect(within(panel).getByText('Cursando agora')).toBeInTheDocument(); // situação do pré-requisito MATA49
    expect(within(panel).getByText(/Aprovado em/)).toBeInTheDocument(); // situação de MATA40
    expect(within(panel).getByRole('heading', { name: 'Libera' })).toBeInTheDocument();
    expect(within(panel).getByText(/MATA59 · Sistemas Distribuídos/)).toBeInTheDocument();
    expect(within(panel).getByText(/Caminho completo:/)).toBeInTheDocument();
  });

  it('a disciplina a refazer mostra a última tentativa em palavras (a sigla do SIGAA vira texto)', async () => {
    render(<TrajectoryMap curriculum={trajectoryCurriculumFixture()} />);
    await userEvent.click(card('ENGC24'));
    const panel = screen.getByRole('heading', { name: 'Probabilidade e Processos' }).closest('section')!;
    expect(within(panel).getByText('A refazer', { selector: '.tj-st' })).toBeInTheDocument();
    expect(within(panel).getByText(/Última tentativa: trancado em 2025\.1/)).toBeInTheDocument();
  });

  it('escolher a mesma disciplina de novo volta ao estado inicial', async () => {
    const { container } = render(<TrajectoryMap curriculum={trajectoryCurriculumFixture()} />);
    await userEvent.click(card('MATA58'));
    await userEvent.click(card('MATA58'));
    expect(card('MATA58')).toHaveAttribute('aria-pressed', 'false');
    expect(lines(container, 'strong').length).toBe(0);
    expect(lines(container, 'soft').length).toBeGreaterThan(0);
    expect(container.querySelector('.tj-lona--sel')).toBeNull();
  });

  it('"Voltar ao início" limpa a escolha', async () => {
    render(<TrajectoryMap curriculum={trajectoryCurriculumFixture()} />);
    await userEvent.click(card('MATA58'));
    await userEvent.click(screen.getByRole('button', { name: 'Voltar ao início' }));
    expect(screen.getByRole('heading', { name: 'Caminho de uma disciplina' })).toBeInTheDocument();
  });

  it('um pré-requisito do painel leva à disciplina dele; os que estão dentro do bloco não são botões', async () => {
    render(<TrajectoryMap curriculum={trajectoryCurriculumFixture()} />);
    await userEvent.click(card('ENGG56')); // exige ENGC40 e ENGC50
    const panel = screen.getByRole('heading', { name: 'Redes de Computadores I' }).closest('section')!;
    // ENGC40 (3º semestre) está no bloco: aparece, mas não é botão.
    expect(within(panel).getByText(/ENGC40 · Linguagem de Programação/)).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: /ENGC40/ })).toBeNull();
    // ENGC50 (4º semestre) está no mapa: vira botão e leva até ele.
    await userEvent.click(within(panel).getByRole('button', { name: /ENGC50 · Estruturas de Dados/ }));
    expect(card('ENGC50')).toHaveAttribute('aria-pressed', 'true');
  });

  it('ligação alternativa fica marcada "um destes" no painel e tracejada no mapa', async () => {
    const { container } = render(<TrajectoryMap curriculum={trajectoryCurriculumFixture()} />);
    await userEvent.click(card('MATA52')); // exige MATA40 (obrigatória) ou MATA97 (alternativa)
    const panel = screen.getByRole('heading', { name: 'Compiladores' }).closest('section')!;
    expect(within(panel).getByText(/um destes/)).toBeInTheDocument();
    expect(container.querySelector('.tj-ln--alt')).not.toBeNull();
  });

  it('sem ligações (o SIGAA não trouxe pré-requisitos legíveis): cartões por estado, sem linhas, e a tela explica', async () => {
    const { container } = render(<TrajectoryMap curriculum={trajectoryCurriculumFixture({ prerequisiteEdges: [] })} />);
    expect(container.querySelectorAll('.tj-ln').length).toBe(0);
    expect(screen.getByText(/ligações entre as disciplinas não estão disponíveis/)).toBeInTheDocument();
    await userEvent.click(card('MATA58'));
    expect(screen.getByText(/ligações desta disciplina não estão disponíveis/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Exige' })).toBeNull();
    expect(container.querySelectorAll('.tj-ln').length).toBe(0);
  });

  it('currículo sem obrigatórias com semestre: mensagem em vez de um mapa vazio', () => {
    render(<TrajectoryMap curriculum={trajectoryCurriculumFixture({ required: [] })} />);
    expect(screen.getByText(/ainda não tem disciplinas com semestre/)).toBeInTheDocument();
  });

  it('a região rolável tem nome e recebe foco pelo teclado; o cartão se escolhe com Enter', async () => {
    render(<TrajectoryMap curriculum={trajectoryCurriculumFixture()} />);
    const region = screen.getByRole('region', { name: 'Mapa de disciplinas por semestre' });
    expect(region).toHaveAttribute('tabindex', '0');
    card('MATA58').focus();
    await userEvent.keyboard('{Enter}');
    expect(card('MATA58')).toHaveAttribute('aria-pressed', 'true');
  });

  it('não tem violações de acessibilidade (axe), sem escolha e com uma disciplina escolhida', async () => {
    const { container } = render(<TrajectoryMap curriculum={trajectoryCurriculumFixture()} />);
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(card('MATA58'));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('TrajectoryMap · o bloco condensado (do semestre retrasado para trás)', () => {
  it('só os semestres atual − 2 e anteriores viram bloco; vê-se o anterior, o atual e os futuros', () => {
    const { container } = render(<TrajectoryMap curriculum={trajectoryCurriculumFixture()} />); // atual = 5
    expect(screen.getByText('1º–3º sem')).toBeInTheDocument();
    // Colunas visíveis: 4º (anterior), 5º (atual, "agora") e os futuros.
    const columns = [...container.querySelectorAll('.tj-col')].map((el) => el.textContent);
    expect(columns).toEqual(['1º–3º sem', '4º sem', '5º sem · agora', '6º sem', '7º sem']);
  });

  it('o que NÃO foi cumprido dentro do bloco não some: "N a fazer" em texto e quadradinho só de contorno', () => {
    const curriculum = trajectoryCurriculumFixture();
    // Uma disciplina do 2º semestre ficou para refazer (reprovada): cai no bloco, mas continua à vista.
    const redo = curriculum.required.find((item) => item.code === 'MATA97')!;
    redo.state = 'AVAILABLE';
    redo.toRedo = true;
    const { container } = render(<TrajectoryMap curriculum={curriculum} />);
    const block = screen.getByRole('group', { name: /Semestres condensados/ });
    expect(block).toHaveAccessibleName('Semestres condensados: 20 componentes, 1 ainda a fazer');
    expect(within(block).getByText('20 componentes')).toBeInTheDocument(); // não diz "concluídos": um não está
    expect(within(block).getByText('1 a fazer')).toBeInTheDocument();
    expect(container.querySelectorAll('.tj-quad i')).toHaveLength(20);
    expect(container.querySelectorAll('.tj-quad i.tj-quad--pend')).toHaveLength(1);
  });

  it('tudo cumprido no bloco: o texto segue "componentes concluídos" e nenhum "a fazer"', () => {
    render(<TrajectoryMap curriculum={trajectoryCurriculumFixture()} />);
    const block = screen.getByRole('group', { name: /Semestres condensados/ });
    expect(block).toHaveAccessibleName('Semestres condensados: 20 componentes, todos concluídos');
    expect(within(block).getByText('20 componentes concluídos')).toBeInTheDocument();
    expect(within(block).queryByText(/a fazer/)).toBeNull();
  });

  it('com o atual no 2º semestre não há bloco: o mapa começa no 1º', () => {
    const curriculum = trajectoryCurriculumFixture({ currentTerm: 2 });
    render(<TrajectoryMap curriculum={curriculum} />);
    expect(screen.queryByRole('group', { name: /Semestres condensados/ })).toBeNull();
    expect(screen.getByText('1º sem')).toBeInTheDocument();
  });
});
