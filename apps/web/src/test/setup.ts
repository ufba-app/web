import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';
import * as matchers from 'vitest-axe/matchers';
import { notify } from '../lib/notify';
import { server } from './server';

expect.extend(matchers);

// Toasts: o provider real não roda no jsdom (React duplicado via react-stately/toast, ver ToastHost). Os testes
// verificam o que o app pede para avisar (`notify`); o toast renderizado é testado no navegador (e2e).
vi.mock('../components/ToastHost', () => ({ ToastHost: () => null }));
vi.mock('../lib/notify', () => ({ notify: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));

// Testes que trocam `window.location` (para espiar `assign`) não podem vazar a cópia para o teste seguinte.
const originalLocation = Object.getOwnPropertyDescriptor(window, 'location');

// Requisição sem mock tem que falhar o teste, não passar em silêncio (no MSW 3 a opção é `onUnhandledFrame`).
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  if (originalLocation) Object.defineProperty(window, 'location', originalLocation);
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
  cleanup();
  vi.mocked(notify.success).mockClear();
  vi.mocked(notify.info).mockClear();
  vi.mocked(notify.error).mockClear();
  server.resetHandlers();
  window.sessionStorage.clear();
  window.localStorage.clear();
});
afterAll(() => server.close());
