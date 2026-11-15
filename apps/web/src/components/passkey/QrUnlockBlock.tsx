import { Button } from '@ufba-app/web-ui';
import { ClockIcon, FingerprintIcon, WarnIcon, XCircleIcon } from './icons';
import { PkIcon } from './PkIcon';
import { QrCode } from './QrCode';
import { usePairing } from './usePairing';

/** 4:52, o relógio de 5 minutos. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * "Liberar o SIGAA com o celular": o QR do pedido (vale 5 min) e, sempre por baixo, "ou digite a senha do SIGAA".
 * No computador com o SIGAA trancado, na página de Conexões e na tela de autorizar (versão `compact`).
 * Se o celular libera, `onUnlocked` roda uma vez (quem chama atualiza o `/me`).
 */
export function QrUnlockBlock({
  compact = false,
  client,
  onUnlocked,
  onUsePassword,
}: {
  compact?: boolean;
  /** Quem pediu o acesso (ex.: "Claude"), para o celular mostrar o que está liberando. */
  client?: string;
  onUnlocked: () => void;
  onUsePassword: () => void;
}) {
  const pairing = usePairing({ enabled: true, client, onUnlocked });
  const rootClass = compact ? 'web-pk-qrblock web-pk-qrblock--compact' : 'web-pk-qrblock';
  const boxClass = compact ? 'web-pk-qr web-pk-qr--compact' : 'web-pk-qr';

  return (
    <section className={rootClass} aria-label="Liberar o SIGAA com o celular">
      {pairing.status === 'creating' ? (
        <div className={boxClass} aria-busy="true">
          <div className="web-pk-qr__img web-sk web-sk--card skeleton skeleton--shimmer web-sk-onwhite" />
          <div className="web-pk-qr__text">
            <h3>Liberar o SIGAA com o celular</h3>
            <p>Gerando o código…</p>
          </div>
        </div>
      ) : null}

      {pairing.status === 'waiting' && pairing.url ? (
        <div className={boxClass}>
          <div className="web-pk-qr__img">
            <QrCode text={pairing.url} label="QR para liberar o SIGAA com o celular" />
          </div>
          <div className="web-pk-qr__text">
            <h3>Liberar o SIGAA com o celular</h3>
            <p>Abra a câmera do celular e leia o código. Use o celular que você ativou.</p>
            <span className="web-pk-clock">
              <ClockIcon />
              <span>Vale por {formatClock(pairing.secondsLeft)}</span>
            </span>
            <div className="web-pk-progress" aria-hidden="true">
              <span className="web-pk-progress__bar" style={{ width: `${Math.round(pairing.fraction * 100)}%` }} />
            </div>
            <span className="web-pk-wait" role="status">
              <span className="web-spinner" aria-hidden="true" />
              Esperando o celular…
            </span>
          </div>
        </div>
      ) : null}

      {pairing.status === 'answered' || pairing.status === 'unlocked' ? (
        <div className={boxClass}>
          <PkIcon tone="primary" size="lg" ring>
            <FingerprintIcon />
          </PkIcon>
          <div className="web-pk-qr__text">
            <h3>Liberando…</h3>
            <p>O celular respondeu. Só mais um instante.</p>
            <span className="web-pk-wait" role="status">
              <span className="web-spinner" aria-hidden="true" />
              Liberando o SIGAA…
            </span>
          </div>
        </div>
      ) : null}

      {pairing.status === 'expired' ? (
        <div className={boxClass}>
          <PkIcon tone="err" size="lg">
            <XCircleIcon />
          </PkIcon>
          <div className="web-pk-qr__text">
            <h3>O QR venceu</h3>
            <p>Cada código vale 5 minutos. Gere outro para continuar.</p>
            <Button size="sm" onPress={pairing.regenerate}>
              Gerar novo QR
            </Button>
          </div>
        </div>
      ) : null}

      {pairing.status === 'error' ? (
        <div className={boxClass} role="alert">
          <PkIcon tone="err" size="lg">
            <WarnIcon />
          </PkIcon>
          <div className="web-pk-qr__text">
            <h3>Não deu para liberar</h3>
            <p>{pairing.message ?? 'Algo falhou no caminho. Tente de novo ou digite a senha.'}</p>
            <Button size="sm" onPress={pairing.regenerate}>
              Gerar novo QR
            </Button>
          </div>
        </div>
      ) : null}

      <div className="web-pk-or">
        ou
        <Button variant="outline" size="sm" onPress={onUsePassword}>
          digite a senha do SIGAA
        </Button>
      </div>
    </section>
  );
}
