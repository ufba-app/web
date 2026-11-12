import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';
import * as matchers from 'vitest-axe/matchers';
import { server } from './server';

expect.extend(matchers);

// Testes que trocam `window.location` (para espiar `assign`) não podem vazar a cópia para o teste seguinte.
const originalLocation = Object.getOwnPropertyDescriptor(window, 'location');

// Requisição sem mock tem que falhar o teste, não passar em silêncio (no MSW 3 a opção é `onUnhandledFrame`).
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  if (originalLocation) Object.defineProperty(window, 'location', originalLocation);
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
  cleanup();
  server.resetHandlers();
  window.sessionStorage.clear();
  window.localStorage.clear();
});
afterAll(() => server.close());
