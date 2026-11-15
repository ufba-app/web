import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { LaunchButton, SideNav, SideNavItem } from '../../src';

const logo = <svg viewBox="0 0 24 24" />;

test('com onPress vira um botão que chama a ação', async () => {
  const onPress = vi.fn();
  render(<LaunchButton label="Abrir o SIGAA" logo={logo} onPress={onPress} />);
  await userEvent.click(screen.getByRole('button', { name: 'Abrir o SIGAA' }));
  expect(onPress).toHaveBeenCalledOnce();
});

test('com href vira um link, e `as` troca o elemento do link', () => {
  const Fake = (p: React.ComponentProps<'a'>) => <a data-fake="sim" {...p} />;
  render(<LaunchButton label="Reconectar SIGAA" logo={logo} href="/connections" as={Fake} tone="attention" trailing="chevron" />);
  const link = screen.getByRole('link', { name: 'Reconectar SIGAA' });
  expect(link).toHaveAttribute('href', '/connections');
  expect(link).toHaveAttribute('data-fake', 'sim');
  expect(link).toHaveClass('ufba-launch--attention');
});

test('pendente: fica desabilitado e avisa que está ocupado', () => {
  render(<LaunchButton label="Abrir o SIGAA" logo={logo} onPress={() => {}} isPending />);
  const button = screen.getByRole('button', { name: 'Abrir o SIGAA' });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('aria-busy', 'true');
});

test('o lugar muda o tamanho: lateral por padrão, folha quando pedido', () => {
  const { rerender } = render(<LaunchButton label="A" logo={logo} onPress={() => {}} />);
  expect(screen.getByRole('button')).toHaveClass('ufba-launch--sidebar');
  rerender(<LaunchButton label="A" logo={logo} onPress={() => {}} placement="sheet" />);
  expect(screen.getByRole('button')).toHaveClass('ufba-launch--sheet');
});

test('na lateral, o slot `top` fica entre a marca e os itens', () => {
  render(
    <SideNav brand="ufba.app" top={<LaunchButton label="Abrir o SIGAA" logo={logo} onPress={() => {}} />}>
      <SideNavItem href="/">Painel</SideNavItem>
    </SideNav>,
  );
  const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
  const parts = [...nav.children].map((el) => el.className);
  expect(parts).toEqual(['ufba-nav__brand', 'ufba-nav__top', 'ufba-nav__body']);
});

test('sem violações de acessibilidade', async () => {
  const { container } = render(
    <>
      <LaunchButton label="Abrir o SIGAA" logo={logo} onPress={() => {}} />
      <LaunchButton label="Reconectar SIGAA" logo={logo} href="/connections" tone="attention" trailing="chevron" />
    </>,
  );
  expect(await axe(container)).toHaveNoViolations();
});
