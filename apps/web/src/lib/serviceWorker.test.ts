import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { base64UrlToBytes } from './push';

/**
 * `public/sw.js` roda num contexto isolado com um `self` falso: o teste confere o que o worker faz com `push` e
 * `notificationclick`, e que ele NÃO registra `fetch` (nunca intercepta navegação nem cacheia a API).
 */
type Listener = (event: unknown) => void;

function loadWorker(windows: Array<{ url: string; navigate?: (url: string) => Promise<unknown>; focus?: () => Promise<unknown> }> = []) {
  const listeners = new Map<string, Listener>();
  const shown: Array<{ title: string; options: Record<string, unknown> }> = [];
  const opened: string[] = [];
  const self = {
    location: { origin: 'https://meu.ufba.app' },
    registration: {
      showNotification: (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
        return Promise.resolve();
      },
    },
    clients: {
      matchAll: () => Promise.resolve(windows),
      openWindow: (url: string) => {
        opened.push(url);
        return Promise.resolve(null);
      },
    },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  };
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, URL });
  return { listeners, shown, opened };
}

function pushEvent(payload: unknown) {
  const waits: Array<Promise<unknown>> = [];
  return {
    event: {
      data: { json: () => (typeof payload === 'string' ? JSON.parse(payload) : payload) },
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
    },
    done: () => Promise.all(waits),
  };
}

function clickEvent(url: unknown) {
  const waits: Array<Promise<unknown>> = [];
  const closed = { value: false };
  return {
    event: {
      notification: { close: () => (closed.value = true), data: { url } },
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
    },
    closed,
    done: () => Promise.all(waits),
  };
}

describe('public/sw.js', () => {
  it('só escuta push e notificationclick: nada de fetch, então não intercepta navegação nem cacheia', () => {
    const { listeners } = loadWorker();
    expect([...listeners.keys()].sort()).toEqual(['notificationclick', 'push']);
    const source = readFileSync('public/sw.js', 'utf8');
    expect(source).not.toMatch(/addEventListener\(\s*['"]fetch['"]/);
    expect(source).not.toMatch(/\bcaches\b/);
  });

  it('push: mostra título, texto e tag do aviso (a tag substitui o anterior)', async () => {
    const { listeners, shown } = loadWorker();
    const { event, done } = pushEvent({ title: 'Falta paciente', body: 'Sessão das 14h', tag: 'siasb-1', url: '/schedule' });
    listeners.get('push')!(event);
    await done();
    expect(shown).toEqual([{ title: 'Falta paciente', options: { body: 'Sessão das 14h', tag: 'siasb-1', data: { url: '/schedule' } } }]);
  });

  it('push com corpo quebrado ou vazio: mostra um aviso genérico em vez de falhar (o navegador exige mostrar algo)', async () => {
    const { listeners, shown } = loadWorker();
    const broken = pushEvent('{nao e json');
    listeners.get('push')!(broken.event);
    await broken.done();
    expect(shown[0]?.title).toBe('ufba.app');
    expect(shown[0]?.options.data).toEqual({ url: '/' });
  });

  it('o endereço do aviso só pode ser deste site: outra origem e javascript: caem no painel', async () => {
    const { listeners, shown } = loadWorker();
    for (const url of ['https://evil.example/x', 'javascript:alert(1)', 42, '//evil.example/x']) {
      const { event, done } = pushEvent({ title: 't', url });
      listeners.get('push')!(event);
      await done();
    }
    expect(shown.map((item) => (item.options.data as { url: string }).url)).toEqual(['/', '/', '/', '/']);
  });

  it('clique: fecha o aviso e abre o endereço numa janela nova quando não há aba do painel', async () => {
    const { listeners, opened } = loadWorker();
    const { event, closed, done } = clickEvent('/connections');
    listeners.get('notificationclick')!(event);
    await done();
    expect(closed.value).toBe(true);
    expect(opened).toEqual(['https://meu.ufba.app/connections']);
  });

  it('clique com o painel já aberto: leva essa aba ao endereço e a foca, sem abrir outra', async () => {
    const navigate = vi.fn().mockResolvedValue({ focus: vi.fn().mockResolvedValue(undefined) });
    const { listeners, opened } = loadWorker([{ url: 'https://meu.ufba.app/academic', navigate }]);
    const { event, done } = clickEvent('/connections');
    listeners.get('notificationclick')!(event);
    await done();
    expect(navigate).toHaveBeenCalledWith('https://meu.ufba.app/connections');
    expect(opened).toEqual([]);
  });

  it('clique com endereço de outro site: abre o painel, nunca o endereço de fora', async () => {
    const { listeners, opened } = loadWorker();
    const { event, done } = clickEvent('https://evil.example/');
    listeners.get('notificationclick')!(event);
    await done();
    expect(opened).toEqual(['https://meu.ufba.app/']);
  });
});

describe('base64UrlToBytes', () => {
  it('converte a chave VAPID (base64url, sem preenchimento) em bytes', () => {
    expect([...base64UrlToBytes('AQID')]).toEqual([1, 2, 3]);
    expect([...base64UrlToBytes('-_8')]).toEqual([251, 255]);
  });
});
