import { useQueryClient } from '@tanstack/react-query';
import {
  AppShell,
  Button,
  initials,
  LaunchButton,
  MobileNav,
  MobileNavGroup,
  MobileNavLink,
  MobileNavProfile,
  ServiceIcon,
  SideNav,
  SideNavGroup,
  SideNavItem,
  UserBadge,
} from '@ufba-app/web-ui';
import { Suspense, useEffect, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useOutletContext } from 'react-router';
import { ApiError } from '../api/client';
import { useAcademic } from '../api/academic';
import { useMe } from '../api/me';
import { deleteSession } from '../api/session';
import type { Me } from '../contract';
import { notify } from '../lib/notify';
import { openSigaaLoggedIn } from '../lib/openSigaa';
import { authUrl } from '../lib/origins';
import { loginReturnPath } from '../lib/safe';
import { preloadRoute } from '../routes/lazy';
import { ErrorScreen } from './ErrorScreen';
import { BadgeSkeleton, PageSkeleton } from './Skeletons';
import {
  CalendarIcon,
  CheckCircleIcon,
  ComputerIcon,
  DashboardIcon,
  FlagIcon,
  GraduationIcon,
  KeyIcon,
  LinkIcon,
} from './icons';

export type SessionContext = { me: Me };

/** A pessoa logada, para as páginas dentro do painel (o layout só renderiza depois de ter `me`). */
export function useSession(): Me {
  return useOutletContext<SessionContext>().me;
}

