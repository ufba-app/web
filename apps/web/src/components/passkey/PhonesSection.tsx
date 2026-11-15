import { useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, formatDay, formatUsage, Notice } from '@ufba-app/web-ui';
import { useState } from 'react';
import { meQueryKey } from '../../api/me';
import { ApiError } from '../../api/client';
import { deletePasskey, passkeysQueryKey, usePasskeys } from '../../api/passkey';
import type { Me } from '../../contract';
import { notify } from '../../lib/notify';
import { AppRowsSkeleton } from '../Skeletons';
import { ActivatePasskey } from './ActivatePasskey';
import { FingerprintIcon, PhoneIcon, TrashIcon, WarnIcon } from './icons';
import { PkIcon } from './PkIcon';

/** Limite da API (409 `passkey_limit_reached`): 5 celulares por pessoa. */
export const MAX_PHONES = 5;

const lastUnlock = (last: string | null, now: Date) =>
  last ? formatUsage(new Date(last), now).replace(/^usado/, 'último desbloqueio') : 'último desbloqueio nunca';

/**
 * "Celulares ativados": a lista das passkeys (nome, quando foi ativada e o último desbloqueio) com "Remover" (com
 * confirmação) e "Ativar mais um celular". Fica em "Apps autorizados". Só metadados passam aqui: nenhum segredo.
 */
export function PhonesSection({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const { data, error, isPending, refetch } = usePasskeys();
  const [toRemove, setToRemove] = useState<{ credentialId: string; label: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  const phones = data?.passkeys ?? [];
  const atLimit = phones.length >= MAX_PHONES;
  const sigaaOpen = me.connections.sigaa.status === 'connected';
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: passkeysQueryKey }), queryClient.invalidateQueries({ queryKey: meQueryKey })]);

  const remove = async () => {
    if (!toRemove) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await deletePasskey(toRemove.credentialId);
      await refresh();
      notify.success('Celular removido.');
      setToRemove(null);
    } catch (cause) {
      setRemoveError(cause instanceof ApiError ? cause.message : 'Não deu para remover agora. Tente de novo.');
    } finally {
      setRemoving(false);
    }
  };

  const now = new Date();

  return (
    <section className="web-pk-section" aria-labelledby="web-pk-phones-title">
      <div className="web-pk-section__head">
        <h2 id="web-pk-phones-title">Celulares ativados</h2>
        <Button variant="outline" size="sm" isDisabled={atLimit || !sigaaOpen || activating} onPress={() => setActivating(true)}>
          Ativar mais um celular
        </Button>
      </div>

      {isPending ? <AppRowsSkeleton rows={2} /> : null}

      {error ? (
        <Notice tone="danger">
          {error instanceof ApiError ? error.message : 'Não deu para carregar os celulares agora.'}{' '}
          <button type="button" className="web-link" onClick={() => void refetch()}>
            Tentar de novo
          </button>
        </Notice>
      ) : null}

      {data && atLimit ? (
        <Notice tone="warning" icon={<WarnIcon size={20} />}>
          <strong>Você chegou ao limite de {MAX_PHONES} celulares.</strong> Remova um para ativar outro.
        </Notice>
      ) : null}

      {data && !sigaaOpen && !atLimit ? (
        <p className="web-muted">
          {me.connections.sigaa.status === 'locked' ? 'Libere o SIGAA em Conexões' : 'Conecte o SIGAA em Conexões'} para ativar um celular.
        </p>
      ) : null}

      {activating ? (
        <ActivatePasskey
          me={me}
          heading="Ativar este aparelho para liberar outros"
          onDismiss={() => setActivating(false)}
          onDone={() => {
            setActivating(false);
            void refresh();
          }}
        />
      ) : null}

      {data && phones.length === 0 && !activating ? (
        <div className="web-pk-card web-pk-empty">
          <PkIcon tone="soft" size="md">
            <FingerprintIcon />
          </PkIcon>
          <h3>Nenhum celular ativado</h3>
          <p>Ative um celular e libere o SIGAA em outros aparelhos só com a digital, sem digitar a senha.</p>
          <p>Abra o ufba.app no celular, conecte o SIGAA e toque em Ativar.</p>
        </div>
      ) : null}

      {phones.length > 0 ? (
        <ul className="web-pk-rows">
          {phones.map((phone) => {
            const label = phone.label?.trim() || 'Celular';
            return (
              <li key={phone.credentialId} className="web-pk-row web-pk-phone">
                <PkIcon tone="soft" size="sm">
                  <PhoneIcon />
                </PkIcon>
                <div>
                  <b>{label}</b>
                  <small>
                    Ativado em {formatDay(new Date(phone.createdAt))} · {lastUnlock(phone.lastUnlockedAt, now)}
                  </small>
                </div>
                <Button variant="danger-text" size="sm" aria-label={`Remover ${label}`} onPress={() => { setRemoveError(null); setToRemove({ credentialId: phone.credentialId, label }); }}>
                  <TrashIcon size={16} />
                  Remover
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <Dialog
        isOpen={toRemove !== null}
        onOpenChange={(open) => {
          if (!open && !removing) setToRemove(null);
        }}
        icon={<TrashIcon size={22} />}
        title={`Remover ${toRemove?.label ?? 'o celular'}?`}
        actions={
          <>
            <Button variant="danger" isPending={removing} onPress={() => void remove()}>
              Remover
            </Button>
            <Button variant="outline" isDisabled={removing} onPress={() => setToRemove(null)}>
              Cancelar
            </Button>
          </>
        }
      >
        <div className="web-fields">
          {removeError ? <Notice tone="danger">{removeError}</Notice> : null}
          <p className="web-muted">Esse celular deixa de liberar o SIGAA em outros aparelhos. Dá para ativar de novo quando quiser.</p>
        </div>
      </Dialog>
    </section>
  );
}
