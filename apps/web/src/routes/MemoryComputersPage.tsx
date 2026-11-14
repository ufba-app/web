import { useQueryClient } from '@tanstack/react-query';
import { Button, Chip, EmptyState, Notice, PageHeader } from '@ufba-app/web-ui';
import { Suspense, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import {
  memoryComputersQueryKey,
  memoryStatusQueryKey,
  revokeMemoryComputer,
  useMemoryComputers,
  useMemoryStatus,
} from '../api/memory';
import { DisconnectComputerDialog, preloadDialogs, RenameComputerDialog } from '../components/lazyDialogs';
import { MemoryTabs } from '../components/MemoryTabs';
import { AppRowsSkeleton } from '../components/Skeletons';
import type { MemoryComputer } from '../contract';
import { dateLabel, installModeLabel, lastUsedLabel, osLabel } from '../lib/memoryLabels';
import { notify } from '../lib/notify';
import { useDocumentTitle } from '../lib/useDocumentTitle';

function ComputerRow({
  computer,
  onRename,
  onDisconnect,
}: {
  computer: MemoryComputer;
  onRename: () => void;
  onDisconnect: () => void;
}) {
  const revoked = computer.revokedAt !== null;
  const details = [
    osLabel(computer.os),
    computer.agents.length > 0 ? computer.agents.join(', ') : 'Nenhum agente detectado',
    installModeLabel(computer.installMode),
  ].filter(Boolean);
  const usage = revoked
    ? `Desconectado em ${dateLabel(new Date(computer.revokedAt as string))}`
    : lastUsedLabel(computer.lastSeenAt ? new Date(computer.lastSeenAt) : null, new Date());

  return (
    <article className={revoked ? 'ufba-app-row web-row--revoked' : 'ufba-app-row'}>
      <span className="ufba-app-row__initial" aria-hidden="true">
        {computer.name.trim().charAt(0).toUpperCase() || '?'}
      </span>
      <div className="ufba-app-row__info">
        <h3 className="ufba-app-row__name">
          <span>{computer.name}</span>
          {revoked ? <Chip>Desconectado</Chip> : null}
        </h3>
        <p className="ufba-app-row__meta">{details.join(' · ')}</p>
        <p className="ufba-app-row__meta">
          Conectado em {dateLabel(new Date(computer.createdAt))} · {usage}
        </p>
      </div>
      {revoked ? null : (
        <div className="web-row-actions">
          <Button variant="outline" size="sm" aria-label={`Renomear ${computer.name}`} onPress={onRename}>
            Renomear
          </Button>
          <Button variant="danger-text" size="sm" aria-label={`Desconectar ${computer.name}`} onPress={onDisconnect}>
            Desconectar
          </Button>
        </div>
      )}
    </article>
  );
}

export function MemoryComputersPage() {
  useDocumentTitle('Computadores conectados');
  const queryClient = useQueryClient();
  // Status e lista saem juntos, em paralelo (cada um tem a sua query).
  const status = useMemoryStatus();
  const computersQuery = useMemoryComputers();
  const [renaming, setRenaming] = useState<MemoryComputer | null>(null);
  const [disconnecting, setDisconnecting] = useState<MemoryComputer | null>(null);
  const [mounted, setMounted] = useState({ rename: false, disconnect: false });
  const [pending, setPending] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  // Os diálogos ficam fora da primeira carga; baixam quando o navegador está ocioso.
  useEffect(preloadDialogs, []);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: memoryComputersQueryKey }),
      queryClient.invalidateQueries({ queryKey: memoryStatusQueryKey }),
    ]);

  const disconnect = async () => {
    if (!disconnecting) return;
    setPending(true);
    setDisconnectError(null);
    try {
      await revokeMemoryComputer(disconnecting.id);
      notify.success(`${disconnecting.name} desconectado.`);
      setDisconnecting(null);
      await refresh();
    } catch (cause) {
      setDisconnectError(cause instanceof ApiError ? cause.message : 'Não deu para desconectar agora. Tente de novo.');
    } finally {
      setPending(false);
    }
  };

  const unavailable = status.data !== undefined && !status.data.memoryAvailable;
  const failure = !unavailable ? (status.error ?? computersQuery.error) : null;
  const loading = !unavailable && !failure && (status.isPending || computersQuery.isPending);
  const computers = computersQuery.data?.computers ?? [];
  const active = computers.filter((c) => c.revokedAt === null).length;
  const ready = !unavailable && !failure && !loading && computersQuery.data !== undefined;

  return (
    <>
      <PageHeader
        title="Computadores conectados"
        description="Cada computador grava na sua memória com uma chave própria. Desconecte quando quiser."
        aside={
          ready && computers.length > 0 ? (
            <Chip tone="highlight">{active === 1 ? '1 computador' : `${active} computadores`}</Chip>
          ) : undefined
        }
      />

      <MemoryTabs />

      {loading ? <AppRowsSkeleton /> : null}

      {unavailable ? <Notice tone="warning">A memória está indisponível no momento. Tente de novo mais tarde.</Notice> : null}

      {failure ? (
        <Notice tone="danger">
          {failure instanceof ApiError ? failure.message : 'Não deu para carregar os computadores agora.'}{' '}
          <button
            type="button"
            className="web-link"
            onClick={() => {
              void status.refetch();
              void computersQuery.refetch();
            }}
          >
            Tentar de novo
          </button>
        </Notice>
      ) : null}

      {ready && computers.length === 0 ? (
        <EmptyState
          title="Nenhum computador conectado"
          description="Peça ao seu agente de IA para conectar este computador usando o MCP da ufba.app."
        />
      ) : null}

      {ready && computers.length > 0 ? (
        <div className="web-list">
          {/* Cada computador usa <h3>; este título mantém a ordem dos níveis (h1, h2, h3) para leitor de tela. */}
          <h2 className="ufba-visually-hidden">Lista de computadores</h2>
          {computers.map((computer) => (
            <ComputerRow
              key={computer.id}
              computer={computer}
              onRename={() => {
                setMounted((m) => ({ ...m, rename: true }));
                setRenaming(computer);
              }}
              onDisconnect={() => {
                setDisconnectError(null);
                setMounted((m) => ({ ...m, disconnect: true }));
                setDisconnecting(computer);
              }}
            />
          ))}
        </div>
      ) : null}

      <Suspense fallback={null}>
        {mounted.rename ? (
          <RenameComputerDialog
            computer={renaming}
            onClose={() => setRenaming(null)}
            onRenamed={(name) => {
              setRenaming(null);
              notify.success(`Computador renomeado para ${name}.`);
              void refresh();
            }}
          />
        ) : null}
        {mounted.disconnect ? (
          <DisconnectComputerDialog
            computer={disconnecting}
            pending={pending}
            error={disconnectError}
            onConfirm={() => void disconnect()}
            onCancel={() => setDisconnecting(null)}
          />
        ) : null}
      </Suspense>
    </>
  );
}
