import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Chip, EmptyState, Notice, PageHeader } from '@ufba-app/web-ui';
import { Suspense, useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api/client';
import {
  deleteMemoryProject,
  memoryProjectQueryKey,
  memoryProjectsQueryKey,
  removeMemoryProjectMember,
  setMemoryProjectMember,
  transferMemoryProject,
  useMemoryProject,
} from '../api/memory';
import { useSession } from '../components/AppLayout';
import { DeleteProjectDialog, preloadDialogs, ProjectConfirmDialog } from '../components/lazyDialogs';
import { MemoryTabs } from '../components/MemoryTabs';
import { PageSkeleton } from '../components/Skeletons';
import { memberLevels, type MemberLevel, type MemoryProjectDetail, type ProjectMember } from '../contract';
import { projectInviteFormSchema, type ProjectInviteFormInput, type ProjectInviteFormValues } from '../forms/projectInvite';
import { memberLevelLabel, projectRoleLabel, projectSourceLabel } from '../lib/memoryLabels';
import { notify } from '../lib/notify';
import { useDocumentTitle } from '../lib/useDocumentTitle';

const failureMessage = (cause: unknown, fallback: string) => (cause instanceof ApiError ? cause.message : fallback);

function MarkerBlock({ marker }: { marker: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(marker);
      notify.success('Copiado');
    } catch {
      notify.error('Não deu para copiar. Selecione o texto e copie.');
    }
  };
  return (
    <section className="web-card web-section" aria-labelledby="marker-title">
      <h2 id="marker-title" className="web-section-title">
        Marcador do repositório
      </h2>
      <p className="web-muted">
        Cole em <code>.ai-memory.toml</code> na raiz do repositório. Sem esse arquivo nada é capturado.
      </p>
      <pre className="web-code" tabIndex={0} aria-label="Conteúdo do marcador">
        <code>{marker}</code>
      </pre>
      <div className="web-inline">
        <Button variant="outline" size="sm" onPress={() => void copy()}>
          Copiar
        </Button>
      </div>
    </section>
  );
}

