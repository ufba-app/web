import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import type { AuthorizeRequest } from '../contract';
import { authorizeRequestFixture, offeredPermissionsFixture } from '../contract/fixtures';
import { notify } from '../lib/notify';
import { meHandler, mockLocationAssign, renderAuthApp } from '../test/render';
import { API, server } from '../test/server';

/**
 * Permissões por app na tela de autorizar (api#57; canvas, seção 3): o grupo SIASB com interruptores, todos desligados;
 * o texto vem da API; risco alto pede confirmação; sem a fonte conectada só aparece o caminho para conectar; o `approve`
 * leva o conjunto EXATO marcado, mas só se a pessoa mexeu em algum interruptor.
 */
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback?code=abc&state=xyz';

const withSiasb = (status: 'connected' | 'disconnected' = 'connected', available = status === 'connected'): AuthorizeRequest =>
  authorizeRequestFixture({
    sources: [
      { source: 'sigaa', status: 'connected' },
      { source: 'moodle', status: 'connected' },
      { source: 'classroom', status: 'connected' },
      { source: 'siasb', status },
    ],
    permissions: offeredPermissionsFixture(available),
  });

function mockRequest(request: AuthorizeRequest) {
  server.use(http.get(`${API}/authorize/requests/${request.id}`, () => HttpResponse.json(request)));
}

/** Registra o corpo do approve e devolve o redirect. */
function captureApprove() {
  const seen: { body: unknown; calls: number } = { body: undefined, calls: 0 };
  server.use(
    http.post(`${API}/authorize/requests/req-1/approve`, async ({ request }) => {
      seen.calls += 1;
      seen.body = await request.json();
      return HttpResponse.json({ redirectTo: CALLBACK });
    }),
  );
  return seen;
}

const lowSwitch = () => screen.findByRole('switch', { name: 'Agendar e desmarcar sessões pelo Claude' });
const highSwitch = () => screen.findByRole('switch', { name: 'Lançar e excluir procedimentos pelo Claude' });

