import { useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes } from 'react-router';
import { setSessionExpiredHandler } from './api/client';
import { AppLayout } from './components/AppLayout';
import { authUrl } from './lib/origins';
import { loginReturnPath } from './lib/safe';
import {
  AcademicPage,
  AuthorizedAppsPage,
  ComingSoonPage,
  ConnectionsPage,
  DevicePage,
  ErrorPage,
  MemoryAdminPage,
  MemoryComputersPage,
  MemoryProjectPage,
  MemoryProjectsPage,
  MoodleCapturePage,
  NotFoundPage,
  PairPage,
} from './routes/lazy';

// O código do toast (React Aria) pesa ~11 kB e só é preciso depois de uma ação: fica fora da primeira carga.
// Um aviso disparado antes de o chunk chegar espera na fila global e aparece quando o provider monta.
const ToastHost = lazy(() => import('./components/ToastHost').then((m) => ({ default: m.ToastHost })));

/** Um único tratador de `401 session_expired`: limpa o cache e manda para o login (app de auth), voltando depois. */
function SessionExpiredBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    setSessionExpiredHandler(() => {
      const { pathname, search } = window.location;
      queryClient.clear();
      const returnTo = loginReturnPath(pathname, search);
      window.location.replace(authUrl(`/sign-in?return=${encodeURIComponent(returnTo)}`));
    });
    return () => setSessionExpiredHandler(null);
  }, [queryClient]);

  return null;
}

export function App() {
  return (
    <>
      <SessionExpiredBridge />
      {/* Avisos de evento (conectou, falhou…) aparecem como toast; ver src/lib/notify.ts. */}
      <Suspense fallback={null}>
        <ToastHost />
      </Suspense>
      {/* Login e autorização vivem no app de auth (auth.ufba.app). Aqui só o painel. Páginas carregam sob demanda;
          fora do painel o fallback é vazio: o fundo da página já está na tela. */}
      <Suspense fallback={null}>
      <Routes>
        <Route path="/error" element={<ErrorPage />} />
        {/* A página que o celular abre pelo QR: tela cheia, fora do menu (e fora de panelPaths e da regra @panel do Caddyfile: o servidor não pode redirecionar quem chega sem login, senão a chave do QR, que só vive no fragmento da URL, se perde). */}
        <Route path="/pair" element={<PairPage />} />
        <Route element={<AppLayout />}>
          <Route index element={<ComingSoonPage title="Painel" />} />
          <Route path="schedule" element={<ComingSoonPage title="Horário" />} />
          <Route path="deadlines" element={<ComingSoonPage title="Prazos" />} />
          <Route path="grades" element={<ComingSoonPage title="Notas e faltas" />} />
          <Route path="academic/*" element={<AcademicPage />} />
          <Route path="connections" element={<ConnectionsPage />} />
          <Route path="connections/moodle/capture" element={<MoodleCapturePage />} />
          <Route path="authorized-apps" element={<AuthorizedAppsPage />} />
          <Route path="device" element={<DevicePage />} />
          <Route path="memory/computers" element={<MemoryComputersPage />} />
          <Route path="memory/projects" element={<MemoryProjectsPage />} />
          <Route path="memory/projects/:id" element={<MemoryProjectPage />} />
          <Route path="memory/admin" element={<MemoryAdminPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
    </>
  );
}
