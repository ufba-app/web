/*
 * Service worker do painel: SÓ para avisos (Web Push). De propósito:
 *  - NÃO há handler de `fetch`: ele nunca intercepta navegação nem requisição nenhuma, e não existe cache. A API
 *    (com cookie de sessão) e as páginas passam direto pelo navegador, como se o worker não existisse.
 *  - Só dois eventos: `push` (mostra o aviso) e `notificationclick` (abre o endereço do aviso).
 * O conteúdo do aviso é de quem o envia (título, texto, tag, url). Não leva dado de paciente.
 */

/** O aviso só pode abrir um caminho DESTE site. Qualquer outra coisa (outra origem, javascript:) cai no painel. */
function safeTarget(raw) {
  try {
    const url = new URL(typeof raw === 'string' ? raw : '/', self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search + url.hash : '/';
  } catch {
    return '/';
  }
}

function readPayload(event) {
  try {
    const data = event.data ? event.data.json() : null;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

self.addEventListener('push', (event) => {
  const data = readPayload(event);
  const title = typeof data.title === 'string' && data.title ? data.title : 'ufba.app';
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    // A `tag` substitui o aviso anterior igual no aparelho em vez de empilhar.
    tag: typeof data.tag === 'string' ? data.tag : undefined,
    data: { url: safeTarget(data.url) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(safeTarget(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      // Já há uma aba do painel: leva ela para o endereço do aviso. Senão, abre uma.
      if (open && 'navigate' in open) return open.navigate(target).then((client) => (client || open).focus());
      return self.clients.openWindow(target);
    }),
  );
});
