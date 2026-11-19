// cartão do resultado: mostra a análise da banca como texto (nunca HTML) e esconde o que não veio
import { describe, expect, it } from 'vitest';
import { renderTeamResult, type TeamResult } from '@presentation/evaluation/teamResult';

const base: TeamResult = {
  rank: 8,
  team: 'Hypno',
  project: 'Raiz',
  theme: 'Tema',
  scores: { adherence: 23, implementation: 20, innovation: 17, ux: 13.99, pitch: 13 },
  sum: 86.99,
  penalty: 0,
  grade: 86.99,
  finalist: false,
  summary: 'Resumo.',
};

const render = (result: TeamResult) => {
  const target = document.createElement('div');
  renderTeamResult(target, result, 47, '#f0f');
  return target;
};

describe('cartão do resultado da avaliação', () => {
  it('nota decimal do critério e a soma no padrão brasileiro', () => {
    const text = render(base).textContent ?? '';
    expect(text).toContain('13,99/15');
    expect(text).toContain('86,99/100');
  });

  it('justificativa embaixo do critério e listas de pontos fortes e de atenção', () => {
    const card = render({
      ...base,
      justifications: { ux: 'Telas <b>claras</b>.' },
      strengths: ['Forte A', 'Forte B'],
      attention: ['Atenção A'],
    });
    const why = card.querySelectorAll('.ev-card__why');
    expect(why).toHaveLength(1);
    expect(why[0]?.textContent).toBe('Telas <b>claras</b>.');
    expect(card.querySelector('b')).toBeNull();
    expect([...card.querySelectorAll('.ev-points--strong li')].map((li) => li.textContent)).toEqual([
      'Forte A',
      'Forte B',
    ]);
    expect(card.querySelectorAll('.ev-points--attention li')).toHaveLength(1);
  });

  it('sem análise (resposta antiga) o cartão não ganha blocos vazios', () => {
    const card = render({ ...base, strengths: [], attention: ['  '] });
    expect(card.querySelector('.ev-card__why')).toBeNull();
    expect(card.querySelector('.ev-card__points')).toBeNull();
  });
});