function InviteForm({ projectId, onInvited }: { projectId: string; onInvited: () => void }) {
  const formId = useId();
  const [pending, setPending] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ProjectInviteFormInput, unknown, ProjectInviteFormValues>({
    resolver: zodResolver(projectInviteFormSchema),
    defaultValues: { email: '', level: 'read' },
  });

  const submit = handleSubmit(async ({ email, level }) => {
    setPending(true);
    try {
      const normalized = email.toLowerCase();
      await setMemoryProjectMember(projectId, normalized, level);
      notify.success(`Convite enviado para ${normalized}.`);
      reset({ email: '', level });
      onInvited();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'invalid_email_domain') {
        setError('email', { type: 'server', message: cause.message });
      } else {
        notify.error(failureMessage(cause, 'Não deu para convidar agora. Tente de novo.'));
      }
    } finally {
      setPending(false);
    }
  });

  return (
    <form className="web-fields" onSubmit={(e) => void submit(e)} noValidate aria-label="Convidar pessoa">
      <div className="web-field">
        <label className="web-label">
          E-mail da pessoa (@ufba.br)
          <input
            className="ufba-field"
            type="email"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="send"
            autoComplete="off"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? `${formId}-email-error` : undefined}
            {...register('email')}
          />
        </label>
        {errors.email ? (
          <span id={`${formId}-email-error`} className="web-field-error">
            {errors.email.message}
          </span>
        ) : null}
      </div>
      <div className="web-field">
        <label className="web-label">
          Nível de acesso
          <select className="ufba-field web-select" {...register('level')}>
            {memberLevels.map((level) => (
              <option key={level} value={level}>
                {memberLevelLabel(level)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="web-inline">
        <Button type="submit" isPending={pending}>
          Convidar
        </Button>
      </div>
    </form>
  );
}

function MemberRow({
  member,
  busy,
  onLevel,
  onRemove,
  onTransfer,
}: {
  member: ProjectMember;
  busy: boolean;
  onLevel: (level: MemberLevel) => void;
  onRemove: () => void;
  onTransfer: () => void;
}) {
  const label = member.name ?? member.email;
  const canTransfer = member.status === 'active' && member.level === 'write';
  const otherLevel: MemberLevel = member.level === 'write' ? 'read' : 'write';
  return (
    <article className="ufba-app-row">
      <span className="ufba-app-row__initial" aria-hidden="true">
        {label.trim().charAt(0).toUpperCase() || '?'}
      </span>
      <div className="ufba-app-row__info">
        <h3 className="ufba-app-row__name">
          <span>{label}</span>
          {member.status === 'pending' ? <Chip tone="warning">Convite pendente</Chip> : null}
        </h3>
        <p className="ufba-app-row__meta">
          {member.name ? `${member.email} · ` : ''}
          {memberLevelLabel(member.level)}
        </p>
      </div>
      <div className="web-row-actions">
        <Button
          variant="outline"
          size="sm"
          isDisabled={busy}
          aria-label={`Mudar ${label} para ${memberLevelLabel(otherLevel).toLowerCase()}`}
          onPress={() => onLevel(otherLevel)}
        >
          {otherLevel === 'write' ? 'Dar escrita' : 'Só leitura'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          isDisabled={busy || !canTransfer}
          aria-label={`Transferir posse para ${label}`}
          onPress={onTransfer}
        >
          Transferir posse
        </Button>
        <Button variant="danger-text" size="sm" isDisabled={busy} aria-label={`Remover ${label}`} onPress={onRemove}>
          Remover
        </Button>
      </div>
    </article>
  );
}

type Confirm = { kind: 'transfer'; member: ProjectMember } | { kind: 'leave' } | { kind: 'delete' } | null;

function ProjectContent({ project }: { project: MemoryProjectDetail }) {
  useDocumentTitle(project.title);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const me = useSession();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [mounted, setMounted] = useState({ confirm: false, delete: false });
  const [pending, setPending] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  useEffect(preloadDialogs, []);

  const isOwner = project.role === 'owner' && !project.team;
  const isMember = !project.team && project.role !== 'owner';
  const refresh = () => queryClient.invalidateQueries({ queryKey: memoryProjectQueryKey(project.id) });
  const backToList = async () => {
    await queryClient.invalidateQueries({ queryKey: memoryProjectsQueryKey });
    void navigate('/memory/projects');
  };

  const open = (next: Exclude<Confirm, null>) => {
    setConfirmError(null);
    setMounted((m) => (next.kind === 'delete' ? { ...m, delete: true } : { ...m, confirm: true }));
    setConfirm(next);
  };

  /** Toda falha vira toast. Erro 403/404 fecha o diálogo e recarrega (a tela mostra o que mudou); o resto fica no diálogo. */
  const run = async (action: () => Promise<void>, onDone: () => Promise<void> | void, fallback: string) => {
    setPending(true);
    setConfirmError(null);
    try {
      await action();
      setConfirm(null);
      await onDone();
    } catch (cause) {
      const message = failureMessage(cause, fallback);
      notify.error(message);
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        setConfirm(null);
        await refresh();
      } else {
        setConfirmError(message);
      }
    } finally {
      setPending(false);
    }
  };

  const transfer = (member: ProjectMember) =>
    run(
      () => transferMemoryProject(project.id, member.email),
      async () => {
        notify.success(`A posse foi para ${member.name ?? member.email}. Você continua com escrita.`);
        await refresh();
      },
      'Não deu para transferir agora. Tente de novo.',
    );

  const leave = () =>
    run(
      () => removeMemoryProjectMember(project.id, me.email ?? ''),
      async () => {
        notify.success(`Você saiu de ${project.title}.`);
        await backToList();
      },
      'Não deu para sair agora. Tente de novo.',
    );

  const del = () =>
    run(
      () => deleteMemoryProject(project.id),
      async () => {
        notify.success(`Projeto ${project.title} apagado.`);
        await backToList();
      },
      'Não deu para apagar agora. Tente de novo.',
    );

  const changeLevel = async (member: ProjectMember, level: MemberLevel) => {
    setBusyEmail(member.email);
    try {
      await setMemoryProjectMember(project.id, member.email, level);
      notify.success(`${member.name ?? member.email} agora tem ${memberLevelLabel(level).toLowerCase()}.`);
      await refresh();
    } catch (cause) {
      notify.error(failureMessage(cause, 'Não deu para mudar o nível agora. Tente de novo.'));
    } finally {
      setBusyEmail(null);
    }
  };

  const removeMember = async (member: ProjectMember) => {
    setBusyEmail(member.email);
    try {
      await removeMemoryProjectMember(project.id, member.email);
      notify.success(`${member.name ?? member.email} foi removido.`);
      await refresh();
    } catch (cause) {
      notify.error(failureMessage(cause, 'Não deu para remover agora. Tente de novo.'));
    } finally {
      setBusyEmail(null);
    }
  };

  const transferTarget = confirm?.kind === 'transfer' ? confirm.member : null;

  return (
    <>
      <PageHeader
        title={project.title}
        description={`${project.workspace}/${project.project}`}
        aside={
          <span className="web-chips">
            <Chip tone="highlight">{projectRoleLabel(project.role)}</Chip>
            {project.team ? <Chip tone="highlight">Time</Chip> : null}
            {project.sync === 'pending' ? <Chip tone="warning">Sincronizando…</Chip> : null}
          </span>
        }
      />
      <MemoryTabs />
      <p className="web-muted">
        <Link className="web-link" to="/memory/projects">
          Voltar para Meus projetos
        </Link>{' '}
        · {projectSourceLabel(project.source)}
      </p>

      <Notice tone="warning">
        Quem tem acesso lê todas as páginas do projeto (não há permissão por página). Não grave senhas, tokens nem dados
        pessoais de outras pessoas.
      </Notice>

      <MarkerBlock marker={project.marker} />

      {project.team ? <Notice tone="info">Este é um projeto do time: só leitura, sem ações por aqui.</Notice> : null}

      {isOwner ? (
        <>
          <section className="web-section" aria-labelledby="members-title">
            <h2 id="members-title" className="web-section-title">
              Membros e convites
            </h2>
            {project.members.length === 0 ? (
              <p className="web-muted">Só você tem acesso por enquanto. Convide alguém abaixo.</p>
            ) : (
              <div className="web-list">
                {project.members.map((member) => (
                  <MemberRow
                    key={member.email}
                    member={member}
                    busy={busyEmail === member.email}
                    onLevel={(level) => void changeLevel(member, level)}
                    onRemove={() => void removeMember(member)}
                    onTransfer={() => open({ kind: 'transfer', member })}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="web-card web-section" aria-labelledby="invite-title">
            <h2 id="invite-title" className="web-section-title">
              Convidar pessoa
            </h2>
            <InviteForm projectId={project.id} onInvited={() => void refresh()} />
          </section>

          <section className="web-card web-section" aria-labelledby="danger-title">
            <h2 id="danger-title" className="web-section-title">
              Apagar projeto
            </h2>
            <p className="web-muted">Apaga o projeto e também o conteúdo dele no memory. Não dá para desfazer.</p>
            <div className="web-inline">
              <Button variant="danger" onPress={() => open({ kind: 'delete' })}>
                Apagar projeto
              </Button>
            </div>
          </section>
        </>
      ) : null}

      {isMember ? (
        <div className="web-inline">
          <Button variant="danger-text" onPress={() => open({ kind: 'leave' })}>
            Sair do projeto
          </Button>
        </div>
      ) : null}

      <Suspense fallback={null}>
        {mounted.confirm ? (
          <ProjectConfirmDialog
            isOpen={confirm?.kind === 'transfer' || confirm?.kind === 'leave'}
            title={transferTarget ? 'Transferir a posse?' : 'Sair do projeto?'}
            confirmLabel={transferTarget ? 'Transferir posse' : 'Sair do projeto'}
            danger={!transferTarget}
            pending={pending}
            error={confirmError}
            onConfirm={() => void (transferTarget ? transfer(transferTarget) : leave())}
            onCancel={() => setConfirm(null)}
          >
            {transferTarget
              ? `${transferTarget.name ?? transferTarget.email} passa a ser dono de ${project.title}. Você continua com escrita, mas deixa de gerenciar membros e de apagar o projeto.`
              : `Você deixa de ler as páginas de ${project.title}. Só o dono pode convidar você de novo.`}
          </ProjectConfirmDialog>
        ) : null}
        {mounted.delete ? (
          <DeleteProjectDialog
            isOpen={confirm?.kind === 'delete'}
            title={project.title}
            pending={pending}
            error={confirmError}
            onConfirm={() => void del()}
            onCancel={() => setConfirm(null)}
          />
        ) : null}
      </Suspense>
    </>
  );
}

export function MemoryProjectPage() {
  const { id = '' } = useParams();
  useDocumentTitle('Projeto');
  const { data, error, isPending, refetch } = useMemoryProject(id);

  if (isPending) return <PageSkeleton />;

  if (error instanceof ApiError && error.code === 'project_not_found') {
    return (
      <>
        <PageHeader title="Projeto" />
        <MemoryTabs />
        <EmptyState
          title="Projeto não encontrado"
          description={error.message}
          action={
            <Link className="web-link" to="/memory/projects">
              Voltar para Meus projetos
            </Link>
          }
        />
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageHeader title="Projeto" />
        <MemoryTabs />
        <Notice tone="danger">
          {error instanceof ApiError ? error.message : 'Não deu para carregar o projeto agora.'}{' '}
          <button type="button" className="web-link" onClick={() => void refetch()}>
            Tentar de novo
          </button>
        </Notice>
      </>
    );
  }

  return <ProjectContent project={data} />;
}
