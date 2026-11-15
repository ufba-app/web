import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { AppShell, MobileNav, MobileNavGroup, MobileNavLink, MobileNavProfile } from '../../src';

const icon = <svg viewBox="0 0 24 24" />;

function Nav() {
  return (
    <MobileNav
      items={[
        { href: '/', label: 'Painel', icon, current: true },
        { href: '/academic', label: 'Curso', icon },
        { href: '/schedule', label: 'Horário', icon, alert: true },
        { href: '/connections', label: 'Conexões', icon },
      ]}
      action={<button type="button">Sair</button>}
      footer="Projeto de estudantes."
    >
      <MobileNavProfile avatar="MC" name="Marina Costa" detail="marina@ufba.br" />
      <MobileNavGroup label="Conta">
        <MobileNavLink href="/connections" icon={icon} detail="3 de 3">
          Conexões
        </MobileNavLink>
        <MobileNavLink href="/authorized-apps" icon={icon}>
          Apps autorizados
        </MobileNavLink>
      </MobileNavGroup>
    </MobileNav>
  );
}

const root = () => document.querySelector('.ufba-mnav') as HTMLElement;
const sheet = () => document.querySelector('.ufba-mnav__sheet') as HTMLElement;
const handle = () => screen.getByRole('button', { name: /menu completo/i });

