import { useQueryClient } from '@tanstack/react-query';
import { Button, Chip, EmptyState, Notice, PageHeader } from '@ufba-app/web-ui';
import { useEffect, useId, useState } from 'react';
import { ApiError } from '../api/client';
import {
  adminTeamQueryKey,
  assignTeamRole,
  unassignTeamRole,
  useAdminMemorySync,
  useAdminPeopleSearch,
  useAdminTeam,
} from '../api/memory';
import { MemoryTabs } from '../components/MemoryTabs';
import { AppRowsSkeleton } from '../components/Skeletons';
import type { AdminMemorySync, AdminTeam, TeamMember } from '../contract';
import { timeLabel } from '../lib/memoryLabels';
import { notify } from '../lib/notify';
import { useDocumentTitle } from '../lib/useDocumentTitle';

/** O único papel que se atribui. Todo estudante com conta já lê a documentação, sem papel. */
const MAINTAINER = 'maintainer';

const personLabel = (person: { name: string | null; email: string | null }, fallback = 'Pessoa sem nome') =>
  person.name ?? person.email ?? fallback;

const initialOf = (label: string) => label.trim().charAt(0).toUpperCase() || '?';

/** Mesmo texto para quem está em dúvida do que um mantenedor pode: vem dos projetos que o papel concede. */
function MaintainerScope({ role }: { role: AdminTeam['roles'][number] | undefined }) {
  const writes = role?.grants.filter((g) => g.level === 'write') ?? [];
  return (
    <Notice tone="info">
      Todo estudante com conta @ufba.br já lê a documentação.
      {writes.length > 0
        ? ` Quem é mantenedor também escreve em ${writes.map((g) => g.title).join(', ')}.`
        : ' Mantenedor é quem pode escrever nos projetos do time.'}
    </Notice>
  );
}

function PersonRow({
  person,
  meta,
  action,
}: {
  person: TeamMember;
  meta?: string;
  action: React.ReactNode;
}) {
  const label = personLabel(person);
  return (
    <article className="ufba-app-row">
      <span className="ufba-app-row__initial" aria-hidden="true">
        {initialOf(label)}
      </span>
      <div className="ufba-app-row__info">
        <h3 className="ufba-app-row__name">
          <span>{label}</span>
        </h3>
        {person.name && person.email ? <p className="ufba-app-row__meta">{person.email}</p> : null}
        {meta ? <p className="ufba-app-row__meta">{meta}</p> : null}
      </div>
      <div className="web-row-actions">{action}</div>
    </article>
  );
}

