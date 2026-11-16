import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { AuthorizeRequest } from '../contract';
import { authorizeRequestFixture, moodleForumPermissionFixture, offeredPermissionsFixture } from '../contract/fixtures';
import { meHandler, mockLocationAssign, renderAuthApp } from '../test/render';
import { API, server } from '../test/server';

/**
 * A permissão de postar em fóruns do AVA (moodle.forum_write, api#65) na tela de autorizar: o MESMO componente das do
 * SIASB, genérico por fonte. Grupo "Moodle" sob a linha do Moodle, interruptor, confirmação de risco alto, indisponível
 * quando o Moodle não está conectado, aviso "agir em seu nome" com o nome da fonte; e a área de cada fonte tem altura
 * fixa, com rolagem própria (nada que aparece estica a tela).
 */
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback?code=abc&state=xyz';

const request = (opts: { moodle?: 'connected' | 'disconnected'; granted?: boolean; siasb?: boolean } = {}): AuthorizeRequest => {
  const moodle = opts.moodle ?? 'connected';
  return authorizeRequestFixture({
    sources: [
      { source: 'sigaa', status: 'connected' },
      { source: 'moodle', status: moodle },
      { source: 'classroom', status: 'connected' },
      ...(opts.siasb ? [{ source: 'siasb' as const, status: 'connected' as const }] : []),
    ],
    permissions: [
      moodleForumPermissionFixture(moodle === 'connected', opts.granted ?? false),
      ...(opts.siasb ? offeredPermissionsFixture(true) : []),
    ],
  });
};

function mockRequest(value: AuthorizeRequest) {
  server.use(http.get(`${API}/authorize/requests/${value.id}`, () => HttpResponse.json(value)));
}

function captureApprove() {
  const seen: { body: unknown; calls: number } = { body: undefined, calls: 0 };
  server.use(
    http.post(`${API}/authorize/requests/req-1/approve`, async ({ request: req }) => {
      seen.calls += 1;
      seen.body = await req.json();
      return HttpResponse.json({ redirectTo: CALLBACK });
    }),
  );
  return seen;
}

const forumSwitch = () => screen.findByRole('switch', { name: 'Postar em fóruns do AVA pelo app' });

