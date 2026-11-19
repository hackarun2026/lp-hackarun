// composition root da /avaliacao no navegador: a cor do cartão do resultado é a do tipo principal do Pokémon da equipe
import pokemon from '@infrastructure/content/pokemon.json';
import { typeColor } from '@presentation/formatters/pokemonTypes';

export function teamTypeColor(team: string): string {
  const name = team.trim().toLowerCase();
  return typeColor(pokemon.find((p) => p.name.toLowerCase() === name)?.types ?? []);
}
