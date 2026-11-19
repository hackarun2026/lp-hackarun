// composition root da avaliação técnica (/avaliacao): entrega a classificação já conferida. Um dado inválido no JSON
// interrompe o build, porque a página é montada a partir daqui
import data from '@infrastructure/content/evaluation.json';
import { Ranking, type EvaluatedProject } from '@domain/evaluation/Ranking';

export function evaluationRanking(): Ranking {
  return Ranking.create(data.teams as EvaluatedProject[]);
}
