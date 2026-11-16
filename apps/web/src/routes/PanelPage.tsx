import { Button, Notice, PageHeader } from '@ufba-app/web-ui';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMyCalendar } from '../api/myCalendar';
import { useSession } from '../components/AppLayout';
import {
  dayTitle,
  eventsFromCalendar,
  isoDay,
  navigate as navigateDay,
  SOURCE_NAME,
  visibleRange,
  type Mode,
} from '../components/panel/model';
import { PanelCalendar } from '../components/panel/PanelCalendar';
import '../components/panel/panel.css';
import { useDocumentTitle } from '../lib/useDocumentTitle';

/**
 * O Painel (início): o calendário do mês ou da semana e o dia escolhido embaixo. Desenho: canvas, seção 13. Decisão do
 * André: mostra APENAS o calendário acadêmico da UFBA (feriados e dias sem aula), as AULAS (recorrência do SIGAA, sem aula
 * nos feriados) e as sessões da clínica (SIASB) para quem tem acesso. Nada de entregas e provas do Moodle e do Classroom.
 *
 * O calendário vem COMPILADO da API (`GET /me/calendar?from=&to=`, api#61). O web só desenha; não monta nada a partir de
 * várias rotas. A API ainda não manda as aulas (`class`): entram depois, sem mudar o formato (e ela deixará de mandar
 * entregas e provas; até lá o web as ignora). Uma fonte que falha não derruba o resto: a tela avisa só dela (SIGAA ou
 * SIASB). Sem SIGAA nem SIASB conectado o calendário mostra só feriados e dias sem aula, com a faixa "Conecte o SIGAA".
 *
 * O MURAL de avisos ainda não entra: a API não tem a lista de avisos (ver `components/panel/Mural.tsx`).
 */
export function PanelPage() {
  useDocumentTitle('Painel');
  const me = useSession();
  const goTo = useNavigate();
  // "Hoje" no fuso da UFBA, fixado na abertura da tela.
  const today = useMemo(() => isoDay(new Date()), []);
  const [selected, setSelected] = useState(today);
  const [mode, setMode] = useState<Mode>('month');

  const { from, to } = visibleRange(selected, mode);
  const calendar = useMyCalendar(from, to);

  // As fontes do calendário são só o SIGAA (aulas) e o SIASB (sessões, para quem o tem). Moodle e Classroom não entram.
  const { sigaa, siasb } = me.connections;
  const anyConnected = sigaa.status === 'connected' || (siasb.offered && siasb.status === 'connected');

  const events = useMemo(() => eventsFromCalendar(calendar.data), [calendar.data]);
  // Aviso de fonte só das que o calendário usa: uma falha do Moodle ou do Classroom não é assunto do Painel.
  const unhealthy = (calendar.data?.sources ?? []).filter(
    (entry) => entry.status !== 'ok' && (entry.source === 'sigaa' || entry.source === 'siasb'),
  );
  const failed = unhealthy.filter((entry) => entry.status === 'failed').map((entry) => SOURCE_NAME[entry.source]);
  const reconnect = unhealthy.filter((entry) => entry.status === 'reconnect_required').map((entry) => SOURCE_NAME[entry.source]);

  return (
    <>
      <PageHeader title="Painel" description={dayTitle(today)} />

      {!anyConnected ? (
        <div className="pn-faixa">
          <div>
            <b>Conecte o SIGAA para ver suas aulas</b>
            <small>Por enquanto o calendário mostra só feriados e dias sem aula.</small>
          </div>
          <Button onPress={() => void goTo('/connections')}>Conectar o SIGAA</Button>
        </div>
      ) : null}

      {failed.length > 0 ? (
        <Notice tone="warning">
          Não deu para atualizar {failed.join(' e ')} agora. O que veio {failed.length === 1 ? 'dessa fonte' : 'dessas fontes'} pode estar
          faltando.{' '}
          <button type="button" className="web-link" onClick={() => void calendar.refetch()}>
            Tentar de novo
          </button>
        </Notice>
      ) : null}
      {reconnect.length > 0 ? (
        <Notice tone="warning">
          Reconecte {reconnect.join(' e ')} para ver tudo no calendário.{' '}
          <button type="button" className="web-link" onClick={() => void goTo('/connections')}>
            Abrir Conexões
          </button>
        </Notice>
      ) : null}
      {calendar.isError ? (
        <Notice tone="danger">
          Não deu para carregar o calendário agora.{' '}
          <button type="button" className="web-link" onClick={() => void calendar.refetch()}>
            Tentar de novo
          </button>
        </Notice>
      ) : null}

      <div className="pn">
        {calendar.isPending ? (
          <div className="pn-cal pn-cal--sk web-sk web-sk--card skeleton skeleton--shimmer web-sk-onwhite" aria-busy="true" />
        ) : (
          <PanelCalendar
            today={today}
            selected={selected}
            mode={mode}
            events={events}
            loading={calendar.isFetching && calendar.isPlaceholderData}
            onSelect={setSelected}
            onMode={setMode}
            onNavigate={(direction) => setSelected(navigateDay(selected, mode, direction, today))}
            onToday={() => setSelected(today)}
          />
        )}
      </div>
    </>
  );
}
