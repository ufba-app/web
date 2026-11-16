import { ServiceIcon } from '@ufba-app/web-ui';
import { SiasbIcon } from '../siasb/SiasbIcon';
import type { EventSource } from './model';

/** O `web-ui` só tem os vetores de SIGAA, Moodle e Classroom; o SIASB tem a marca do canvas, só no web. Decorativo. */
export function SourceIcon({ source, size }: { source: EventSource; size: number }) {
  return source === 'siasb' ? <SiasbIcon size={size} /> : <ServiceIcon service={source} size={size} />;
}
