import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';
import { deviceLookupFixture } from '../contract/fixtures';
import type { DeviceLookup } from '../contract';
import { notify } from '../lib/notify';
import { meHandler, mockLocationReplace, renderApp, signedOutMeHandler } from '../test/render';
import { API, server } from '../test/server';

let lookup: DeviceLookup;
let lookupBodies: unknown[];
let decisions: Array<{ body: unknown; headers: Headers }>;

beforeEach(() => {
  lookup = deviceLookupFixture();
  lookupBodies = [];
  decisions = [];
  server.use(
    meHandler(),
    http.post(`${API}/device/lookup`, async ({ request }) => {
      lookupBodies.push(await request.json());
      return HttpResponse.json(lookup);
    }),
    http.post(`${API}/device/decision`, async ({ request }) => {
      decisions.push({ body: await request.json(), headers: request.headers });
      return new HttpResponse(null, { status: 204 });
    }),
  );
});

const codeField = () => screen.findByLabelText('Código do computador');

async function typeAndContinue(code: string) {
  await userEvent.type(await codeField(), code);
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
}

describe('/device', () => {
  it('digita o código (minúsculas, sem hífen), mostra quem pediu e aprova', async () => {
    renderApp('/device');
    const field = await codeField();
    await userEvent.type(field, 'abcd1234');
    expect(field).toHaveValue('ABCD-1234');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByRole('heading', { name: 'Quem pediu' })).toBeInTheDocument();
    expect(lookupBodies).toEqual([{ userCode: 'ABCD-1234' }]);
    expect(screen.getByText('Notebook da Marina')).toBeInTheDocument();
    expect(screen.getByText('Windows')).toBeInTheDocument();
    expect(screen.getByText('Salvador, BA')).toBeInTheDocument();
    expect(screen.getByText('Gravar a memória desta máquina na sua conta.')).toBeInTheDocument();
    expect(screen.getByText('Só aprove se este código apareceu agora no SEU terminal.')).toBeInTheDocument();
    expect(screen.queryByText(/rede de quem aprova é bem diferente/i)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Aprovar' }));

    expect(await screen.findByRole('heading', { name: 'Computador conectado' })).toBeInTheDocument();
    expect(screen.getByText(/pode voltar ao terminal/i)).toBeInTheDocument();
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.body).toEqual({ userCode: 'ABCD-1234', decision: 'approve' });
    expect(decisions[0]?.headers.get('x-ufba')).toBe('1');
    expect(notify.success).toHaveBeenCalledWith(expect.stringMatching(/voltar ao terminal/i));
  });

  it('negar manda deny, avisa com toast de informação e encerra', async () => {
    renderApp('/device');
    await typeAndContinue('ABCD-1234');
    await userEvent.click(await screen.findByRole('button', { name: 'Negar' }));

    expect(await screen.findByRole('heading', { name: 'Pedido negado' })).toBeInTheDocument();
    expect(decisions[0]?.body).toEqual({ userCode: 'ABCD-1234', decision: 'deny' });
    expect(notify.info).toHaveBeenCalledWith('Pedido negado.');
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('ipDiffers: destaca o aviso da rede', async () => {
    lookup = deviceLookupFixture({ ipDiffers: true, computerName: null, os: null, approxLocation: null });
    renderApp('/device');
    await typeAndContinue('ABCD1234');
    const warning = await screen.findByText('A rede de quem aprova é bem diferente da de quem pediu. Se não foi você, negue.');
    expect(warning).toBeInTheDocument();
    expect(screen.getByText('Nome não informado')).toBeInTheDocument();
    expect(screen.getByText('Sistema não informado')).toBeInTheDocument();
    expect(screen.getByText('Não identificada')).toBeInTheDocument();
  });

  it.each([
    [404, 'device_code_invalid', 'Código não encontrado. Confira no terminal.'],
    [410, 'device_code_expired', 'Esse código venceu. Gere outro no terminal.'],
    [429, 'too_many_attempts', 'Muitas tentativas. Espere um pouco.'],
  ])('erro %i (%s) aparece no campo e não vira toast', async (status, error, message) => {
    server.use(http.post(`${API}/device/lookup`, () => HttpResponse.json({ error, message }, { status })));
    renderApp('/device');
    await typeAndContinue('ABCD-1234');
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Código do computador')).toHaveAttribute('aria-invalid', 'true');
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('outro erro do servidor vira toast e o formulário continua', async () => {
    server.use(
      http.post(`${API}/device/lookup`, () =>
        HttpResponse.json({ error: 'memory_unavailable', message: 'A memória está fora do ar.' }, { status: 503 }),
      ),
    );
    renderApp('/device');
    await typeAndContinue('ABCD-1234');
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('A memória está fora do ar.'));
    expect(screen.getByLabelText('Código do computador')).toBeInTheDocument();
  });

  it('código incompleto ou vazio: valida no formulário, sem chamar a API', async () => {
    renderApp('/device');
    await userEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('Digite o código que apareceu no terminal.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Código do computador'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText(/o código tem 8 letras e números/i)).toBeInTheDocument();
    expect(lookupBodies).toHaveLength(0);
  });

  it('código no link: consulta por POST e limpa a URL', async () => {
    window.history.pushState(null, '', '/device?user_code=abcd1234');
    const replaceState = vi.spyOn(window.history, 'replaceState');
    renderApp('/device?user_code=abcd1234');

    expect(await screen.findByRole('heading', { name: 'Quem pediu' })).toBeInTheDocument();
    expect(lookupBodies).toEqual([{ userCode: 'ABCD-1234' }]);
    expect(replaceState.mock.calls[0]?.slice(1)).toEqual(['', '/device']);
    expect(window.location.search).toBe('');
    expect(window.location.href).not.toMatch(/user_code/i);
  });

  it('código do link incompleto: limpa a URL e pede para digitar', async () => {
    window.history.pushState(null, '', '/device?user_code=ab');
    renderApp('/device?user_code=ab');
    expect(await screen.findByText(/o código do link está incompleto/i)).toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(lookupBodies).toHaveLength(0);
  });

  it('código do link que não existe: erro no campo', async () => {
    server.use(
      http.post(`${API}/device/lookup`, () =>
        HttpResponse.json({ error: 'device_code_invalid', message: 'Código não encontrado.' }, { status: 404 }),
      ),
    );
    window.history.pushState(null, '', '/device?user_code=ZZZZ-9999');
    renderApp('/device?user_code=ZZZZ-9999');
    expect(await screen.findByRole('alert')).toHaveTextContent('Código não encontrado.');
    expect(window.location.search).toBe('');
  });

  it('o código vence entre a consulta e a decisão: volta ao formulário com a mensagem no campo', async () => {
    server.use(
      http.post(`${API}/device/decision`, () =>
        HttpResponse.json({ error: 'device_code_expired', message: 'Esse código venceu.' }, { status: 410 }),
      ),
    );
    renderApp('/device');
    await typeAndContinue('ABCD-1234');
    await userEvent.click(await screen.findByRole('button', { name: 'Aprovar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esse código venceu.');
    expect(screen.getByLabelText('Código do computador')).toHaveValue('');
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('falha ao decidir (outro erro): toast e continua na confirmação', async () => {
    server.use(
      http.post(`${API}/device/decision`, () =>
        HttpResponse.json({ error: 'computer_limit_reached', message: 'Você já tem computadores demais.' }, { status: 409 }),
      ),
    );
    renderApp('/device');
    await typeAndContinue('ABCD-1234');
    await userEvent.click(await screen.findByRole('button', { name: 'Aprovar' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Você já tem computadores demais.'));
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument();
  });

  it('sem sessão: vai ao login e volta para /device sem o código na URL', async () => {
    server.use(signedOutMeHandler());
    window.history.pushState(null, '', '/device?user_code=ABCD-1234');
    const replace = mockLocationReplace();
    renderApp('/device?user_code=ABCD-1234');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('http://localhost:3002/sign-in?return=%2Fdevice'));
    expect(JSON.stringify(replace.mock.calls)).not.toMatch(/user_code|ABCD/i);
  });

  it('o menu não tem item para /device', async () => {
    renderApp('/device');
    await codeField();
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(nav.querySelector('[aria-current="page"]')).toBeNull();
  });

  it('não tem violações de acessibilidade (formulário e confirmação)', async () => {
    const { container } = renderApp('/device');
    await codeField();
    expect(await axe(container)).toHaveNoViolations();
    await typeAndContinue('ABCD-1234');
    await screen.findByRole('heading', { name: 'Quem pediu' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
