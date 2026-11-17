import { Chip } from '@ufba-app/web-ui';
import type { Attendance, AttendanceCourse } from '../../contract';
import { absenceText, hasEstimate, hasLimit, hint, MAX_TICKS, riskSummary, sortByRisk, STATUS_LABEL } from './model';
import './grades.css';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Barra de faltas: um tique por falta permitida (cheios = faltas dadas), ou uma barra só quando o limite é grande. */
function Ticks({ course }: { course: AttendanceCourse }) {
  if (!hasLimit(course)) return <div className="gr-ticks gr-ticks--vazio" aria-hidden="true" />;
  const allowed = course.allowedAbsentClasses;
  const used = Math.min(course.absentClasses, allowed);
  if (allowed > MAX_TICKS) {
    return (
      <div className="gr-ticks gr-ticks--barra" aria-hidden="true">
        <i style={{ width: `${(used / allowed) * 100}%` }} />
      </div>
    );
  }
  return (
    <div className="gr-ticks" aria-hidden="true">
      {Array.from({ length: Math.max(allowed, 1) }, (_, index) => (
        <i key={index} className={index < used ? 'on' : ''} />
      ))}
    </div>
  );
}

function Row({ course }: { course: AttendanceCourse }) {
  const note = hint(course);
  return (
    <li className={`gr-row gr-row--${course.status}`}>
      <div className="gr-row__nome">
        <b>{course.courseName}</b>
        {note ? <small>{note}</small> : null}
        {!course.complete ? <Chip tone="neutral">Estimativa</Chip> : null}
      </div>
      <div className="gr-row__faltas">
        <Ticks course={course} />
        <span>{absenceText(course)}</span>
      </div>
      <span className={`gr-selo gr-selo--${course.status}`}>
        <i aria-hidden="true" />
        {STATUS_LABEL[course.status]}
      </span>
    </li>
  );
}

/** A frequência por disciplina (desenho do canvas, seção 27): cartões de resumo e a lista com faltas, limite e situação. */
export function AttendanceList({ data }: { data: Attendance }) {
  const { summary } = data;
  const estimate = hasEstimate(data);
  return (
    <>
      <div className="gr-stats">
        <div className="gr-st">
          <span>Faltas no semestre</span>
          <b>
            {summary.absentClasses}
            <small>{summary.absentClasses === 1 ? 'aula' : 'aulas'}</small>
          </b>
          <em>De {plural(summary.allowedAbsentClasses, 'aula permitida', 'aulas permitidas')} no total</em>
        </div>
        <div className={`gr-st${summary.atRiskCourses > 0 ? ' gr-st--alerta' : ''}`}>
          <span>Em risco</span>
          <b>
            {summary.atRiskCourses}
            <small>{summary.atRiskCourses === 1 ? 'disciplina' : 'disciplinas'}</small>
          </b>
          <em>{riskSummary(data.courses)}</em>
        </div>
      </div>

      <section className="gr-cartao" aria-labelledby="gr-titulo">
        <div className="gr-cartao__topo">
          <h2 id="gr-titulo">Por disciplina</h2>
          {estimate ? <Chip tone="neutral">Estimativa</Chip> : null}
        </div>
        <ul className="gr-lista" aria-labelledby="gr-titulo">
          {sortByRisk(data.courses).map((course) => (
            <Row key={course.courseId} course={course} />
          ))}
        </ul>
        <p className="gr-pe">
          {plural(data.courses.length, 'disciplina', 'disciplinas')} · limite de 25% da carga horária · frequência do SIGAA, em aulas
          {estimate ? ' · a frequência de alguma disciplina ainda não foi lançada por inteiro: as aulas que faltam lançar podem virar falta' : ''}
        </p>
      </section>
    </>
  );
}
