import type { ReactNode } from 'react';

/** Ícones das telas de "liberar com o celular" (traço do mesmo estilo do resto do app; decorativos). */
function Svg({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

type IconProps = { size?: number };

export const FingerprintIcon = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
    <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
    <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
    <path d="M2 12a10 10 0 0 1 18-6" />
    <path d="M2 16h.01" />
    <path d="M21.8 16c.2-2 .131-5.354 0-6" />
    <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
    <path d="M8.65 22c.21-.66.45-1.32.57-2" />
    <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
  </Svg>
);

export const PhoneIcon = ({ size }: IconProps) => (
  <Svg size={size}>
    <rect x="6" y="2" width="12" height="20" rx="3" />
    <path d="M11 18h2" />
  </Svg>
);

export const LockIcon = ({ size }: IconProps) => (
  <Svg size={size}>
    <rect width="18" height="11" x="3" y="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </Svg>
);

export const CheckIcon = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="m5 12 5 5 9-10" />
  </Svg>
);

export const ClockIcon = ({ size }: IconProps) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Svg>
);

export const XCircleIcon = ({ size }: IconProps) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="10" />
    <path d="m15 9-6 6M9 9l6 6" />
  </Svg>
);

export const GlobeIcon = ({ size }: IconProps) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" />
  </Svg>
);

export const CopyIcon = ({ size }: IconProps) => (
  <Svg size={size}>
    <rect x="9" y="9" width="12" height="12" rx="3" />
    <path d="M5 15V6a3 3 0 0 1 3-3h9" />
  </Svg>
);

export const TrashIcon = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="m6 6 1 14h10l1-14" />
  </Svg>
);

export const WarnIcon = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Svg>
);
