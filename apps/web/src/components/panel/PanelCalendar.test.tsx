import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { myCalendarFixture } from '../../contract/panelFixture';
import { eventsFromCalendar, type Mode } from './model';
import { PanelCalendar } from './PanelCalendar';

/**
 * O calendário controlado, com os DADOS FIXOS do formato de GET /me/calendar. O layout não é calculado no jsdom (o CSS
 * esconde cartões e mostra pontos no celular); o que se confere aqui é a estrutura, o texto e as ações.
 */
const events = eventsFromCalendar(myCalendarFixture());

function setup(overrides: Partial<{ selected: string; mode: Mode; loading: boolean; today: string }> = {}) {
  const handlers = { onSelect: vi.fn(), onMode: vi.fn(), onNavigate: vi.fn(), onToday: vi.fn() };
  const view = render(
    <PanelCalendar today={overrides.today ?? '2026-11-15'} selected={overrides.selected ?? '2026-11-17'} mode={overrides.mode ?? 'month'} events={events} loading={overrides.loading ?? false} {...handlers} />,
  );
  return { ...view, ...handlers };
}

const day = (name: RegExp) => screen.getByRole('button', { name });

describe('PanelCalendar · mês', () => {
  it('título, a grade de 35 dias (domingo a sábado) e o hoje marcado', () => {
    setup();
    const calendar = screen.getByRole('region', { name: 'Calendário' });
    expect(within(calendar).getByRole('heading', { name: /Novembro/ })).toHaveTextContent('Novembro2026');
    // 35 dias da grade; os botões de navegação e de modo não são dias.
    expect(within(calendar).getAllByRole('button', { name: /^\d+ de / })).toHaveLength(35);
    expect(day(/^15 de novembro/)).toHaveAttribute('aria-current', 'date');
    expect(day(/^17 de novembro/)).toHaveAttribute('aria-pressed', 'true');
    expect(day(/^16 de novembro/)).toHaveAttribute('aria-pressed', 'false');
  });

  it('cada dia diz o que há nele em texto (sessão, feriado, aula); dia vazio diz "sem nada"', () => {
    setup();
    expect(day(/^17 de novembro/)).toHaveAccessibleName('17 de novembro: Aula, Histologia');
    expect(day(/^2 de novembro/)).toHaveAccessibleName('2 de novembro: Sem aula, Finados');
    expect(day(/^12 de novembro/)).toHaveAccessibleName('12 de novembro: Clínica, Sessão na clínica; Aula, Histologia');
    expect(day(/^1 de novembro/)).toHaveAccessibleName('1 de novembro, sem nada');
  });

  it('feriado: nenhuma aula no dia (a regra é da API, a tela respeita)', () => {
    setup();
    // Só o prazo do SIGAA (que vale no feriado) e o próprio feriado; nenhuma aula.
    expect(day(/^20 de novembro/)).toHaveAccessibleName('20 de novembro: Prazo, Lista de exercícios de Anatomia; Sem aula, Consciência Negra');
  });

  it('o dia escolhido embaixo: título, quantas coisas e cada uma com seu selo (a sessão antes da aula)', () => {
    setup({ selected: '2026-11-12' });
    const detail = screen.getByRole('region', { name: 'Quinta, 12 de novembro' });
    expect(within(detail).getByText('2 coisas')).toBeInTheDocument();
    expect(within(detail).getByText('Histologia')).toBeInTheDocument();
    expect(within(detail).getByText('10:00–12:00 · Lab. 2')).toBeInTheDocument();
    const selos = within(detail).getAllByText(/^(Clínica|Aula)$/, { selector: '.pn-selo' }).map((el) => el.textContent);
    expect(selos).toEqual(['Clínica', 'Aula']);
  });

  it('prova e prazo têm selo, ícone e cor próprios (texto + ícone, a cor nunca fala sozinha)', () => {
    setup({ selected: '2026-11-18' });
    const prova = screen.getByRole('region', { name: 'Quarta, 18 de novembro' });
    expect(within(prova).getByText('Prova', { selector: '.pn-selo--exam' })).toBeInTheDocument();
    expect(within(prova).getByText('Às 14:00')).toBeInTheDocument();
    expect(prova.querySelector('.pn-ev__fonte--exam svg')).not.toBeNull();
    expect(day(/^18 de novembro/)).toHaveAccessibleName('18 de novembro: Prova, Prova 1 de Anatomia; Aula, Anatomia');
  });

  it('prazo no feriado: aparece com o selo Prazo e o limite, junto do "Sem aula"', () => {
    setup({ selected: '2026-11-20' });
    const detail = screen.getByRole('region', { name: 'Sexta, 20 de novembro' });
    expect(within(detail).getByText('Prazo', { selector: '.pn-selo--deadline' })).toBeInTheDocument();
    expect(within(detail).getByText('Até 23:59')).toBeInTheDocument();
    expect(within(detail).getByText('Sem aula', { selector: '.pn-selo' })).toBeInTheDocument();
    expect(detail.querySelector('.pn-ev__fonte--deadline svg')).not.toBeNull();
  });

  it('prova sem hora (00:00) diz "Sem hora marcada", nunca "Às 00:00"', () => {
    setup({ selected: '2026-11-25' });
    const detail = screen.getByRole('region', { name: 'Quarta, 25 de novembro' });
    expect(within(detail).getByText('Sem hora marcada')).toBeInTheDocument();
    expect(within(detail).queryByText(/00:00/)).toBeNull();
  });

  it('dia sem nada: "Livre" e a mensagem; a sessão da clínica leva o ícone e o nome da fonte SIASB', () => {
    const livre = setup({ selected: '2026-11-15' });
    expect(within(screen.getByRole('region', { name: 'Domingo, 15 de novembro' })).getByText('Livre')).toBeInTheDocument();
    expect(screen.getByText('Nada marcado para esse dia.')).toBeInTheDocument();
    livre.unmount();
    setup({ selected: '2026-11-12' });
    const detail = screen.getByRole('region', { name: 'Quinta, 12 de novembro' });
    expect(within(detail).getByTitle('SIASB')).toBeInTheDocument();
    expect(within(detail).getByText('Sessão na clínica')).toBeInTheDocument();
    expect(within(detail).getByText('Clínica', { selector: '.pn-selo' })).toBeInTheDocument();
  });

  it('enquanto o intervalo novo carrega, o dia mostra um esqueleto e não o "Livre" nem a contagem', () => {
    const { container } = setup({ selected: '2026-11-15', loading: true });
    expect(container.querySelector('.pn-ev__sk')).not.toBeNull();
    expect(screen.queryByText('Livre')).toBeNull();
    expect(screen.queryByText('Nada marcado para esse dia.')).toBeNull();
  });

  it('a legenda cita Aula e Sessão na clínica só quando há (e o Feriado sempre)', () => {
    const view = setup();
    const legend = view.container.querySelector('.pn-legenda')!;
    for (const text of ['Aula', 'Feriado ou sem aula', 'Sessão na clínica', 'Prova', 'Prazo']) expect(within(legend as HTMLElement).getByText(text)).toBeInTheDocument();
    view.unmount();
    // Sem aulas nem sessões (como a API entrega hoje, e para quem não tem o SIASB): só o feriado.
    const semAulas = eventsFromCalendar(myCalendarFixture({ days: [{ date: '2026-11-02', nonTeaching: { name: 'Finados' }, items: [] }] }));
    const noClasses = render(<PanelCalendar today="2026-11-15" selected="2026-11-17" mode="month" events={semAulas} loading={false} onSelect={() => {}} onMode={() => {}} onNavigate={() => {}} onToday={() => {}} />);
    const legend2 = noClasses.container.querySelector('.pn-legenda') as HTMLElement;
    expect(within(legend2).queryByText('Aula')).toBeNull();
    expect(within(legend2).queryByText('Sessão na clínica')).toBeNull();
    expect(within(legend2).queryByText('Prova')).toBeNull();
    expect(within(legend2).queryByText('Prazo')).toBeNull();
    expect(within(legend2).getByText('Feriado ou sem aula')).toBeInTheDocument();
  });

  it('as ações: escolher um dia, Mês/Semana, anterior, Hoje e próximo', async () => {
    const view = setup();
    await userEvent.click(day(/^19 de novembro/));
    expect(view.onSelect).toHaveBeenCalledWith('2026-11-19');
    await userEvent.click(screen.getByRole('button', { name: 'Semana' }));
    expect(view.onMode).toHaveBeenCalledWith('week');
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(view.onNavigate).toHaveBeenLastCalledWith(-1);
    await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(view.onNavigate).toHaveBeenLastCalledWith(1);
    await userEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(view.onToday).toHaveBeenCalledOnce();
  });

  it('dá para escolher um dia pelo teclado (Enter no botão do dia)', async () => {
    const view = setup();
    day(/^24 de novembro/).focus();
    await userEvent.keyboard('{Enter}');
    expect(view.onSelect).toHaveBeenCalledWith('2026-11-24');
  });

  it('não tem violações de acessibilidade (axe)', async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('PanelCalendar · semana', () => {
  it('7 colunas (domingo a sábado) da semana do dia escolhido, com os eventos de cada uma', () => {
    setup({ mode: 'week' });
    const calendar = screen.getByRole('region', { name: 'Calendário' });
    const days = within(calendar).getAllByRole('button', { name: /^\d+ de / });
    expect(days).toHaveLength(7);
    expect(days[0]).toHaveAccessibleName(/^15 de novembro/);
    expect(days[6]).toHaveAccessibleName(/^21 de novembro/);
    expect(within(days[1]!).getByText('Anatomia')).toBeInTheDocument(); // segunda, 16
    expect(within(days[0]!).getByText('Livre')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semana anterior' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próxima semana' })).toBeInTheDocument();
  });

  it('o modo atual fica marcado (aria-pressed) e não tem violações de acessibilidade (axe)', async () => {
    const { container } = setup({ mode: 'week' });
    expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Mês' })).toHaveAttribute('aria-pressed', 'false');
    expect(await axe(container)).toHaveNoViolations();
  });
});
