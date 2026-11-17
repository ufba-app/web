import type { Attendance, AttendanceCourse } from './sources';

/**
 * DADOS FIXOS da frequência (GET /sources/sigaa/attendance, api#77): exemplo, nenhuma pessoa real. Tudo em AULAS; o limite é
 * 25% da carga horária (68 aulas, 17 faltas permitidas). `remainingAbsentClasses` é negativo ao passar do limite.
 */
const course = (id: string, name: string, present: number, recorded: number, overrides: Partial<AttendanceCourse> = {}): AttendanceCourse => {
  const workload = 68;
  const allowed = Math.floor(workload * 0.25);
  const absent = Math.max(recorded - present, 0);
  const remaining = allowed - absent;
  const status = absent > allowed ? 'failed' : remaining <= allowed / 3 ? 'at_risk' : 'ok';
  return {
    courseId: id,
    courseName: name,
    presentClasses: present,
    recordedClasses: recorded,
    workloadClasses: workload,
    absentClasses: absent,
    allowedAbsentClasses: allowed,
    remainingAbsentClasses: remaining,
    status,
    complete: true,
    ...overrides,
  };
};

export function attendanceFixture(overrides: Partial<Attendance> = {}): Attendance {
  const courses = [
    course('1', 'Anatomia', 26, 32),
    course('2', 'Embriologia', 20, 32),
    course('3', 'Histologia', 28, 32),
    course('4', 'Bioquímica', 29, 32),
    course('5', 'Saúde Coletiva', 30, 32),
  ];
  return {
    courses,
    summary: {
      absentClasses: courses.reduce((sum, item) => sum + item.absentClasses, 0),
      allowedAbsentClasses: courses.reduce((sum, item) => sum + item.allowedAbsentClasses, 0),
      atRiskCourses: courses.filter((item) => item.status !== 'ok').length,
    },
    ...overrides,
  };
}
