// números da avaliação no padrão brasileiro: 88,5 · 86,99 · 90 (sem ",00"); penalidade com o sinal de menos
// tipográfico; coeficiente com pelo menos 3 casas (0,870) e as que a nota pedir (0,8699)
const trim = (value: number, digits: number): string =>
  value
    .toFixed(digits)
    .replace(/\.?0+$/, '')
    .replace('.', ',');

export const formatGrade = (grade: number): string => trim(grade, 2);

export const formatPenalty = (penalty: number): string =>
  penalty === 0 ? '—' : `−${trim(Math.abs(penalty), 2)}`;

export function formatCoefficient(coefficient: number): string {
  const full = coefficient.toFixed(4);
  const short = coefficient.toFixed(3);
  return (Number(short) === Number(full) ? short : full).replace('.', ',');
}

export const formatOrdinal = (rank: number): string => `${rank}º`;