function MaintainersSection({
  members,
  busyId,
  onRemove,
}: {
  members: TeamMember[];
  busyId: string | null;
  onRemove: (member: TeamMember) => void;
}) {
  const maintainers = members.filter((m) => m.roles.includes(MAINTAINER));
  return (
    <section className="web-section" aria-labelledby="maintainers-title">
      <h2 id="maintainers-title" className="web-section-title">
        Mantenedores
      </h2>
      {maintainers.length === 0 ? (
        <p className="web-muted">Nenhum mantenedor ainda. Busque alguém abaixo.</p>
      ) : (
        <div className="web-list">
          {maintainers.map((member) => (
            <PersonRow
              key={member.userId}
              person={member}
              action={
                <Button
                  variant="danger-text"
                  size="sm"
                  isDisabled={busyId !== null}
                  isPending={busyId === member.userId}
                  aria-label={`Retirar ${personLabel(member)} de mantenedor`}
                  onPress={() => onRemove(member)}
                >
                  Retirar
                </Button>
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Espera o fim da digitação antes de consultar. */
function useDebounced(value: string, ms = 250): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function AddMaintainer({ busyId, onAdd }: { busyId: string | null; onAdd: (person: TeamMember) => void }) {
  const inputId = useId();
  const [text, setText] = useState('');
  const query = useDebounced(text.trim());
  const search = useAdminPeopleSearch(query);
  const short = text.trim().length < 2;
  const people = search.data?.people ?? [];

  return (
    <section className="web-card web-section" aria-labelledby="add-title">
      <h2 id="add-title" className="web-section-title">
        Adicionar mantenedor
      </h2>
      <div className="web-field">
        <label className="web-label" htmlFor={inputId}>
          Buscar por nome ou e-mail
        </label>
        <input
          id={inputId}
          className="ufba-field"
          type="search"
          autoComplete="off"
          spellCheck={false}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>

      {short ? <p className="web-muted">Digite ao menos 2 letras.</p> : null}
      {!short && search.isPending ? <p className="web-muted">Buscando…</p> : null}
      {!short && search.error ? (
        <Notice tone="danger">
          {search.error instanceof ApiError ? search.error.message : 'Não deu para buscar agora.'}
        </Notice>
      ) : null}
      {!short && search.data && people.length === 0 ? <p className="web-muted">Ninguém encontrado.</p> : null}
      {!short && people.length > 0 ? (
        <div className="web-list" aria-label="Resultados da busca">
          {people.map((person) => {
            const already = person.roles.includes(MAINTAINER);
            return (
              <PersonRow
                key={person.userId}
                person={person}
                action={
                  already ? (
                    <Chip>Já é mantenedor</Chip>
                  ) : (
                    <Button
                      size="sm"
                      isDisabled={busyId !== null}
                      isPending={busyId === person.userId}
                      aria-label={`Tornar ${personLabel(person)} mantenedor`}
                      onPress={() => onAdd(person)}
                    >
                      Tornar mantenedor
                    </Button>
                  )
                }
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function SyncSection({ sync }: { sync: AdminMemorySync }) {
  const clean = sync.failing.length === 0 && sync.unknownProjects.length === 0;
  return (
    <section className="web-section" aria-labelledby="sync-title">
      <h2 id="sync-title" className="web-section-title">
        Sincronização com a memória
      </h2>
      {clean ? <p className="web-muted">Tudo sincronizado</p> : null}

      {sync.failing.length > 0 ? (
        <div className="web-section">
          <h3 className="web-card-title">Pessoas com falha</h3>
          <div className="web-list">
            {sync.failing.map((item, index) => (
              <article className="ufba-app-row" key={`${item.email ?? item.name ?? 'sem-id'}-${index}`}>
                <div className="ufba-app-row__info">
                  <h4 className="ufba-app-row__name">
                    <span>{personLabel(item)}</span>
                  </h4>
                  <p className="ufba-app-row__meta">
                    {item.attempts === 1 ? '1 tentativa' : `${item.attempts} tentativas`} · Próxima tentativa:{' '}
                    {timeLabel(new Date(item.nextRunAt))}
                  </p>
                  {item.lastError ? <p className="ufba-app-row__meta">Erro: {item.lastError}</p> : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {sync.unknownProjects.length > 0 ? (
        <div className="web-section">
          <h3 className="web-card-title">Projetos desconhecidos</h3>
          <p className="web-muted">
            Existem no servidor de memória, mas a ufba.app não os conhece. Foram criados por escrita direta; adote ou
            apague no servidor.
          </p>
          <ul className="web-plain-list">
            {sync.unknownProjects.map((p) => (
              <li key={`${p.workspace}/${p.project}`}>
                <code>
                  {p.workspace}/{p.project}
                </code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function MemoryAdminPage() {
  useDocumentTitle('Administração da memória');
  const queryClient = useQueryClient();
  const team = useAdminTeam();
  const sync = useAdminMemorySync();
  const [busyId, setBusyId] = useState<string | null>(null);

  const forbidden = [team.error, sync.error].some((e) => e instanceof ApiError && e.code === 'not_admin');
  const failure = !forbidden ? (team.error ?? sync.error) : null;
  const loading = !forbidden && !failure && (team.isPending || sync.isPending);
  const ready = !forbidden && !failure && !loading && team.data !== undefined && sync.data !== undefined;

  const change = async (person: TeamMember, add: boolean) => {
    setBusyId(person.userId);
    const who = personLabel(person);
    try {
      if (add) await assignTeamRole(person.userId, MAINTAINER);
      else await unassignTeamRole(person.userId, MAINTAINER);
      notify.success(add ? `${who} agora é mantenedor.` : `${who} deixou de ser mantenedor.`);
      await queryClient.invalidateQueries({ queryKey: adminTeamQueryKey });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'team-people'] });
    } catch (cause) {
      notify.error(cause instanceof ApiError ? cause.message : 'Não deu para mudar o papel agora. Tente de novo.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Administração da memória"
        description="Quem é mantenedor com você e a saúde da sincronização com o servidor de memória."
      />
      <MemoryTabs />

      {loading ? <AppRowsSkeleton rows={3} /> : null}

      {forbidden ? (
        <EmptyState
          title="Você não tem acesso a esta área"
          description="Só quem administra a ufba.app vê a administração da memória."
        />
      ) : null}

      {failure ? (
        <Notice tone="danger">
          {failure instanceof ApiError ? failure.message : 'Não deu para carregar a administração agora.'}{' '}
          <button
            type="button"
            className="web-link"
            onClick={() => {
              void team.refetch();
              void sync.refetch();
            }}
          >
            Tentar de novo
          </button>
        </Notice>
      ) : null}

      {ready && team.data && sync.data ? (
        <>
          <MaintainerScope role={team.data.roles.find((r) => r.key === MAINTAINER)} />
          <MaintainersSection
            members={team.data.members}
            busyId={busyId}
            onRemove={(member) => void change(member, false)}
          />
          <AddMaintainer busyId={busyId} onAdd={(person) => void change(person, true)} />
          <SyncSection sync={sync.data} />
        </>
      ) : null}
    </>
  );
}