test('a barra mostra os atalhos e marca a página atual', () => {
  render(<Nav />);
  const bar = screen.getByRole('navigation', { name: 'Menu do celular' });
  expect(bar).toHaveTextContent('Painel');
  expect(screen.getByRole('link', { name: 'Painel' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Curso' })).not.toHaveAttribute('aria-current');
  expect(screen.getByRole('img', { name: 'novidade' })).toBeInTheDocument();
});

test('a folha começa fechada: escondida de quem usa leitor de tela e sem foco', () => {
  render(<Nav />);
  expect(root()).toHaveAttribute('data-state', 'closed');
  expect(sheet()).toHaveAttribute('aria-hidden', 'true');
  expect(sheet()).toHaveAttribute('inert');
  expect(handle()).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('link', { name: /Apps autorizados/ })).not.toBeInTheDocument();
});

test('tocar na alça abre e fecha a folha', async () => {
  render(<Nav />);
  await userEvent.click(handle());
  expect(root()).toHaveAttribute('data-state', 'open');
  expect(handle()).toHaveAttribute('aria-expanded', 'true');
  expect(handle()).toHaveAccessibleName('Fechar menu completo');
  expect(screen.getByRole('link', { name: /Apps autorizados/ })).toBeVisible();
  expect(sheet()).not.toHaveAttribute('inert');
  await userEvent.click(handle());
  expect(root()).toHaveAttribute('data-state', 'closed');
});

test('Esc e o fundo escurecido fecham', async () => {
  render(<Nav />);
  await userEvent.click(handle());
  await userEvent.keyboard('{Escape}');
  expect(root()).toHaveAttribute('data-state', 'closed');

  await userEvent.click(handle());
  fireEvent.click(document.querySelector('.ufba-mnav__veil') as Element);
  expect(root()).toHaveAttribute('data-state', 'closed');
});

test('escolher um link da folha fecha', async () => {
  render(<Nav />);
  await userEvent.click(handle());
  await userEvent.click(screen.getByRole('link', { name: /Apps autorizados/ }));
  expect(root()).toHaveAttribute('data-state', 'closed');
});

test('a ação (Sair) fica na base da folha, entre a lista e o texto fixo', async () => {
  render(<Nav />);
  await userEvent.click(handle());
  const action = document.querySelector('.ufba-mnav__action') as HTMLElement;
  expect(action).toContainElement(screen.getByRole('button', { name: 'Sair' }));
  expect(action.previousElementSibling).toHaveClass('ufba-mnav__scroll');
  expect(action.nextElementSibling).toHaveClass('ufba-mnav__footer');
});

test('setas na alça abrem e fecham', () => {
  render(<Nav />);
  fireEvent.keyDown(handle(), { key: 'ArrowUp' });
  expect(root()).toHaveAttribute('data-state', 'open');
  fireEvent.keyDown(handle(), { key: 'ArrowDown' });
  expect(root()).toHaveAttribute('data-state', 'closed');
});

describe('arrasto', () => {
  beforeEach(() => {
    // O jsdom não faz layout: dá à folha uma altura para a conta do progresso.
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });
  });
  afterEach(() => {
    // @ts-expect-error volta ao padrão do jsdom
    delete HTMLElement.prototype.offsetHeight;
  });

  /** Dispara um evento de ponteiro com hora marcada (o jsdom ignora o timeStamp do init). */
  const point = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', el: Element, clientY: number, timeStamp: number) => {
    const event = createEvent[type](el, { clientY, pointerId: 1, button: 0 });
    Object.defineProperty(event, 'timeStamp', { value: timeStamp });
    fireEvent(el, event);
  };
  const drag = (el: Element, from: number, to: number, ms = 400) => {
    point('pointerDown', el, from, 10);
    point('pointerMove', el, to, 10 + ms);
  };

  test('a folha acompanha o dedo e, solta passando da metade, abre', () => {
    render(<Nav />);
    drag(handle(), 700, 450); // 250px de 400 = 62%
    expect(root()).toHaveAttribute('data-state', 'dragging');
    expect(root().style.getPropertyValue('--ufba-mnav-p')).toBe('0.625');
    point('pointerUp', handle(), 450, 410);
    expect(root()).toHaveAttribute('data-state', 'open');
  });

  test('solta antes da metade e devagar, volta a fechar', () => {
    render(<Nav />);
    drag(handle(), 700, 600); // 25%
    point('pointerUp', handle(), 600, 1010);
    expect(root()).toHaveAttribute('data-state', 'closed');
  });

  test('um puxão rápido para cima abre mesmo curto', () => {
    render(<Nav />);
    drag(handle(), 700, 640, 40); // 60px em 40ms
    point('pointerUp', handle(), 640, 50);
    expect(root()).toHaveAttribute('data-state', 'open');
  });

  test('arrastar a folha aberta para baixo pela alça dela fecha', () => {
    render(<Nav />);
    fireEvent.click(handle());
    expect(root()).toHaveAttribute('data-state', 'open');
    const grip = document.querySelector('.ufba-mnav__grip') as Element;
    drag(grip, 100, 380); // 70% para baixo
    point('pointerUp', grip, 380, 410);
    expect(root()).toHaveAttribute('data-state', 'closed');
  });

  test('o clique que o navegador manda depois de arrastar a alça da barra não desfaz o arrasto', () => {
    render(<Nav />);
    drag(handle(), 700, 450);
    point('pointerUp', handle(), 450, 410);
    expect(root()).toHaveAttribute('data-state', 'open');
    fireEvent.click(handle()); // o "click" solto que vem logo após o arrasto
    expect(root()).toHaveAttribute('data-state', 'open');
    fireEvent.click(handle()); // um toque de verdade, depois, fecha
    expect(root()).toHaveAttribute('data-state', 'closed');
  });

  test('depois de fechar arrastando a folha, o toque seguinte na alça da barra abre', () => {
    render(<Nav />);
    fireEvent.click(handle());
    const grip = document.querySelector('.ufba-mnav__grip') as Element;
    drag(grip, 100, 380);
    point('pointerUp', grip, 380, 410);
    expect(root()).toHaveAttribute('data-state', 'closed');
    fireEvent.click(handle()); // a alça da folha não recebe clique: nada pode ter sobrado para engolir este
    expect(root()).toHaveAttribute('data-state', 'open');
  });

  test('o progresso não passa de 0 a 1', () => {
    render(<Nav />);
    drag(handle(), 700, -900);
    expect(root().style.getPropertyValue('--ufba-mnav-p')).toBe('1');
    fireEvent.pointerCancel(handle());
    expect(root()).toHaveAttribute('data-state', 'closed');
  });
});

test('no AppShell, a navegação do celular troca o botão "Abrir menu"', () => {
  render(
    <AppShell sidebar={<span />} mobileNav={<Nav />}>
      conteúdo
    </AppShell>,
  );
  expect(screen.queryByRole('button', { name: 'Abrir menu' })).not.toBeInTheDocument();
  expect(document.querySelector('.ufba-shell')).toHaveClass('ufba-shell--mobile-nav');
});

test('sem violações de acessibilidade, fechada e aberta', async () => {
  const { container } = render(<Nav />);
  expect(await axe(container)).toHaveNoViolations();
  await userEvent.click(handle());
  expect(await axe(container)).toHaveNoViolations();
});
