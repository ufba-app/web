import { Avatar } from '@heroui/react';

/** Iniciais do primeiro e do último nome: "Marina Costa" → "MC", "Marina" → "M", "" → "?". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? '') : '';
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

export type UserBadgeProps = { name: string; detail?: string; src?: string };

export function UserBadge({ name, detail, src }: UserBadgeProps) {
  return (
    <div className="ufba-user">
      <Avatar size="sm" aria-hidden="true">
        {src ? <Avatar.Image src={src} alt="" /> : null}
        <Avatar.Fallback>{initials(name)}</Avatar.Fallback>
      </Avatar>
      <div className="ufba-user__text">
        <span className="ufba-user__name">{name}</span>
        {detail ? <span className="ufba-user__detail">{detail}</span> : null}
      </div>
    </div>
  );
}
