import { NavLink } from 'react-router';
import { useMemoryStatus } from '../api/memory';

/**
 * Navegação entre as seções da área Memória: links simples (cada seção é uma rota), com o atual marcado por
 * `aria-current="page"`. "Administração" só aparece para admin (`isAdmin` de GET /memory/status).
 */
export function MemoryTabs() {
  const status = useMemoryStatus();
  const isAdmin = status.data?.isAdmin === true;
  const items = [
    { to: '/memory/computers', label: 'Computadores conectados' },
    { to: '/memory/projects', label: 'Meus projetos' },
    ...(isAdmin ? [{ to: '/memory/admin', label: 'Administração' }] : []),
  ];
  return (
    <nav className="web-tabs" aria-label="Seções da Memória">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} className="web-tab">
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
