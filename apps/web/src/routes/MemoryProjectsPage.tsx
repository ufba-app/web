import { useQueryClient } from '@tanstack/react-query';
import { Button, Chip, EmptyState, Notice, PageHeader } from '@ufba-app/web-ui';
import { Suspense, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../api/client';
import { memoryProjectsQueryKey, useMemoryProjects } from '../api/memory';
import { MemoryTabs } from '../components/MemoryTabs';
import { NewProjectDialog, preloadDialogs } from '../components/lazyDialogs';
import { AppRowsSkeleton } from '../components/Skeletons';
import type { MemoryProject } from '../contract';
import { membersCountLabel, projectRoleLabel, projectSourceLabel } from '../lib/memoryLabels';
import { notify } from '../lib/notify';
import { useDocumentTitle } from '../lib/useDocumentTitle';

function ProjectRow({ project }: { project: MemoryProject }) {
  return (
    <Link to={`/memory/projects/${encodeURIComponent(project.id)}`} className="web-row-link">
      <article className="ufba-app-row">
        <span className="ufba-app-row__initial" aria-hidden="true">
          {project.title.trim().charAt(0).toUpperCase() || '?'}
        </span>
        <div className="ufba-app-row__info">
          <h3 className="ufba-app-row__name">
            <span>{project.title}</span>
            {project.team ? <Chip tone="highlight">Time</Chip> : null}
            {project.sync === 'pending' ? <Chip tone="warning">Sincronizando…</Chip> : null}
          </h3>
          <p className="ufba-app-row__meta">
            {project.workspace}/{project.project}
          </p>
          <p className="ufba-app-row__meta">
            {projectRoleLabel(project.role)} · {projectSourceLabel(project.source)} · {membersCountLabel(project.membersCount)}
          </p>
        </div>
      </article>
    </Link>
  );
}

export function MemoryProjectsPage() {
  useDocumentTitle('Meus projetos');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, error, isPending, refetch } = useMemoryProjects();
  const [creating, setCreating] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(preloadDialogs, []);

  const projects = data?.projects ?? [];
  const openDialog = () => {
    setMounted(true);
    setCreating(true);
  };
  const newButton = (
    <Button onPress={openDialog}>Novo projeto</Button>
  );

  return (
    <>
      <PageHeader
        title="Meus projetos"
        description="Projetos são espaços da memória que você compartilha com quem trabalha com você."
        actions={data && projects.length > 0 ? newButton : undefined}
        aside={data && projects.length > 0 ? <Chip tone="highlight">{projects.length === 1 ? '1 projeto' : `${projects.length} projetos`}</Chip> : undefined}
      />
      <MemoryTabs />

      {isPending ? <AppRowsSkeleton /> : null}

      {error ? (
        <Notice tone="danger">
          {error instanceof ApiError ? error.message : 'Não deu para carregar os projetos agora.'}{' '}
          <button type="button" className="web-link" onClick={() => void refetch()}>
            Tentar de novo
          </button>
        </Notice>
      ) : null}

      {data && projects.length === 0 ? (
        <EmptyState
          title="Nenhum projeto ainda"
          description="Um projeto reúne o que seus agentes de IA gravam sobre um trabalho, como um TCC ou uma disciplina. Quem tem acesso a um projeto lê TODAS as páginas dele, então só convide quem deve ver tudo."
          action={newButton}
        />
      ) : null}

      {data && projects.length > 0 ? (
        <div className="web-list">
          <h2 className="ufba-visually-hidden">Lista de projetos</h2>
          {projects.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </div>
      ) : null}

      <Suspense fallback={null}>
        {mounted ? (
          <NewProjectDialog
            isOpen={creating}
            onClose={() => setCreating(false)}
            onCreated={(project) => {
              setCreating(false);
              notify.success(`Projeto ${project.title} criado.`);
              void queryClient.invalidateQueries({ queryKey: memoryProjectsQueryKey });
              void navigate(`/memory/projects/${encodeURIComponent(project.id)}`);
            }}
          />
        ) : null}
      </Suspense>
    </>
  );
}
