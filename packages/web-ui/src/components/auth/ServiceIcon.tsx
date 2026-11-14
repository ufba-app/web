import type { SVGProps } from 'react';
import { ClassroomMark } from '../../assets/ClassroomMark';
import { MoodleMark } from '../../assets/MoodleMark';
import { SigaaMark } from '../../assets/SigaaMark';

export type Service = 'sigaa' | 'moodle' | 'classroom' | 'google';

function GoogleMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.4V7H2.1a11 11 0 0 0 0 10z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}

const marks = { sigaa: SigaaMark, moodle: MoodleMark, classroom: ClassroomMark, google: GoogleMark };

export const serviceName: Record<Service, string> = {
  sigaa: 'SIGAA',
  moodle: 'Moodle',
  classroom: 'Classroom',
  google: 'Google',
};

export type ServiceIconProps = {
  service: Service;
  size?: number;
  /** Nome acessível. Sem ele o ícone é decorativo (o nome do serviço deve estar escrito ao lado). */
  label?: string;
};

export function ServiceIcon({ service, size = 24, label }: ServiceIconProps) {
  const Mark = marks[service];
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const };
  return <Mark width={size} height={size} focusable="false" {...a11y} />;
}
