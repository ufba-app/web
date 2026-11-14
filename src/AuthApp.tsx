import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AuthNotFoundPage, AuthorizeErrorPage, AuthorizePage, ToastHost } from './auth/lazy';
import { AuthorizePageSkeleton } from './components/Skeletons';
import { SignInCallbackPage } from './routes/SignInCallbackPage';
import { SignInPage } from './routes/SignInPage';

/** App de autenticação (auth.ufba.app): login, retorno do login, autorização de apps de terceiros e erros. */
export function AuthApp() {
  return (
    <>
      {/* Avisos de evento (falhou ao autorizar, ao trocar de conta) aparecem como toast; ver src/lib/notify.ts. */}
      <Suspense fallback={null}>
        <ToastHost />
      </Suspense>
      {/* Fora do /authorize o fallback é vazio: o fundo da página (boot.css) já está na tela. */}
      <Suspense fallback={null}>
        <Routes>
        <Route path="/" element={<Navigate to="/sign-in" replace />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-in/callback" element={<SignInCallbackPage />} />
        <Route
          path="/authorize"
          element={
            <Suspense fallback={<AuthorizePageSkeleton />}>
              <AuthorizePage />
            </Suspense>
          }
        />
        <Route path="/authorize/error" element={<AuthorizeErrorPage />} />
        <Route path="*" element={<AuthNotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  );
}
