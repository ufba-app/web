import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { AuthLayout, ServiceIcon, type Service } from '../../src';

test.each<[Service, string]>([
  ['sigaa', 'SIGAA'],
  ['moodle', 'Moodle'],
  ['classroom', 'Classroom'],
  ['google', 'Google'],
])('ServiceIcon %s com rótulo tem nome acessível', (service, label) => {
  render(<ServiceIcon service={service} label={label} />);
  expect(screen.getByRole('img', { name: label })).toBeInTheDocument();
});

test('ServiceIcon sem rótulo fica escondido do leitor de tela', () => {
  const { container } = render(<ServiceIcon service="moodle" />);
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  expect(screen.queryByRole('img')).toBeNull();
});

const layout = (
  <AuthLayout
    headline="Seu semestre num lugar só."
    subline="Horário, prazos, notas e faltas, sempre atualizados."
    sources={['sigaa', 'moodle', 'classroom']}
    below={<p>Como marina.costa@ufba.br</p>}
  >
    <h1>Entrar</h1>
  </AuthLayout>
);

test('AuthLayout: bloco de marca, fontes, cartão no main e linha abaixo do cartão', () => {
  const { container } = render(layout);
  expect(screen.getByText('Seu semestre num lugar só.')).toBeInTheDocument();
  for (const n of ['SIGAA', 'Moodle', 'Classroom']) expect(screen.getByText(n)).toBeInTheDocument();
  const main = screen.getByRole('main');
  const card = container.querySelector('.ufba-auth__card');
  expect(main).toContainElement(card as HTMLElement);
  expect(card).toContainElement(screen.getByRole('heading', { name: 'Entrar' }));
  expect(card).not.toContainElement(screen.getByText('Como marina.costa@ufba.br'));
  expect(main).toContainElement(screen.getByText('Como marina.costa@ufba.br'));
});

test('AuthLayout sem violações de acessibilidade', async () => {
  const { container } = render(layout);
  expect(await axe(container)).toHaveNoViolations();
});