describe('/authorize · permissão do Moodle (postar em fóruns)', () => {
  beforeEach(() => {
    server.use(meHandler());
  });

  it('o grupo Moodle aparece sob a linha do Moodle, com o texto da API e o interruptor desligado', async () => {
    mockRequest(request());
    renderAuthApp('/authorize?request=req-1');

    const row = await screen.findByRole('listitem', { name: /Moodle: Conectado/ });
    const group = within(row).getByRole('group', { name: 'Permissões do Moodle' });
    expect(within(group).getByText(/Permite que o app publique mensagens em fóruns do AVA/)).toBeInTheDocument();
    expect(await forumSwitch()).not.toBeChecked();
    // Só o Moodle tem permissão aqui: a linha do SIGAA não ganha grupo.
    expect(within(screen.getByRole('listitem', { name: /SIGAA: Conectado/ })).queryByRole('group')).toBeNull();
  });

  it('risco alto: ligar pede confirmação (dentro da área do Moodle); "Ligar" liga e vai no approve', async () => {
    const assign = mockLocationAssign();
    mockRequest(request());
    const seen = captureApprove();
    renderAuthApp('/authorize?request=req-1');

    await userEvent.click(await forumSwitch());
    const confirm = await screen.findByRole('group', { name: 'Confirmar: Postar em fóruns do AVA pelo app' });
    // A confirmação mora DENTRO da área do grupo (altura fixa): não cria bloco novo fora dela.
    expect(screen.getByRole('group', { name: 'Permissões do Moodle' })).toContainElement(confirm);
    expect(await forumSwitch()).not.toBeChecked();

    await userEvent.click(within(confirm).getByRole('button', { name: 'Ligar' }));
    expect(await forumSwitch()).toBeChecked();
    // O aviso é genérico por fonte: diz Moodle, não SIASB.
    expect(screen.getByText(/Este app poderá agir em seu nome no Moodle/)).toBeInTheDocument();
    expect(screen.queryByText(/no SIASB/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Autorizar' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith(CALLBACK));
    expect(seen.body).toEqual({ permissions: ['moodle.forum_write'] });
  });

  it('o texto da confirmação não promete nada que a API não prometa (a confirmação por ação vem na descrição)', async () => {
    mockRequest(request());
    renderAuthApp('/authorize?request=req-1');
    await userEvent.click(await forumSwitch());
    const confirm = await screen.findByRole('group', { name: /Confirmar/ });
    expect(within(confirm).getByText(/Esta permissão é sensível/)).toBeInTheDocument();
    expect(within(confirm).queryByText(/cada ação ainda pede/)).toBeNull();
  });

  it('já concedida ao app (granted): vem ligada, sem confirmação, e Autorizar mantém o conjunto', async () => {
    const assign = mockLocationAssign();
    mockRequest(request({ granted: true }));
    const seen = captureApprove();
    renderAuthApp('/authorize?request=req-1');

    expect(await forumSwitch()).toBeChecked();
    expect(screen.queryByRole('group', { name: /Confirmar/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Autorizar' }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(seen.body).toEqual({ permissions: ['moodle.forum_write'] });
  });

  it('Moodle não conectado: só a nota "Conecte o Moodle…" e "Conectar agora", sem interruptor', async () => {
    mockRequest(request({ moodle: 'disconnected' }));
    const seen = captureApprove();
    mockLocationAssign();
    renderAuthApp('/authorize?request=req-1');

    expect(await screen.findByRole('listitem', { name: /Moodle: Não conectado/ })).toBeInTheDocument();
    expect(screen.getByText(/Conecte o Moodle para o app poder usar estas permissões/)).toBeInTheDocument();
    const link = screen.getAllByRole('link', { name: 'Conectar agora' }).find((anchor) => anchor.closest('.web-perm-off'));
    expect(link).toHaveAttribute('href', 'http://localhost:3001/connections');
    expect(screen.queryByRole('switch')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Autorizar' }));
    await waitFor(() => expect(seen.calls).toBe(1));
    // Fonte desconectada não entra no conjunto (a API recusaria com 409).
    expect(seen.body).toEqual({ permissions: [] });
  });

  it('SIASB e Moodle juntos: um grupo por fonte, cada um com a sua área; o conjunto leva as duas escolhas', async () => {
    const assign = mockLocationAssign();
    mockRequest(request({ siasb: true }));
    const seen = captureApprove();
    renderAuthApp('/authorize?request=req-1');

    const moodle = await screen.findByRole('group', { name: 'Permissões do Moodle' });
    const siasb = screen.getByRole('group', { name: 'Permissões do SIASB' });
    expect(moodle).not.toBe(siasb);
    expect(within(moodle).getAllByRole('switch')).toHaveLength(1);
    expect(within(siasb).getAllByRole('switch')).toHaveLength(2);

    await userEvent.click(within(siasb).getByRole('switch', { name: 'Agendar e desmarcar sessões pelo app' }));
    await userEvent.click(await forumSwitch());
    await userEvent.click(within(await screen.findByRole('group', { name: /Confirmar/ })).getByRole('button', { name: 'Ligar' }));
    // Cada aviso diz o nome da sua fonte.
    expect(within(moodle).getByText(/poderá agir em seu nome no Moodle/)).toBeInTheDocument();
    expect(within(siasb).getByText(/poderá agir em seu nome no SIASB/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Autorizar' }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect((seen.body as { permissions: string[] }).permissions.sort()).toEqual(['moodle.forum_write', 'siasb.schedule_write']);
  });

  it('altura fixa: cada área tem tamanho pelo número de permissões, rola sozinha e recebe foco do teclado', async () => {
    mockRequest(request({ siasb: true }));
    renderAuthApp('/authorize?request=req-1');

    const moodle = await screen.findByRole('group', { name: 'Permissões do Moodle' });
    const siasb = screen.getByRole('group', { name: 'Permissões do SIASB' });
    // Uma permissão: área menor; duas: maior (as classes carregam a altura fixa no CSS).
    expect(moodle).toHaveClass('web-perm-grp--one');
    expect(siasb).toHaveClass('web-perm-grp--many');
    expect(moodle).toHaveAttribute('tabindex', '0');
    expect(siasb).toHaveAttribute('tabindex', '0');

    // Interagir NÃO muda a área: as classes (altura) são as mesmas depois de ligar e de abrir a confirmação.
    await userEvent.click(await forumSwitch());
    await screen.findByRole('group', { name: /Confirmar/ });
    expect(screen.getByRole('group', { name: 'Permissões do Moodle' })).toHaveClass('web-perm-grp--one');
    expect(screen.getByRole('group', { name: 'Permissões do SIASB' })).toHaveClass('web-perm-grp--many');
  });

  it('não tem violações de acessibilidade (axe), com as duas áreas roláveis e uma confirmação aberta', async () => {
    mockRequest(request({ siasb: true }));
    const { container } = renderAuthApp('/authorize?request=req-1');
    await userEvent.click(await forumSwitch());
    await screen.findByRole('group', { name: /Confirmar/ });
    expect(await axe(container)).toHaveNoViolations();
  });
});
