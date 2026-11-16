import type { Attendance, AttendanceCourse, AttendanceStatus } from '../../contract';

/** O texto da situação (a cor nunca fala sozinha). `failed` = passou do limite de 25% de faltas. */
export const STATUS_LABEL: Record<AttendanceStatus, string> = { ok: 'Em dia', at_risk: 'No limite', failed: 'Acima do limite' };

const RISK_ORDER: Record<AttendanceStatus, number> = { failed: 0, at_risk: 1, ok: 2 };

/** Mais arriscadas primeiro (acima do limite, no limite, em dia); dentro de cada grupo, por nome. */
export function sortByRisk(courses: AttendanceCourse[]): AttendanceCourse[] {
  return [...courses].sort((a, b) => RISK_ORDER[a.status] - RISK_ORDER[b.status] || a.courseName.localeCompare(b.courseName, 'pt-BR'));
}

const classes = (count: number) => `${count} ${count === 1 ? 'aula' : 'aulas'}`;

/** Quantas faltas ainda cabem. A API manda NEGATIVO ao passar do limite; a tela mostra 0 (o excesso vai em `overLimit`). */
export const remaining = (course: AttendanceCourse): number => Math.max(course.remainingAbsentClasses, 0);

/** Quantas faltas passaram do limite (0 se não passou). */
export const overLimit = (course: AttendanceCourse): number => Math.max(-course.remainingAbsentClasses, 0);

/** Sem carga horária informada o limite é 0 e não há o que comparar: a tela não inventa situação. */
export const hasLimit = (course: AttendanceCourse): boolean => course.workloadClasses > 0;

/** "12 de 17 aulas": faltas contra o limite. */
export function absenceText(course: AttendanceCourse): string {
  if (!hasLimit(course)) return `${classes(course.absentClasses)} de falta`;
  return `${course.absentClasses} de ${classes(course.allowedAbsentClasses)}`;
}

/** A frase de apoio de cada disciplina. */
export function hint(course: AttendanceCourse): string | null {
  if (!hasLimit(course)) return 'O SIGAA não informou a carga horária desta disciplina.';
  if (course.status === 'failed') return `Passou ${classes(overLimit(course))} do limite de faltas.`;
  const left = remaining(course);
  if (course.status === 'at_risk') return left === 0 ? 'Não restam faltas. A próxima passa do limite.' : `Restam ${classes(left)} de falta.`;
  return null;
}

/** As disciplinas que pedem atenção, na frase do cartão "Em risco" ("Embriologia · restam 5 aulas"). */
export function riskSummary(courses: AttendanceCourse[]): string {
  const atRisk = sortByRisk(courses.filter((course) => course.status !== 'ok'));
  if (atRisk.length === 0) return 'Nenhuma no limite';
  return atRisk
    .map((course) => (course.status === 'failed' ? `${course.courseName} · passou do limite` : `${course.courseName} · restam ${classes(remaining(course))}`))
    .join('; ');
}

/** Alguma disciplina com frequência ainda não lançada por inteiro: os números são estimativa. */
export const hasEstimate = (data: Attendance): boolean => data.courses.some((course) => !course.complete);

/** Tiques da barra de faltas: um por falta permitida (até 40; acima disso a barra vira uma só, proporcional). */
export const MAX_TICKS = 40;
