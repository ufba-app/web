/** O curso separado pela API (`summary.programLabel`, api#50), só o que a tela usa. */
export type ProgramLabelParts = {
  name: string;
  unit: string | null;
  campus: string | null;
  degree: string | null;
  modality: string | null;
  shift: string | null;
};

type WithProgram = { programName: string; programLabel?: ProgramLabelParts | null };

const clean = (text: string | null | undefined) => (text ?? '').trim();

/**
 * O título do curso: `programLabel.name` ("Engenharia da Computação"). Se faltar (nome vazio) ou a resposta vier sem o
 * objeto, volta ao texto cru do histórico (`programName`): o curso nunca some.
 */
export function programTitle(summary: WithProgram): string {
  return clean(summary.programLabel?.name) || clean(summary.programName);
}

/**
 * Os detalhes, na ordem do histórico: unidade, campus, grau, modalidade e turno. Só os pedaços que existem; vazio quando
 * nada foi reconhecido (aí o título já é o texto original e não há o que repetir).
 */
export function programDetails(summary: WithProgram): string[] {
  const label = summary.programLabel;
  if (!label) return [];
  return [label.unit, label.campus, label.degree, label.modality, label.shift].map(clean).filter(Boolean);
}
