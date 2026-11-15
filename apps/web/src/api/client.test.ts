import { http, HttpResponse } from 'msw';
import { z } from 'zod/mini';
import { API, server } from '../test/server';
import { ApiError, request, setSessionExpiredHandler } from './client';

afterEach(() => setSessionExpiredHandler(null));

describe('request', () => {
  it('envia o cookie de sessão e valida a resposta com o schema', async () => {
    // O MSW normaliza `request.credentials` no Node; por isso a verificação é no que o código passa ao fetch.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    server.use(http.get(`${API}/thing`, () => HttpResponse.json({ n: 1 })));
    const data = await request('/thing', { schema: z.object({ n: z.number() }) });
    expect(data).toEqual({ n: 1 });
    expect(fetchSpy).toHaveBeenCalledWith(`${API}/thing`, expect.objectContaining({ credentials: 'include' }));
    fetchSpy.mockRestore();
  });

  it('em rotas que mudam estado manda X-UFBA e JSON; em DELETE sem corpo não manda Content-Type', async () => {
    const seen: Record<string, string | null> = {};
    server.use(
      http.post(`${API}/a`, ({ request: req }) => {
        seen.postUfba = req.headers.get('x-ufba');
        seen.postType = req.headers.get('content-type');
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(`${API}/a`, ({ request: req }) => {
        seen.delUfba = req.headers.get('x-ufba');
        seen.delType = req.headers.get('content-type');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await request('/a', { method: 'POST', body: { x: 1 } });
    await request('/a', { method: 'DELETE' });
    expect(seen).toEqual({ postUfba: '1', postType: 'application/json', delUfba: '1', delType: null });
  });

  it('GET não manda X-UFBA', async () => {
    let header: string | null = 'x';
    server.use(
      http.get(`${API}/g`, ({ request: req }) => {
        header = req.headers.get('x-ufba');
        return HttpResponse.json({});
      }),
    );
    await request('/g');
    expect(header).toBeNull();
  });

  it('GET com csrf: true manda X-UFBA (a API exige no GET /connections/sigaa/key)', async () => {
    let header: string | null = null;
    server.use(
      http.get(`${API}/g`, ({ request: req }) => {
        header = req.headers.get('x-ufba');
        return HttpResponse.json({});
      }),
    );
    await request('/g', { csrf: true });
    expect(header).toBe('1');
  });

  it('fetchSigaaKey chama GET /connections/sigaa/key com X-UFBA: 1', async () => {
    let header: string | null = null;
    server.use(
      http.get(`${API}/connections/sigaa/key`, ({ request: req }) => {
        header = req.headers.get('x-ufba');
        return HttpResponse.json({ dk: 'a'.repeat(43) });
      }),
    );
    const { fetchSigaaKey } = await import('./passkey');
    await expect(fetchSigaaKey()).resolves.toHaveLength(43);
    expect(header).toBe('1');
  });

  it('204 devolve undefined', async () => {
    server.use(http.delete(`${API}/s`, () => new HttpResponse(null, { status: 204 })));
    await expect(request('/s', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('erro no formato da API vira ApiError com código e mensagem', async () => {
    server.use(
      http.get(`${API}/e`, () => HttpResponse.json({ error: 'request_expired', message: 'Pedido expirado.' }, { status: 410 })),
    );
    await expect(request('/e')).rejects.toMatchObject({ status: 410, code: 'request_expired', message: 'Pedido expirado.' });
  });

  it('erro fora do formato vira internal_error com mensagem genérica', async () => {
    server.use(http.get(`${API}/e`, () => new HttpResponse('<html>boom</html>', { status: 500 })));
    const error = await request('/e').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 500, code: 'internal_error' });
  });

  it('falha de rede vira network_error', async () => {
    server.use(http.get(`${API}/n`, () => HttpResponse.error()));
    await expect(request('/n')).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });

  it('resposta fora do schema vira invalid_response, nunca dado quebrado', async () => {
    server.use(http.get(`${API}/b`, () => HttpResponse.json({ n: 'texto' })));
    await expect(request('/b', { schema: z.object({ n: z.number() }) })).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('401 session_expired chama o tratador uma vez', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    server.use(
      http.get(`${API}/x`, () => HttpResponse.json({ error: 'session_expired', message: 'Entre de novo.' }, { status: 401 })),
    );
    await expect(request('/x')).rejects.toMatchObject({ code: 'session_expired' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('401 session_expired não chama o tratador quando handleSessionExpired é false', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    server.use(
      http.get(`${API}/x`, () => HttpResponse.json({ error: 'session_expired', message: 'Entre de novo.' }, { status: 401 })),
    );
    await expect(request('/x', { handleSessionExpired: false })).rejects.toMatchObject({ code: 'session_expired' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('só 401 com session_expired chama o tratador: 401 com outro código ou outro status com esse código, não', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    server.use(
      http.get(`${API}/a`, () => HttpResponse.json({ error: 'invalid_request', message: 'x' }, { status: 401 })),
      http.get(`${API}/b`, () => HttpResponse.json({ error: 'session_expired', message: 'x' }, { status: 403 })),
    );
    await expect(request('/a')).rejects.toMatchObject({ status: 401, code: 'invalid_request' });
    await expect(request('/b')).rejects.toMatchObject({ status: 403, code: 'session_expired' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('manda Accept: application/json e o erro se chama ApiError', async () => {
    let accept: string | null = null;
    server.use(
      http.get(`${API}/h`, ({ request: req }) => {
        accept = req.headers.get('accept');
        return HttpResponse.json({ error: 'not_found', message: 'x' }, { status: 404 });
      }),
    );
    const error = await request('/h').catch((e: unknown) => e);
    expect(accept).toBe('application/json');
    expect(error).toMatchObject({ name: 'ApiError' });
  });

  it('requisição cancelada continua sendo cancelamento, não vira erro de rede', async () => {
    server.use(
      http.get(`${API}/slow`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return HttpResponse.json({});
      }),
    );
    const controller = new AbortController();
    const pending = request('/slow', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('outros erros 401 e outros status não chamam o tratador', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    server.use(http.get(`${API}/x`, () => HttpResponse.json({ error: 'csrf_rejected', message: 'x' }, { status: 403 })));
    await expect(request('/x')).rejects.toMatchObject({ code: 'csrf_rejected' });
    expect(handler).not.toHaveBeenCalled();
  });
});
