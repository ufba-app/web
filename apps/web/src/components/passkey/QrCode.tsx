import './passkey.css';
import { useMemo } from 'react';
import { encodeQr, qrPath } from '../../lib/passkey/qr';

/**
 * O QR em SVG (um único `<path>`), preto sobre o branco do contêiner (a margem de silêncio vem do `padding` dele).
 * Sem canvas, sem imagem e sem `style=`: a CSP não deixa nada disso.
 */
export function QrCode({ text, label, faded = false }: { text: string; label: string; faded?: boolean }) {
  const { d, size } = useMemo(() => qrPath(encodeQr(text)), [text]);
  return (
    <svg
      className={faded ? 'web-pk-qr__svg web-pk-qr__svg--faded' : 'web-pk-qr__svg'}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <path d={d} fill="#000" />
    </svg>
  );
}
