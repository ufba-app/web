import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { Mural, type MuralItem } from './Mural';

/** O mural com DADOS FIXOS do desenho (a API ainda não entrega a lista de avisos). */
const items: MuralItem[] = [
  { id: '1', source: 'moodle', courseName: 'Histologia', title: 'Prova 2 adiada para terça, dia 17', snippet: 'A prova de quinta passou para a terça.', when: 'há 2 h', isNew: true, dateChanged: true },
  { id: '2', source: 'sigaa', courseName: 'Anatomia', title: 'Aula de segunda será no Laboratório 3', snippet: null, when: 'ontem', isNew: true, dateChanged: false },
  { id: '3', source: 'classroom', courseName: 'Bioquímica', title: 'Nova tarefa: relatório de prática', snippet: 'Entrega na terça, dia 17.', when: 'ontem', isNew: false, dateChanged: false },
];

describe('Mural', () => {
  it('lista os avisos com disciplina, quando saiu, "Data mudou" e quantos são novos', () => {
    render(<Mural items={items} sources={['sigaa', 'moodle', 'classroom']} updatedAt="atualizado há 4 min" />);
    expect(screen.getByText('2 novos')).toBeInTheDocument();
    expect(screen.getByText(/Histologia · há 2 h/)).toBeInTheDocument();
    expect(screen.getByText('Data mudou')).toBeInTheDocument();
    expect(screen.getByText('A prova de quinta passou para a terça.')).toBeInTheDocument();
    expect(screen.getByText('3 fontes conectadas · atualizado há 4 min')).toBeInTheDocument();
  });

  it('o filtro "Não lidos" mostra só os novos; "Todos" volta', async () => {
    render(<Mural items={items} sources={['sigaa']} updatedAt="agora" />);
    await userEvent.click(screen.getByRole('button', { name: 'Não lidos' }));
    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).queryByText('Nova tarefa: relatório de prática')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(3);
  });

  it('um aviso novo é dito em texto para o leitor de tela (a bolinha não basta)', () => {
    render(<Mural items={items} sources={['sigaa']} updatedAt="agora" />);
    expect(screen.getAllByText('Novo')).toHaveLength(2);
  });

  it('sem avisos: "Tudo em dia" e sem filtro', () => {
    render(<Mural items={[]} sources={['moodle']} updatedAt="atualizado há 4 min" />);
    expect(screen.getByRole('heading', { name: 'Tudo em dia' })).toBeInTheDocument();
    expect(screen.getByText('Quando uma disciplina publicar um aviso, ele aparece aqui.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Não lidos' })).toBeNull();
    expect(screen.getByText('1 fonte conectada · atualizado há 4 min')).toBeInTheDocument();
  });

  it('não tem violações de acessibilidade (axe)', async () => {
    const { container } = render(<Mural items={items} sources={['sigaa', 'moodle', 'classroom']} updatedAt="agora" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
