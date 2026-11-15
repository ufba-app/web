import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const API = 'http://localhost:3000';

/**
 * Servidor de mock de rede dos testes. Cada teste registra o que precisa com `server.use(...)`.
 * Padrão (volta a valer a cada `resetHandlers`): nenhuma fonte com permissões. Conexões sempre pede essa lista; com ela
 * vazia a seção "Permissões" some, e os testes que não tratam disso ficam como antes.
 */
export const server = setupServer(http.get(`${API}/me/permissions`, () => HttpResponse.json({ items: [] })));
