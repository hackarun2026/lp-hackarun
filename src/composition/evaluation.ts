// composition root da avaliação técnica (/avaliacao): entrega a classificação já conferida e a cor de cada finalista
// (o tipo do Pokémon da equipe, um diferente por cartão). Um dado inválido no JSON interrompe o build
import data from '@infrastructure/content/evaluation.json';
import pokemon from '@infrastructure/content/pokemon.json';
import { Ranking, type EvaluatedProject } from '@domain/evaluation/Ranking';
import { distinctTypes, typeColor } from '@presentation/formatters/pokemonTypes';

export function evaluationRanking(): Ranking {
  return Ranking.create(data.teams as EvaluatedProject[]);
}

const typesOf = (team: string): readonly string[] =>
  pokemon.find((p) => p.name.toLowerCase() === team.toLowerCase())?.types ?? [];

// equipe → cor do cartão
export function finalistColors(ranking: Ranking): Map<string, string> {
  const picked = distinctTypes(ranking.finalists.map((p) => ({ key: p.team, types: typesOf(p.team) })));
  return new Map([...picked].map(([team, type]) => [team, typeColor([type])]));
}
