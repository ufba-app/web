import { AuthLayout, Skeleton } from '@ufba-app/web-ui';

/** Texto só para leitor de tela: o skeleton em si é decorativo. */
function Announce() {
  return (
    <span className="ufba-visually-hidden" role="status">
      Carregando…
    </span>
  );
}

function Bone({ shape }: { shape: 'title' | 'line' | 'line-short' | 'avatar' | 'card' | 'button' | 'badge' }) {
  return <Skeleton className={`web-sk web-sk--${shape}`} />;
}

/** Cabeçalho de página (título e descrição) no tamanho do `PageHeader`. */
function HeaderSkeleton() {
  return (
    <div className="web-sk-header" aria-hidden="true">
      <Bone shape="title" />
      <Bone shape="line" />
    </div>
  );
}

/** Conteúdo de uma página do painel enquanto `/me` não chegou: cabeçalho e três cartões. */
export function PageSkeleton() {
  return (
    <div className="web-sk-page" aria-busy="true">
      <Announce />
      <HeaderSkeleton />
      <div className="web-sk-cards" aria-hidden="true">
        <Bone shape="card" />
        <Bone shape="card" />
        <Bone shape="card" />
      </div>
    </div>
  );
}

/** Crachá do usuário (avatar e duas linhas) na sidebar e na barra do topo. */
export function BadgeSkeleton() {
  return (
    <div className="web-sk-badge web-sk-onwhite" aria-hidden="true">
      <Bone shape="avatar" />
      <div className="web-sk-badge__text">
        <Bone shape="line" />
        <Bone shape="line-short" />
      </div>
    </div>
  );
}

/** Linhas de apps autorizados, no formato do `AppRow`. */
export function AppRowsSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="web-list" aria-busy="true">
      <Announce />
      {Array.from({ length: rows }, (_, index) => (
        <div className="web-sk-row" key={index} aria-hidden="true">
          <Bone shape="avatar" />
          <div className="web-sk-row__text">
            <Bone shape="line" />
            <Bone shape="line-short" />
          </div>
          <Bone shape="button" />
        </div>
      ))}
    </div>
  );
}

/** A página Autorizar inteira, com os textos fixos já na tela e só o pedido (quem pede, o que lê) em skeleton. */
export function AuthorizePageSkeleton() {
  return (
    <AuthLayout headline="Você decide quem lê seus dados." subline="Só leitura. Dá para revogar quando quiser.">
      <AuthorizeRequestSkeleton />
    </AuthLayout>
  );
}

/** Pedido de acesso: quem pede, o que lê e os dois botões. Os textos fixos da página já ficam na tela. */
export function AuthorizeRequestSkeleton() {
  return (
    <div className="web-sk-request web-sk-onwhite" aria-busy="true">
      <Announce />
      <div className="web-sk-row" aria-hidden="true">
        <Bone shape="avatar" />
        <div className="web-sk-row__text">
          <Bone shape="line" />
          <Bone shape="line-short" />
        </div>
      </div>
      <div className="web-sk-cards" aria-hidden="true">
        <Bone shape="card" />
        <Bone shape="card" />
      </div>
      <div className="web-sk-actions" aria-hidden="true">
        <Bone shape="button" />
        <Bone shape="button" />
      </div>
    </div>
  );
}
