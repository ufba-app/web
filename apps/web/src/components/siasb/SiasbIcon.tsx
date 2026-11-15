import logo from '../../assets/siasb.png';

/** Marca do SIASB (a do canvas, reduzida). O `web-ui` só tem vetores de SIGAA, Moodle e Classroom. Decorativa. */
export function SiasbIcon({ size = 24 }: { size?: number }) {
  return <img src={logo} width={size} height={size} alt="" aria-hidden="true" draggable={false} />;
}
