import { setupServer } from 'msw/node';

/** Servidor de mock de rede dos testes. Cada teste registra o que precisa com `server.use(...)`. */
export const server = setupServer();

export const API = 'http://localhost:3000';
