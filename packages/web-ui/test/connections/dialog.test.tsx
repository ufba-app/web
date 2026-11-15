import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { Button, Dialog, StepList } from '../../src';

const dialog = (onOpenChange = vi.fn()) => (
  <Dialog isOpen onOpenChange={onOpenChange} title="Conectar o SIGAA" actions={<Button>Conectar</Button>}>
    <p>Use o CPF e a senha do SIGAA.</p>
  </Dialog>
);

test('diálogo aberto tem papel e nome', () => {
  render(dialog());
  expect(screen.getByRole('dialog', { name: 'Conectar o SIGAA' })).toBeInTheDocument();
  expect(screen.getByText('Use o CPF e a senha do SIGAA.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Conectar' })).toBeInTheDocument();
});

test('Esc pede para fechar', async () => {
  const onOpenChange = vi.fn();
  render(dialog(onOpenChange));
  await userEvent.keyboard('{Escape}');
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

describe('folha no celular: alça de arrastar', () => {
  const grip = () => document.querySelector('.ufba-dialog__grip') as HTMLElement;
  const sheet = () => document.querySelector('.ufba-dialog') as HTMLElement;
  const point = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', clientY: number, timeStamp: number) => {
    const event = createEvent[type](grip(), { clientY, pointerId: 1, button: 0 });
    Object.defineProperty(event, 'timeStamp', { value: timeStamp });
    fireEvent(grip(), event);
  };

  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  test('a alça existe, é escondida de leitor de tela e o container usa a posição automática', () => {
    render(dialog());
    expect(grip()).toHaveAttribute('aria-hidden', 'true');
    expect(document.querySelector('.ufba-dialog__container')).toHaveAttribute('data-placement', 'auto');
  });

  test('a folha acompanha o dedo para baixo e nunca sobe acima do lugar', () => {
    render(dialog());
    point('pointerDown', 200, 10);
    point('pointerMove', 260, 60);
    expect(sheet().style.transform).toBe('translateY(60px)');
    point('pointerMove', 150, 90);
    expect(sheet().style.transform).toBe('translateY(0px)');
  });

  test('solta antes do limite e devagar: volta ao lugar e não fecha', () => {
    const onOpenChange = vi.fn();
    render(dialog(onOpenChange));
    point('pointerDown', 200, 10);
    point('pointerMove', 240, 1010);
    point('pointerUp', 240, 1020);
    act(() => void vi.advanceTimersByTime(400));
    expect(sheet().style.transform).toBe('');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  test('descer além do limite fecha depois da folha sair pela base', () => {
    const onOpenChange = vi.fn();
    render(dialog(onOpenChange));
    point('pointerDown', 200, 10);
    point('pointerMove', 330, 1010);
    point('pointerUp', 330, 1020);
    expect(onOpenChange).not.toHaveBeenCalled(); // ainda saindo
    act(() => void vi.advanceTimersByTime(250));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test('um puxão rápido fecha mesmo curto', () => {
    const onOpenChange = vi.fn();
    render(dialog(onOpenChange));
    point('pointerDown', 200, 10);
    point('pointerMove', 250, 50); // 50px em 40ms
    point('pointerUp', 250, 60);
    act(() => void vi.advanceTimersByTime(250));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

test('campo focado dentro do diálogo é trazido para o meio da vista (teclado aberto)', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  render(
    <Dialog isOpen onOpenChange={() => {}} title="Conectar o SIGAA" actions={null}>
      <input aria-label="CPF" />
    </Dialog>,
  );
  await userEvent.click(screen.getByLabelText('CPF'));
  act(() => void vi.advanceTimersByTime(400));
  expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
  vi.useRealTimers();
});

test('fechado não renderiza', () => {
  render(
    <Dialog isOpen={false} onOpenChange={() => {}} title="Conectar o Moodle" actions={null}>
      <p>x</p>
    </Dialog>,
  );
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('StepList: ordem, números e passo feito', () => {
  render(
    <StepList
      steps={[
        { text: 'Navegador já permite os links do Moodle.', done: true },
        { text: 'Entre no AVA com a sua conta da UFBA.' },
        { text: 'Pronto, você volta para cá.' },
      ]}
    />,
  );
  const items = screen.getAllByRole('listitem');
  expect(items).toHaveLength(3);
  expect(items[0]).toHaveTextContent('Feito');
  expect(items[1]).toHaveTextContent('1Entre no AVA');
  expect(items[2]).toHaveTextContent('2Pronto');
});

test('sem violações de acessibilidade', async () => {
  const { baseElement } = render(dialog());
  expect(await axe(baseElement)).toHaveNoViolations();
});
