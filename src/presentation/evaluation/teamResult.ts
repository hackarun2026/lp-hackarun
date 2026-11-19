// resultado de uma equipe na /avaliacao: monta o cartão com o que a função devolveu (só a nota daquela equipe). Tudo
// entra como texto (textContent), nunca como HTML: o resumo vem da planilha
import { CRITERIA, MAX_POINTS, coefficientOf, type CriterionKey } from '@domain/evaluation/Ranking';
import {
  formatCoefficient,
  formatGrade,
  formatOrdinal,
  formatPenalty,
} from '@presentation/formatters/evaluationFormat';

export interface TeamResult {
  rank: number;
  team: string;
  project: string;
  theme: string;
  scores: Record<CriterionKey, number>;
  sum: number;
  penalty: number;
  grade: number;
  finalist: boolean;
  summary: string;
  // análise da banca: justificativa de cada critério, pontos fortes e pontos de atenção (podem faltar)
  justifications?: Partial<Record<CriterionKey, string>>;
  strengths?: string[];
  attention?: string[];
}

function textList(title: string, items: string[] | undefined, className: string): HTMLElement | null {
  const list = (items ?? []).filter((s) => typeof s === 'string' && s.trim());
  if (!list.length) return null;
  const box = el('section', `ev-points ${className}`);
  const ul = el('ul', 'ev-points__list');
  list.forEach((s) => ul.append(el('li', '', s)));
  box.append(el('h4', 'ev-points__title', title), ul);
  return box;
}

export function isTeamResult(value: unknown): value is TeamResult {
  const r = value as Partial<TeamResult> | null;
  return (
    !!r &&
    typeof r.rank === 'number' &&
    typeof r.team === 'string' &&
    typeof r.grade === 'number' &&
    typeof r.sum === 'number' &&
    !!r.scores &&
    CRITERIA.every((c) => typeof r.scores?.[c.key] === 'number')
  );
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
}

// color: cor do tipo do Pokémon da equipe (vem da composição, que conhece o catálogo)
export function renderTeamResult(
  target: HTMLElement,
  result: TeamResult,
  total: number,
  color: string,
): void {
  target.replaceChildren();
  target.style.setProperty('--type', color);

  const card = el('article', 'ev-card', undefined, { 'data-ev-reveal': '' });
  const head = el('header', 'ev-card__head');
  const who = el('div', 'ev-card__who');
  who.append(
    el('p', 'ev-card__rank', `${formatOrdinal(result.rank)} lugar de ${total}`),
    el('h3', 'ev-card__team', `Equipe ${result.team}`, { 'data-ev-scramble': '' }),
    el('p', 'ev-card__project', result.project, { 'data-ev-scramble': '' }),
  );
  if (result.finalist) who.append(el('span', 'ev-badge', 'Finalista'));
  const grade = el('p', 'ev-card__grade');
  grade.append(
    el('strong', '', formatGrade(result.grade), { 'data-ev-number': '' }),
    el('small', '', `/${MAX_POINTS}`),
  );
  head.append(who, grade);

  const list = el('ul', 'ev-card__scores');
  CRITERIA.forEach((c) => {
    const score = result.scores[c.key];
    const item = el('li', 'ev-card__score', undefined, { style: `--share:${score / c.max}` });
    const value = el('span', 'ev-card__value');
    value.append(
      el('span', '', formatGrade(score), { 'data-ev-number': '' }),
      document.createTextNode(`/${c.max}`),
    );
    item.append(
      el('span', 'ev-card__label', c.name),
      value,
      el('span', 'ev-card__bar', undefined, { 'aria-hidden': 'true' }),
    );
    const why = result.justifications?.[c.key];
    if (typeof why === 'string' && why.trim()) item.append(el('p', 'ev-card__why', why));
    list.append(item);
  });

  const totals = el('dl', 'ev-card__totals');
  const pairs: [string, string][] = [['Soma dos critérios', `${formatGrade(result.sum)}/${MAX_POINTS}`]];
  if (result.penalty < 0) pairs.push(['Penalidade de prazo', formatPenalty(result.penalty)]);
  pairs.push(['Coeficiente', formatCoefficient(coefficientOf(result.grade))]);
  pairs.forEach(([label, value]) => {
    const row = el('div', '');
    row.append(el('dt', '', label), el('dd', '', value));
    totals.append(row);
  });

  const body = el('div', 'ev-card__body');
  if (result.theme) body.append(el('p', 'ev-more__theme', result.theme));
  if (result.summary) body.append(el('p', 'ev-more__summary', result.summary));

  const points = el('div', 'ev-card__points');
  [
    textList('Pontos fortes', result.strengths, 'ev-points--strong'),
    textList('Pontos de atenção', result.attention, 'ev-points--attention'),
  ].forEach((box) => box && points.append(box));

  card.append(head, list, totals, body);
  if (points.childElementCount) card.append(points);
  target.append(card);
}
