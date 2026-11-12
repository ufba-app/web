import type { ReactNode } from 'react';
import { Chip } from '../Chip';
import { Notice } from '../Notice';

export type ClientRequestProps = {
  /**
   * Nome do app, como a API o devolve (documento de metadados ou lista de verificados).
   * Sem nome, o título é o domínio. Não é confiável sozinho: o domínio de retorno sempre aparece em destaque.
   */
  name?: string | null;
  /**
   * Logo do app. Quem usa decide a imagem, que deve vir da API (já baixada e validada por ela),
   * nunca de uma URL carregada direto do servidor do cliente. Sem logo, mostra um ícone genérico.
   */
  logo?: ReactNode;
  /** Selo "Verificado": só para domínios da lista própria. Independe de haver nome ou logo. */
  verified?: boolean;
  /** Domínio de retorno do app, exatamente como a API o devolve. */
  returnDomain: string;
};

function GenericAppIcon() {
  return (
    <svg
      className="ufba-request__generic-icon"
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M2 8h20" />
      <path d="M6 4v4" />
      <path d="M10 4v4" />
    </svg>
  );
}

export function ClientRequest({ name, logo, verified = false, returnDomain }: ClientRequestProps) {
  const title = name?.trim() || returnDomain;
  return (
    <div className="ufba-request">
      <div className="ufba-request__who">
        {logo ? (
          <span className="ufba-request__logo">{logo}</span>
        ) : (
          <span className="ufba-request__generic">
            <GenericAppIcon />
          </span>
        )}
        <div className="ufba-request__text">
          <p className="ufba-request__name">
            <span>{title}</span>
            {verified ? <Chip tone="success">Verificado</Chip> : null}
          </p>
          <p className="ufba-request__wants">quer acessar seus dados acadêmicos</p>
        </div>
      </div>
      {verified ? null : (
        <Notice tone="warning">
          <strong>App não verificado.</strong> Só autorize se você reconhece o endereço abaixo.
        </Notice>
      )}
      <p className="ufba-request__return">
        Volta para <strong>{returnDomain}</strong>
      </p>
    </div>
  );
}
