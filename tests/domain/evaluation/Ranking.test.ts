import { describe, expect, it } from 'vitest';
import {
  CRITERIA,
  FINALISTS,
  MAX_POINTS,
  Ranking,
  coefficientOf,
  matchesQuery,
  type EvaluatedProject,
} from '@domain/evaluation/Ranking';
import { distinctTypes } from '@presentation/formatters/pokemonTypes';
import { scrambleFrame } from '@presentation/evaluation/scramble';
import { formatCoefficient, formatGrade, formatPenalty } from '@presentation/formatters/evaluationFormat';

function project(rank: number, over: Partial<EvaluatedProject> = {}): EvaluatedProject {
  return {
    rank,
    team: `Time ${rank}`,
    project: `Projeto ${rank}`,
    theme: 'Tema',
    finalist: rank <= FINALISTS,
    scores: { adherence: 20, implementation: 20, innovation: 15, ux: 10, pitch: 10 },
    sum: 75,
    penalty: 0,
    grade: 75,
    summary: 'Resumo.',
    ...over,
  };
}

const list = (n: number) => Array.from({ length: n }, (_, i) => project(i + 1));

describe('Ranking: regras da classificação', () => {
  it('os critérios oficiais somam 100 pontos', () => {
    expect(CRITERIA.reduce((acc, c) => acc + c.max, 0)).toBe(MAX_POINTS);
  });

  it('aceita uma classificação válida e separa as finalistas', () => {
    const ranking = Ranking.create(list(9));
    expect(ranking.finalists).toHaveLength(FINALISTS);
  });

  it('recusa lista vazia, posição pulada e equipe repetida', () => {
    expect(() => Ranking.create([])).toThrow();
    expect(() => Ranking.create([project(1), project(3)])).toThrow(/ordem/);
    expect(() => Ranking.create([project(1), project(2, { team: 'TIME 1' })])).toThrow(/repetida/);
  });

  it('recusa nota fora do critério, soma que não fecha e nota diferente de soma + penalidade', () => {
    const scores = { adherence: 26, implementation: 20, innovation: 15, ux: 10, pitch: 4 };
    expect(() => Ranking.create([project(1, { scores })])).toThrow(/Resolução/);
    expect(() => Ranking.create([project(1, { sum: 76 })])).toThrow(/soma/);
    expect(() => Ranking.create([project(1, { penalty: -0.5 })])).toThrow(/penalidade/);
    expect(() => Ranking.create([project(1, { penalty: 1, grade: 76 })])).toThrow(/somar/);
  });

  it('recusa quem tem nota maior abaixo de quem tem nota menor', () => {
    const lower = project(1, { penalty: -1, grade: 74 });
    expect(() => Ranking.create([lower, project(2)])).toThrow(/maior/);
  });

  it('recusa finalista fora das 7 primeiras', () => {
    const items = list(8).map((p) => (p.rank === 8 ? { ...p, finalist: true } : p));
    expect(() => Ranking.create(items)).toThrow(/finalistas/);
  });

  it('busca por equipe ou projeto ignora acento, caixa e espaços', () => {
    const p = { team: 'Persian', project: 'Achô' };
    expect(matchesQuery(p, '  ACHO ')).toBe(true);
    expect(matchesQuery(p, 'pers')).toBe(true);
    expect(matchesQuery(p, '')).toBe(true);
    expect(matchesQuery(p, 'golbat')).toBe(false);
  });
});

describe('formatação e efeito', () => {
  it('formata nota, penalidade e coeficiente no padrão brasileiro', () => {
    expect(formatGrade(90)).toBe('90');
    expect(formatGrade(88.5)).toBe('88,5');
    expect(formatGrade(86.99)).toBe('86,99');
    expect(formatPenalty(0)).toBe('—');
    expect(formatPenalty(-1.5)).toBe('−1,5');
    expect(formatPenalty(-0.01)).toBe('−0,01');
    expect(formatCoefficient(coefficientOf(87))).toBe('0,870');
    expect(formatCoefficient(coefficientOf(86.99))).toBe('0,8699');
    expect(formatCoefficient(coefficientOf(88.5))).toBe('0,885');
  });

  it('o embaralhar trava da esquerda para a direita e termina no texto certo', () => {
    const pick = () => '#';
    expect(scrambleFrame('86,99', 0, pick)).toBe('##,##');
    expect(scrambleFrame('Equipe Muk', 0.5, pick)).toBe('Equip# ###');
    expect(scrambleFrame('Equipe Muk', 1, pick)).toBe('Equipe Muk');
  });
});

describe('cores das finalistas', () => {
  it('cada finalista ganha um tipo diferente; quem tem um tipo só escolhe primeiro', () => {
    const picked = distinctTypes([
      { key: 'Golbat', types: ['poison', 'flying'] },
      { key: 'Nidoking', types: ['poison', 'ground'] },
      { key: 'Muk', types: ['poison'] },
    ]);
    expect(Object.fromEntries(picked)).toEqual({ Muk: 'poison', Golbat: 'flying', Nidoking: 'ground' });
  });
});
