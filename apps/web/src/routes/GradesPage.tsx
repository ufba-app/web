import { Button, EmptyState, Notice, PageHeader, Skeleton } from '@ufba-app/web-ui';
import { useNavigate } from 'react-router';
import { useAttendance } from '../api/attendance';
import { ApiError } from '../api/client';
import { useSession } from '../components/AppLayout';
import { AttendanceList } from '../components/grades/AttendanceList';
import '../components/grades/grades.css';
import '../components/panel/panel.css';
import { useDocumentTitle } from '../lib/useDocumentTitle';

/** A forma do conteúdo final: dois cartões de resumo sobre o fundo da página e a lista dentro do cartão branco. */
function AttendanceSkeleton() {
  return (
    <div aria-busy="true" className="gr-sk">
      <span className="ufba-visually-hidden" role="status">
        Lendo a frequência no SIGAA…
      </span>
      <div className="gr-sk-stats" aria-hidden="true">
        <Skeleton className="web-sk" />
        <Skeleton className="web-sk" />
      </div>
      <section className="gr-cartao" aria-hidden="true" style={{ marginTop: 16 }}>
        <div className="gr-sk-lista">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="web-sk web-sk-onwhite" />
          ))}
        </div>
        <p className="gr-sk-nota">Lendo a frequência no SIGAA. Pode levar alguns segundos.</p>
      </section>
    </div>
  );
}

/**
 * Notas e faltas (desenho do canvas, seção 27). Hoje só a FREQUÊNCIA do SIGAA (GET /sources/sigaa/attendance, api#77): por
 * disciplina, as faltas contra o limite de 25% da carga horária e a situação, tudo calculado pela API. As NOTAS ficam
 * como "em breve": não há rota de notas. A leitura é ao vivo e faz até 24 requisições ao SIGAA: só ao abrir a tela e no
 * "Tentar de novo" da pessoa; sem polling.
 */
export function GradesPage() {
  useDocumentTitle('Notas e faltas');
  const me = useSession();
  const goTo = useNavigate();
  const connected = me.connections.sigaa.status === 'connected';
  const attendance = useAttendance(connected);

  const error = attendance.error;
  const needsConnection = !connected || (error instanceof ApiError && error.code === 'source_not_connected');

  return (
    <>
      <PageHeader title="Notas e faltas" description="Frequência do SIGAA, por disciplina." />

      {needsConnection ? (
        <div className="pn-faixa">
          <div>
            <b>Conecte o SIGAA para ver suas faltas</b>
            <small>A frequência vem direto do SIGAA, em aulas.</small>
          </div>
          <Button onPress={() => void goTo('/connections')}>Conectar o SIGAA</Button>
        </div>
      ) : null}

      {!needsConnection && attendance.isPending ? <AttendanceSkeleton /> : null}

      {!needsConnection && attendance.isError ? (
        <Notice tone="warning">
          <b>O SIGAA não entregou a frequência agora.</b> O resto do ufba.app continua aqui.{' '}
          <button type="button" className="web-link" onClick={() => void attendance.refetch()}>
            Tentar de novo
          </button>
        </Notice>
      ) : null}

      {attendance.data && attendance.data.courses.length === 0 ? (
        <EmptyState title="Nenhuma disciplina com frequência" description="Quando o SIGAA tiver turmas do semestre, as faltas aparecem aqui." />
      ) : null}
      {attendance.data && attendance.data.courses.length > 0 ? <AttendanceList data={attendance.data} /> : null}

      <p className="gr-notas">
        <b>Notas: em breve.</b> As notas por disciplina ainda não estão disponíveis; por enquanto esta tela mostra só a frequência.
      </p>
    </>
  );
}