/** O `SideNavItem` do design system passa `href`; o roteador quer `to`. */
function RouterLink({ href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  // Baixa a página ao passar o mouse ou focar, antes do clique: a navegação já encontra o código pronto.
  return <Link to={href} onMouseEnter={() => preloadRoute(href)} onFocus={() => preloadRoute(href)} {...rest} />;
}

/** `match`: prefixo que também marca o item como atual (a área Memória tem várias rotas). */
type NavEntry = { href: string; label: string; icon: ReactNode; match?: string };

const MAIN: NavEntry[] = [
  { href: '/', label: 'Painel', icon: <DashboardIcon /> },
  { href: '/schedule', label: 'Horário', icon: <CalendarIcon /> },
  { href: '/deadlines', label: 'Prazos', icon: <FlagIcon /> },
  { href: '/grades', label: 'Notas e faltas', icon: <CheckCircleIcon /> },
  { href: '/academic', label: 'Vida acadêmica', icon: <GraduationIcon /> },
];

const ACCOUNT: NavEntry[] = [
  { href: '/connections', label: 'Conexões', icon: <LinkIcon /> },
  { href: '/authorized-apps', label: 'Apps autorizados', icon: <KeyIcon /> },
  { href: '/memory/computers', label: 'Memória', icon: <ComputerIcon />, match: '/memory' },
];

/** Atalhos da barra de baixo no celular. O Curso leva à vida acadêmica; o resto fica na folha. */
const MOBILE_BAR: NavEntry[] = [
  { href: '/', label: 'Painel', icon: <DashboardIcon /> },
  { href: '/academic', label: 'Curso', icon: <GraduationIcon /> },
  { href: '/memory/computers', label: 'Memória', icon: <ComputerIcon />, match: '/memory' },
  { href: '/connections', label: 'Conexões', icon: <LinkIcon /> },
];

function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Painel autenticado. Sem sessão, manda para o login no app de auth (auth.ufba.app), que traz a pessoa de volta
 * a este caminho; com sessão, monta menu e conteúdo.
 */
export function AppLayout() {
  const { data: me, error, isPending, refetch } = useMe();
  // O curso do perfil no menu do celular vem da importação do SIGAA; sem ela, o perfil mostra só o e-mail.
  const { data: academic } = useAcademic(me?.connections.sigaa.status === 'connected');
  const location = useLocation();
  const queryClient = useQueryClient();
  const sessionExpired = error instanceof ApiError && error.code === 'session_expired';
  const returnTo = loginReturnPath(location.pathname, location.search);

  // O login é outro app (outra origem): navegação de página inteira, sem deixar o painel no histórico.
  // A moldura continua na tela, com o conteúdo em skeleton, até o navegador sair daqui.
  useEffect(() => {
    if (sessionExpired) window.location.replace(authUrl(`/sign-in?return=${encodeURIComponent(returnTo)}`));
  }, [sessionExpired, returnTo]);

  if (!isPending && !sessionExpired && (error || !me)) {
    return (
      <ErrorScreen
        title="Algo deu errado"
        message={error instanceof ApiError ? error.message : 'Não foi você. Tente de novo em instantes.'}
        code={error instanceof ApiError && error.status > 0 ? error.code : undefined}
        primary={{ label: 'Tentar de novo', onPress: () => void refetch() }}
      />
    );
  }

  const signOut = async () => {
    try {
      await deleteSession();
    } catch (cause) {
      notify.error(cause instanceof ApiError ? cause.message : 'Não deu para sair agora. Tente de novo.');
      return;
    }
    queryClient.clear();
    window.location.assign(authUrl('/sign-in'));
  };

  // A moldura (menu e títulos) não depende de dados: aparece na hora. Só o crachá e o conteúdo esperam `/me`.
  // Matrícula e curso não existem em /me (lacuna do contrato): mostramos o e-mail como detalhe.
  const badge = me ? <UserBadge name={me.name ?? me.email ?? 'Conta ufba.app'} detail={me.name ? (me.email ?? undefined) : undefined} /> : <BadgeSkeleton />;
  const renderItem = ({ href, label, icon, match }: NavEntry) => (
    <SideNavItem key={href} as={RouterLink} href={href} icon={icon} current={isCurrent(location.pathname, match ?? href)}>
      {label}
    </SideNavItem>
  );

  const renderMobileLink = ({ href, label, icon, match }: NavEntry) => (
    <MobileNavLink key={href} as={RouterLink} href={href} icon={icon} current={isCurrent(location.pathname, match ?? href)}>
      {label}
    </MobileNavLink>
  );

  // Botão do SIGAA, logo abaixo da marca (lateral) e entre o perfil e o menu (folha do celular):
  // conectado abre o SIGAA já logado em outra aba; senha pedida ou trancado leva a Conexões para reconectar.
  const sigaaStatus = me?.connections.sigaa.status;
  const sigaaButton = (placement: 'sidebar' | 'sheet') => {
    const logo = <ServiceIcon service="sigaa" size={placement === 'sidebar' ? 26 : 28} />;
    if (sigaaStatus === 'connected') {
      return <LaunchButton placement={placement} label="Abrir o SIGAA" logo={logo} onPress={openSigaaLoggedIn} />;
    }
    if (sigaaStatus === 'password_required' || sigaaStatus === 'locked') {
      return (
        <LaunchButton
          placement={placement}
          tone="attention"
          trailing="chevron"
          label="Reconectar SIGAA"
          logo={logo}
          as={RouterLink}
          href="/connections"
        />
      );
    }
    return null;
  };
  // Só o nome: o brasão do SIGAA fica no botão de abrir o SIGAA, não na marca.
  const brand = <span className="web-brand">ufba.app</span>;
  const displayName = me ? (me.name ?? me.email ?? 'Conta ufba.app') : '';
  // Abaixo do nome: "matrícula · curso", quando a importação do SIGAA já existe (cada parte só aparece se vier);
  // sem importação, o e-mail.
  const academicDetail = [academic?.registration, academic?.summary?.programName].filter(Boolean).join(' · ');
  const profileDetail = academicDetail || (me?.name ? (me.email ?? undefined) : undefined);

  return (
    <AppShell
      topBar={brand}
      mobileNav={
        <MobileNav
          items={MOBILE_BAR.map(({ href, label, icon }) => ({
            href,
            label,
            icon,
            as: RouterLink,
            current: isCurrent(location.pathname, href),
          }))}
          action={
            <Button variant="danger-text" isDisabled={!me} onPress={() => void signOut()}>
              Sair
            </Button>
          }
          footer="App não oficial · código aberto (AGPL-3.0)"
        >
          {me ? (
            <MobileNavProfile avatar={initials(displayName)} name={displayName} detail={profileDetail} />
          ) : (
            <BadgeSkeleton />
          )}
          {sigaaButton('sheet')}
          <MobileNavGroup label="Seu curso">{MAIN.filter(({ href }) => href !== '/').map(renderMobileLink)}</MobileNavGroup>
          <MobileNavGroup label="Conta">{ACCOUNT.map(renderMobileLink)}</MobileNavGroup>
        </MobileNav>
      }
      sidebar={
        <SideNav
          brand={brand}
          top={sigaaButton('sidebar')}
          footer={
            <>
              {badge}
              <Button variant="ghost" size="sm" isDisabled={!me} onPress={() => void signOut()}>
                Sair
              </Button>
            </>
          }
        >
          <ul className="ufba-nav__list">{MAIN.map(renderItem)}</ul>
          <SideNavGroup label="Conta">{ACCOUNT.map(renderItem)}</SideNavGroup>
        </SideNav>
      }
    >
      <div className="web-content">
        {me ? (
          <Suspense fallback={<PageSkeleton />}>
            <Outlet context={{ me } satisfies SessionContext} />
          </Suspense>
        ) : (
          <PageSkeleton />
        )}
      </div>
    </AppShell>
  );
}
