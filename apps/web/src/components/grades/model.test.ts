import { attendanceFixture } from '../../contract/attendanceFixture';
import { absenceText, hint, overLimit, remaining, riskSummary, sortByRisk, STATUS_LABEL } from './model';

const { courses } = attendanceFixture();
const byName = (name: string) => courses.find((course) => course.courseName === name)!;

describe('frequência · modelo', () => {
  it('os textos de situação (a cor nunca fala sozinha)', () => {
    expect(STATUS_LABEL).toEqual({ ok: 'Em dia', at_risk: 'No limite', failed: 'Acima do limite' });
  });

  it('a fixture segue a regra da API: 25% da carga, limite de 17 de 68 aulas', () => {
    expect(byName('Embriologia')).toMatchObject({ absentClasses: 12, allowedAbsentClasses: 17, remainingAbsentClasses: 5, status: 'at_risk' });
    expect(byName('Anatomia').status).toBe('ok');
  });

  it('ordena do mais arriscado para o menos, depois por nome', () => {
    const failed = { ...byName('Anatomia'), status: 'failed' as const, absentClasses: 20, remainingAbsentClasses: -3 };
    const order = sortByRisk([byName('Saúde Coletiva'), failed, byName('Embriologia'), byName('Bioquímica')]).map((course) => course.courseName);
    expect(order).toEqual(['Anatomia', 'Embriologia', 'Bioquímica', 'Saúde Coletiva']);
  });

  it('restam nunca é negativo; o excesso é contado à parte', () => {
    const over = { ...byName('Anatomia'), status: 'failed' as const, absentClasses: 20, remainingAbsentClasses: -3 };
    expect(remaining(over)).toBe(0);
    expect(overLimit(over)).toBe(3);
    expect(hint(over)).toBe('Passou 3 aulas do limite de faltas.');
    expect(remaining(byName('Embriologia'))).toBe(5);
    expect(overLimit(byName('Embriologia'))).toBe(0);
  });

  it('frases de apoio: no limite diz quantas faltas restam; em dia não diz nada', () => {
    expect(hint(byName('Embriologia'))).toBe('Restam 5 aulas de falta.');
    expect(hint({ ...byName('Embriologia'), remainingAbsentClasses: 1, status: 'at_risk' })).toBe('Restam 1 aula de falta.');
    expect(hint({ ...byName('Embriologia'), remainingAbsentClasses: 0, status: 'at_risk' })).toBe('Não restam faltas. A próxima passa do limite.');
    expect(hint(byName('Histologia'))).toBeNull();
  });

  it('"12 de 17 aulas"; sem carga horária, só as faltas e a explicação (sem inventar limite)', () => {
    expect(absenceText(byName('Embriologia'))).toBe('12 de 17 aulas');
    const noWorkload = { ...byName('Anatomia'), workloadClasses: 0, allowedAbsentClasses: 0, remainingAbsentClasses: 0, absentClasses: 0, status: 'ok' as const };
    expect(absenceText(noWorkload)).toBe('0 aulas de falta');
    expect(hint(noWorkload)).toMatch(/não informou a carga horária/);
  });

  it('o cartão "Em risco" cita cada disciplina com o que restou', () => {
    expect(riskSummary(courses)).toBe('Embriologia · restam 5 aulas');
    expect(riskSummary([byName('Histologia')])).toBe('Nenhuma no limite');
  });
});
