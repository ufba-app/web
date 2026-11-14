import { useQueryClient } from '@tanstack/react-query';
import { Button, Chip, EmptyState, Notice, PageHeader } from '@ufba-app/web-ui';
import { useState } from 'react';
import { ApiError } from '../api/client';
import {
  adminTeamQueryKey,
  assignTeamRole,
  unassignTeamRole,
  useAdminMemorySync,
  useAdminTeam,
} from '../api/memory';
import { MemoryTabs } from '../components/MemoryTabs';
import { AppRowsSkeleton } from '../components/Skeletons';
import type { AdminMemorySync, AdminTeam, TeamMember } from '../contract';
import { memberLevelLabel, timeLabel } from '../lib/memoryLabels';
import { notify } from '../lib/notify';
import { useDocumentTitle } from '../lib/useDocumentTitle';

const personLabel = (person: { name: string | null; email: string | null }, fallback = 'Pessoa sem nome') =>
  person.name ?? person.email ?? fallback;

function RolesTable({ roles }: { roles: AdminTeam['roles'] }) {
  return (
    <section className="web-section" aria-labelledby="roles-title">
      <h2 id="roles-title" className="web-section-title">
        Papéis
      </h2>
      <Notice tone="info">
        Para mudar o que um papel concede é preciso uma alteração no código (revisão), não há edição aqui.
      </Notice>
      <div className="web-table-wrap">
        <table className="web-table">
          <thead>
            <tr>
              <th scope="col">Papel</th>
              <th scope="col">Descrição</th>
              <th scope="col">Projetos que concede</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.key}>
                <th scope="row">{role.key}</th>
                <td>{role.description}</td>
                <td>
                  {role.grants.length === 0 ? (
                    'Nenhum projeto'
                  ) : (
                    <ul className="web-plain-list">
                      {role.grants.map((grant) => (
                        <li key={`${grant.workspace}/${grant.project}`}>
                          {grant.title} ({grant.workspace}/{grant.project}) · {memberLevelLabel(grant.level)}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MemberRoles({
  member,
  roles,
  busyKey,
  onToggle,
}: {
  member: TeamMember;
  roles: AdminTeam['roles'];
  busyKey: string | null;
  onToggle: (member: TeamMember, roleKey: string, assigned: boolean) => void;
}) {
  const label = personLabel(member);
  return (
    <article className="ufba-app-row">
      <span className="ufba-app-row__initial" aria-hidden="true">
        {label.trim().charAt(0).toUpperCase() || '?'}
      </span>
      <div className="ufba-app-row__info">
        <h3 className="ufba-app-row__name">
          <span>{label}</span>
        </h3>
        {member.name && member.email ? <p className="ufba-app-row__meta">{member.email}</p> : null}
        <div className="web-chips">
          {member.roles.length === 0 ? <span className="ufba-app-row__meta">Sem papéis</span> : null}
          {member.roles.map((key) => (
            <Chip key={key} tone="highlight">
              {key}
            </Chip>
          ))}
        </div>
      </div>
      <div className="web-row-actions">
        {roles.map((role) => {
          const assigned = member.roles.includes(role.key);
          const busy = busyKey === `${member.userId}:${role.key}`;
          return (
            <Button
              key={role.key}
              variant={assigned ? 'danger-text' : 'outline'}
              size="sm"
              isDisabled={busyKey !== null}
              isPending={busy}
              aria-label={`${assigned ? 'Retirar' : 'Atribuir'} ${role.key} ${assigned ? 'de' : 'a'} ${label}`}
              onPress={() => onToggle(member, role.key, assigned)}
            >
              {assigned ? `Retirar ${role.key}` : `Atribuir ${role.key}`}
            </Button>
          );
        })}
      </div>
    </article>
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
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const forbidden = [team.error, sync.error].some((e) => e instanceof ApiError && e.code === 'not_admin');
  const failure = !forbidden ? (team.error ?? sync.error) : null;
  const loading = !forbidden && !failure && (team.isPending || sync.isPending);
  const ready = !forbidden && !failure && !loading && team.data !== undefined && sync.data !== undefined;

  const toggle = async (member: TeamMember, roleKey: string, assigned: boolean) => {
    setBusyKey(`${member.userId}:${roleKey}`);
    const who = personLabel(member);
    try {
      if (assigned) await unassignTeamRole(member.userId, roleKey);
      else await assignTeamRole(member.userId, roleKey);
      notify.success(assigned ? `Papel ${roleKey} retirado de ${who}.` : `Papel ${roleKey} atribuído a ${who}.`);
      await queryClient.invalidateQueries({ queryKey: adminTeamQueryKey });
    } catch (cause) {
      notify.error(cause instanceof ApiError ? cause.message : 'Não deu para mudar o papel agora. Tente de novo.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Administração da memória"
        description="Papéis do time e saúde da sincronização com o servidor de memória."
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
          <RolesTable roles={team.data.roles} />

          <section className="web-section" aria-labelledby="people-title">
            <h2 id="people-title" className="web-section-title">
              Pessoas e papéis
            </h2>
            {team.data.members.length === 0 ? (
              <p className="web-muted">Ninguém no time ainda.</p>
            ) : (
              <div className="web-list">
                {team.data.members.map((member) => (
                  <MemberRoles
                    key={member.userId}
                    member={member}
                    roles={team.data.roles}
                    busyKey={busyKey}
                    onToggle={(m, key, assigned) => void toggle(m, key, assigned)}
                  />
                ))}
              </div>
            )}
          </section>

          <SyncSection sync={sync.data} />
        </>
      ) : null}
    </>
  );
}

