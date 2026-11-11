import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { axe } from 'vitest-axe';
import { AppShell, SideNav, SideNavGroup, SideNavItem } from '../../src';

test('item atual tem aria-current e os outros não', () => {
  render(
    <SideNav>
      <SideNavItem href="/" current>Painel</SideNavItem>
      <SideNavItem href="/horario">Horário</SideNavItem>
    </SideNav>,
  );
  expect(screen.getByRole('link', { name: 'Painel' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Horário' })).not.toHaveAttribute('aria-current');
});

test('SideNav é um landmark nomeado', () => {
  render(<SideNav><SideNavItem href="/">Painel</SideNavItem></SideNav>);
  expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
});

test('grupo tem título e lista', () => {
  render(
    <SideNav>
      <SideNavGroup label="Disciplinas de 2026.2">
        <SideNavItem href="/d/1">Banco de Dados</SideNavItem>
      </SideNavGroup>
    </SideNav>,
  );
  expect(screen.getByRole('heading', { name: 'Disciplinas de 2026.2' })).toBeInTheDocument();
  expect(screen.getByRole('list')).toContainElement(screen.getByRole('link', { name: 'Banco de Dados' }));
});

test('contador aparece no item', () => {
  render(<SideNav><SideNavItem href="/prazos" count={4}>Prazos</SideNavItem></SideNav>);
  expect(screen.getByRole('link', { name: /Prazos/ })).toHaveTextContent('4');
});

test('as troca o elemento do link', () => {
  const Fake = (p: ComponentProps<'a'>) => <a data-fake="sim" {...p} />;
  render(<SideNav><SideNavItem href="/" as={Fake}>Painel</SideNavItem></SideNav>);
  expect(screen.getByRole('link', { name: 'Painel' })).toHaveAttribute('data-fake', 'sim');
});

test('botão de menu abre e fecha a navegação', async () => {
  render(<AppShell sidebar={<SideNav><SideNavItem href="/">Painel</SideNavItem></SideNav>}>conteúdo</AppShell>);
  const button = screen.getByRole('button', { name: 'Abrir menu' });
  expect(button).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(button);
  expect(screen.getByRole('button', { name: 'Fechar menu' })).toHaveAttribute('aria-expanded', 'true');
  expect(document.querySelector('.ufba-shell__nav')).toHaveAttribute('data-open', 'true');
});

test('conteúdo fica no main', () => {
  render(<AppShell sidebar={<span />}>conteúdo</AppShell>);
  expect(screen.getByRole('main')).toHaveTextContent('conteúdo');
});

test('sem violações de acessibilidade', async () => {
  const { container } = render(
    <AppShell
      sidebar={
        <SideNav brand="UFBA">
          <SideNavGroup label="Curso">
            <SideNavItem href="/" current>Painel</SideNavItem>
          </SideNavGroup>
        </SideNav>
      }
    >
      <h1>Bom dia</h1>
    </AppShell>,
  );
  expect(await axe(container)).toHaveNoViolations();
});
