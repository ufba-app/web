import { programDetails, programTitle } from './programLabel';

const full = {
  programName: 'ENGENHARIA DA COMPUTAÇÃO/EPOLI - SALVADOR - BACHARELADO - PRESENCIAL - N',
  programLabel: { name: 'Engenharia da Computação', unit: 'EPOLI', campus: 'Salvador', degree: 'Bacharelado', modality: 'Presencial', shift: 'Noturno' },
};

describe('programLabel', () => {
  it('o título é o nome separado pela API; os detalhes seguem a ordem do histórico', () => {
    expect(programTitle(full)).toBe('Engenharia da Computação');
    expect(programDetails(full)).toEqual(['EPOLI', 'Salvador', 'Bacharelado', 'Presencial', 'Noturno']);
  });

  it('formato parcial: só os pedaços que existem', () => {
    const partial = { programName: 'MEDICINA - SALVADOR', programLabel: { name: 'Medicina', unit: null, campus: 'Salvador', degree: null, modality: null, shift: null } };
    expect(programTitle(partial)).toBe('Medicina');
    expect(programDetails(partial)).toEqual(['Salvador']);
  });

  it('formato cru (nada reconhecido): o título é o texto original e não há detalhes', () => {
    const raw = { programName: 'CURSO ESTRANHO', programLabel: { name: 'CURSO ESTRANHO', unit: null, campus: null, degree: null, modality: null, shift: null } };
    expect(programTitle(raw)).toBe('CURSO ESTRANHO');
    expect(programDetails(raw)).toEqual([]);
  });

  it('sem o objeto ou com nome vazio, volta ao texto cru: o curso nunca some', () => {
    expect(programTitle({ programName: 'ODONTOLOGIA' })).toBe('ODONTOLOGIA');
    expect(programTitle({ programName: 'ODONTOLOGIA', programLabel: { ...full.programLabel, name: '  ' } })).toBe('ODONTOLOGIA');
    expect(programDetails({ programName: 'ODONTOLOGIA' })).toEqual([]);
  });
});
