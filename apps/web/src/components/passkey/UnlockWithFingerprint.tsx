import { Button } from '@ufba-app/web-ui';
import { useState } from 'react';
import { unlockWithPasskey, type UnlockResult } from '../../lib/passkey/flows';
import { notify } from '../../lib/notify';
import { FingerprintIcon } from './icons';

const FALLBACK_TEXT: Record<Extract<UnlockResult, { ok: false }>['reason'], string | null> = {
  cancelled: null,
  no_passkey: 'Este celular não tem a senha guardada. Digite a senha do SIGAA.',
  unsupported: 'Não deu para usar a digital neste celular. Digite a senha do SIGAA.',
  rejected: 'A chave não abriu a senha guardada. Digite a senha do SIGAA.',
  failed: 'Não deu para desbloquear agora. Tente de novo ou digite a senha do SIGAA.',
};

/**
 * No celular, com o SIGAA trancado: um botão só, "Desbloquear com a digital" (sem QR). A DK sai da passkey deste
 * aparelho e vai ao `unlock`; a senha não passa pelo navegador. Qualquer falha cai em "digite a senha do SIGAA".
 */
export function UnlockWithFingerprint({
  userId,
  onUnlocked,
  onUsePassword,
}: {
  userId: string;
  onUnlocked: () => void;
  onUsePassword: () => void;
}) {
  const [pending, setPending] = useState(false);

  const unlock = async () => {
    setPending(true);
    const result = await unlockWithPasskey({ userId });
    setPending(false);
    if (result.ok) {
      notify.success('SIGAA liberado.');
      onUnlocked();
      return;
    }
    const text = FALLBACK_TEXT[result.reason];
    if (!text) {
      notify.info('A digital foi cancelada. Dá para tentar de novo ou digitar a senha.');
      return;
    }
    notify.error(text);
    // Falha de rede não é motivo para trocar de caminho; as outras levam direto ao formulário da senha.
    if (result.reason !== 'failed') onUsePassword();
  };

  return (
    <div className="web-pk-actions">
      <Button isPending={pending} onPress={() => void unlock()}>
        <FingerprintIcon size={20} />
        Desbloquear com a digital
      </Button>
      <div className="web-pk-or">
        ou
        <Button variant="outline" size="sm" isDisabled={pending} onPress={onUsePassword}>
          digite a senha do SIGAA
        </Button>
      </div>
    </div>
  );
}
