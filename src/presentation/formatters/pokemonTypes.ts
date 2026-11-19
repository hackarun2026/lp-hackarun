// tipos dos Pokémon: a cor do brilho do card e o nome em português. Usado no telão do sorteio e na página /equipes
// cor do brilho do card pelo tipo do Pokémon (o primeiro tipo manda)
const TYPE_COLORS: Record<string, string> = {
  fire: '#ff6b3d',
  water: '#3d8bff',
  grass: '#3ddc84',
  electric: '#ffd23d',
  psychic: '#ff5fa2',
  ice: '#7fe7ff',
  dragon: '#7b5cff',
  dark: '#8a7560',
  fairy: '#ff9de1',
  normal: '#d0d0d8',
  fighting: '#e0574f',
  poison: '#b45cff',
  ground: '#d9a25c',
  flying: '#8ab4ff',
  bug: '#9bd34a',
  rock: '#c2ac74',
  ghost: '#8c7bdc',
  steel: '#a7bbcf',
};

export function typeColor(types: readonly string[]): string {
  return TYPE_COLORS[types[0] ?? ''] ?? '#00e5ff';
}

export const TYPE_LABELS: Record<string, string> = {
  fire: 'Fogo',
  water: 'Água',
  grass: 'Planta',
  electric: 'Elétrico',
  psychic: 'Psíquico',
  ice: 'Gelo',
  dragon: 'Dragão',
  dark: 'Sombrio',
  fairy: 'Fada',
  normal: 'Normal',
  fighting: 'Lutador',
  poison: 'Venenoso',
  ground: 'Terra',
  flying: 'Voador',
  bug: 'Inseto',
  rock: 'Pedra',
  ghost: 'Fantasma',
  steel: 'Aço',
};

export const typeLabel = (type: string): string => TYPE_LABELS[type] ?? type;

// card da página /equipes: a cor do tipo vira a variável --type
export const mascotStyle = (types: readonly string[]): string => `--type: ${typeColor(types)}`;

// um tipo diferente para cada item quando der (ex.: os cartões das finalistas): quem tem menos tipos escolhe primeiro,
// cada um pega o primeiro tipo ainda livre; sem tipo livre, fica com o principal
export function distinctTypes(
  items: readonly { key: string; types: readonly string[] }[],
): Map<string, string> {
  const used = new Set<string>();
  const picked = new Map<string, string>();
  [...items]
    .sort((a, b) => a.types.length - b.types.length)
    .forEach((item) => {
      const type = item.types.find((t) => !used.has(t)) ?? item.types[0] ?? '';
      used.add(type);
      picked.set(item.key, type);
    });
  return picked;
}