describe('/authorize · permissões por app', () => {
  beforeEach(() => {
    server.use(meHandler());
    vi.mocked(notify.error).mockClear();
  });

  it('o SIASB aparece em "Vai ver" com as permissões da API (título e descrição dela), todas desligadas', async () => {
    mockRequest(withSiasb());
    renderAuthApp('/authorize?request=req-1');

    expect(await screen.findByRole('listitem', { name: /SIASB: Conectado/ })).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Permissões do SIASB' });
    expect(within(group).getByText(/Permite que o Claude marque e desmarque sessões/)).toBeInTheDocument();
    expect(await lowSwitch()).not.toBeChecked();
    expect(await highSwitch()).not.toBeChecked();
    // Nada é escrito pela tela: sem o aviso de "poderá agir" enquanto tudo está desligado.
    expect(screen.queryByText(/poderá agir em seu nome/)).toBeNull();
  });

  it('sem mexer em nada, Autorizar NÃO manda permissões (o que o app já tinha continua valendo)', async () => {
    const assign = mockLocationAssign();
    mockRequest(withSiasb());
    const seen = captureApprove();
    renderAuthApp('/authorize?request=req-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Autorizar' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith(CALLBACK));
    expect(seen.body).toEqual({});
  });

  it('risco baixo liga direto, mostra o aviso e o approve leva o conjunto exato marcado', async () => {
    const assign = mockLocationAssign();
    mockRequest(withSiasb());
    const seen = captureApprove();
    renderAuthApp('/authorize?request=req-1');

    await userEvent.click(await lowSwitch());

    expect(await lowSwitch()).toBeChecked();
    expect(screen.queryByRole('group', { name: /Confirmar/ })).toBeNull();
    expect(screen.getByText(/Este app poderá agir em seu nome no SIASB/)).toBeInTheDocument();
    expect(screen.getByText(/Você vê isso depois em Apps autorizados/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Autorizar' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith(CALLBACK));
    expect(seen.body).toEqual({ permissions: ['siasb.schedule_write'] });
  });

  it('risco alto pede confirmação antes de ligar; Cancelar não liga nem manda nada', async () => {
    const assign = mockLocationAssign();
    mockRequest(withSiasb());
    const seen = captureApprove();
    renderAuthApp('/authorize?request=req-1');

    await userEvent.click(await highSwitch());
    const confirm = await screen.findByRole('group', { name: 'Confirmar: Lançar e excluir procedimentos pelo Claude' });
    expect(within(confirm).getByText(/Esta permissão é sensível/)).toBeInTheDocument();
    // Ainda não está ligada: nenhuma escolha foi feita.
    expect(screen.queryByText(/poderá agir em seu nome/)).toBeNull();

    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: /Confirmar/ })).toBeNull());
    expect(await highSwitch()).not.toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: 'Autorizar' }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(seen.body).toEqual({});
  });

  it('risco alto: "Ligar" na confirmação liga e entra no conjunto enviado', async () => {
    const assign = mockLocationAssign();
    mockRequest(withSiasb());
    const seen = captureApprove();
    renderAuthApp('/authorize?request=req-1');

    await userEvent.click(await highSwitch());
    await userEvent.click(within(await screen.findByRole('group', { name: /Confirmar/ })).getByRole('button', { name: 'Ligar' }));
    expect(await highSwitch()).toBeChecked();
    expect(screen.queryByRole('group', { name: /Confirmar/ })).toBeNull();

    await userEvent.click(await lowSwitch());
    await userEvent.click(screen.getByRole('button', { name: 'Autorizar' }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect((seen.body as { permissions: string[] }).permissions.sort()).toEqual(['siasb.procedures_write', 'siasb.schedule_write']);
  });

  it('ligar e desligar de novo manda o conjunto VAZIO (a pessoa escolheu não dar nada)', async () => {
    const assign = mockLocationAssign();
    mockRequest(withSiasb());
    const seen = captureApprove();
    renderAuthApp('/authorize?request=req-1');

    await userEvent.click(await lowSwitch());
    await userEvent.click(await lowSwitch());
    expect(await lowSwitch()).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Autorizar' }));

    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(seen.body).toEqual({ permissions: [] });
  });

  it('Recusar nunca leva permissões, mesmo com interruptor ligado', async () => {
    const assign = mockLocationAssign();
    mockRequest(withSiasb());
    let body: unknown;
    server.use(
      http.post(`${API}/authorize/requests/req-1/deny`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ redirectTo: 'https://claude.ai/cb?error=access_denied&state=xyz' });
      }),
    );
    renderAuthApp('/authorize?request=req-1');

    await userEvent.click(await lowSwitch());
    await userEvent.click(screen.getByRole('button', { name: 'Recusar' }));

    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(body).toEqual({});
  });

  it('SIASB não conectado (available=false): só a nota e "Conectar agora", sem interruptores', async () => {
    mockRequest(withSiasb('disconnected'));
    renderAuthApp('/authorize?request=req-1');

    expect(await screen.findByRole('listitem', { name: /SIASB: Não conectado/ })).toBeInTheDocument();
    expect(screen.getByText(/Conecte o SIASB para o app poder usar estas permissões/)).toBeInTheDocument();
    const link = screen.getAllByRole('link', { name: 'Conectar agora' }).find((anchor) => anchor.closest('.web-perm-off'));
    expect(link).toHaveAttribute('href', 'http://localhost:3001/connections');
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('quem não tem acesso ao SIASB (a API não manda a fonte nem as permissões): nada do SIASB na tela', async () => {
    mockRequest(authorizeRequestFixture());
    const seen = captureApprove();
    mockLocationAssign();
    renderAuthApp('/authorize?request=req-1');

    expect(await screen.findByText('Claude')).toBeInTheDocument();
    expect(screen.queryByText('SIASB')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Autorizar' }));
    await waitFor(() => expect(seen.calls).toBe(1));
    expect(seen.body).toEqual({});
  });

  it('409 permission_unavailable no approve: mostra a mensagem da API e a tela segue (pedido ainda válido)', async () => {
    mockRequest(withSiasb());
    server.use(
      http.post(`${API}/authorize/requests/req-1/approve`, () =>
        HttpResponse.json({ error: 'permission_unavailable', message: 'Conecte a fonte antes de ligar esta permissão.' }, { status: 409 }),
      ),
    );
    renderAuthApp('/authorize?request=req-1');

    await userEvent.click(await lowSwitch());
    await userEvent.click(screen.getByRole('button', { name: 'Autorizar' }));

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Conecte a fonte antes de ligar esta permissão.'));
    expect(screen.getByRole('button', { name: 'Autorizar' })).toBeEnabled();
    // A escolha da pessoa continua na tela.
    expect(await lowSwitch()).toBeChecked();
  });

  it('não tem violações de acessibilidade (axe), com o grupo, uma permissão ligada e a confirmação aberta', async () => {
    mockRequest(withSiasb());
    const { container } = renderAuthApp('/authorize?request=req-1');
    await userEvent.click(await lowSwitch());
    await userEvent.click(await highSwitch());
    await screen.findByRole('group', { name: /Confirmar/ });
    expect(await axe(container)).toHaveNoViolations();
  });
});
