import type { ReactNode } from 'react';
import { Chip } from '../Chip';
import { Notice } from '../Notice';

export type ClientRequestProps = {
  /** Nome que o app declarou no cadastro. Não é confiável sozinho: o domínio de retorno sempre aparece. */
  name: string;
  /** Ícone do app. Só para apps da lista de verificados; nunca o logo que o próprio app enviou. */
  logo?: ReactNode;
  verified?: boolean;
  returnDomain: string;
};

export function ClientRequest({ name, logo, verified = false, returnDomain }: ClientRequestProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="ufba-request">
      <div className="ufba-request__who">
        {logo ? (
          <span className="ufba-request__logo">{logo}</span>
        ) : (
          <span className="ufba-request__initial" aria-hidden="true">{initial}</span>
        )}
        <div className="ufba-request__text">
          <p className="ufba-request__name">
            <span>{name}</span>
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
      <p className={verified ? 'ufba-request__return' : 'ufba-request__return ufba-request__return--strong'}>
        Volta para <strong>{returnDomain}</strong>
      </p>
    </div>
  );
}
