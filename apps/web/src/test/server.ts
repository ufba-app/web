import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const API = 'http://localhost:3000';

/**
 * Servidor de mock de rede dos testes. Cada teste registra o que precisa com `server.use(...)`.
 * Padrão (volta a valer a cada `resetHandlers`): nenhuma fonte com permissões. Conexões sempre pede essa lista; com ela
 * vazia a seção "Permissões" some, e os testes que não tratam disso ficam como antes.
 */
export const server = setupServer(
  http.get(`${API}/me/permissions`, () => HttpResponse.json({ items: [] })),
  // Conexões também consulta a vida acadêmica quando o SIASB ainda não é oferecido (convite). Padrão: tudo confirmado
  // (`READY`), que não mostra convite nenhum.
  http.get(`${API}/me/academic`, () =>
    HttpResponse.json({
      available: true,
      consent: true,
      status: 'READY',
      failure: null,
      verified: true,
      reader: 'ai',
      importedAt: '2026-11-12T17:32:00.000Z',
      curriculumStatus: 'NONE',
      registration: null,
      summary: null,
      draft: null,
    }),
  ),
);
