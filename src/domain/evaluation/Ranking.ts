import { DomainError } from '@domain/shared/DomainError';

// avaliação técnica dos projetos (entrega final, 14/11): cinco critérios oficiais somam 100 pontos e a penalidade de
// prazo é descontada da soma. A ordem já vem decidida pela banca (desempates inclusos); aqui só se confere a conta
export type CriterionKey = 'adherence' | 'implementation' | 'innovation' | 'ux' | 'pitch';

export interface Criterion {
  readonly key: CriterionKey;
  readonly name: string;
  // cabeçalho curto da tabela
  readonly short: string;
  readonly max: number;
}

export const CRITERIA: readonly Criterion[] = [
  { key: 'adherence', name: 'Resolução do problema e aderência ao desafio', short: 'Ader.', max: 25 },
  { key: 'implementation', name: 'Qualidade e funcionalidade da implementação', short: 'Impl.', max: 25 },
  { key: 'innovation', name: 'Inovação e viabilidade', short: 'Inov.', max: 20 },
  { key: 'ux', name: 'Experiência do usuário e clareza das telas', short: 'UX', max: 15 },
  { key: 'pitch', name: 'Apresentação e pitch', short: 'Pitch', max: 15 },
];

export const MAX_POINTS = 100;
export const FINALISTS = 7;

export interface EvaluatedProject {
  readonly rank: number;
  readonly team: string;
  readonly project: string;
  readonly theme: string;
  readonly finalist: boolean;
  readonly scores: Readonly<Record<CriterionKey, number>>;
  readonly sum: number;
  // zero ou negativo (pontos descontados)
  readonly penalty: number;
  readonly grade: number;
  readonly summary: string;
  // ajuste interno da coordenação (ex.: desempate), já embutido na nota e não mostrado na página
  readonly adjustment?: number;
}

const EPSILON = 1e-9;
const blank = (text: string): boolean => text.trim().length === 0;

// busca sem acento e sem diferença de maiúscula ("acho" acha "Achô")
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function matchesQuery(project: Pick<EvaluatedProject, 'team' | 'project'>, query: string): boolean {
  const needle = normalizeSearch(query);
  if (needle === '') return true;
  return normalizeSearch(`${project.team} ${project.project}`).includes(needle);
}

// coeficiente = nota / 100
export const coefficientOf = (grade: number): number => grade / MAX_POINTS;

function check(project: EvaluatedProject, index: number): void {
  const where = `posição ${index + 1}`;
  if (project.rank !== index + 1) throw new DomainError(`Classificação fora de ordem na ${where}.`);
  if (blank(project.team) || blank(project.project) || blank(project.theme) || blank(project.summary)) {
    throw new DomainError(`Equipe, projeto, tema e resumo são obrigatórios (${where}).`);
  }
  let total = 0;
  for (const criterion of CRITERIA) {
    const score = project.scores[criterion.key];
    if (!Number.isInteger(score) || score < 0 || score > criterion.max) {
      throw new DomainError(`${criterion.name} fora de 0 a ${criterion.max} (${project.team}).`);
    }
    total += score;
  }
  if (total !== project.sum) throw new DomainError(`A soma dos critérios não fecha (${project.team}).`);
  if (project.penalty > 0) throw new DomainError(`Penalidade não pode somar pontos (${project.team}).`);
  const adjustment = project.adjustment ?? 0;
  if (adjustment > 0) throw new DomainError(`Ajuste não pode somar pontos (${project.team}).`);
  if (Math.abs(project.sum + project.penalty + adjustment - project.grade) > EPSILON) {
    throw new DomainError(`Nota diferente de soma menos penalidade e ajuste (${project.team}).`);
  }
}

export class Ranking {
  private constructor(readonly projects: readonly EvaluatedProject[]) {}

  static create(projects: readonly EvaluatedProject[]): Ranking {
    if (projects.length === 0) throw new DomainError('A classificação está vazia.');
    projects.forEach(check);
    const teams = new Set<string>();
    projects.forEach((project, index) => {
      const key = normalizeSearch(project.team);
      if (teams.has(key)) throw new DomainError(`Equipe repetida na classificação: ${project.team}.`);
      teams.add(key);
      const next = projects[index + 1];
      if (next && next.grade > project.grade + EPSILON) {
        throw new DomainError(`${next.team} tem nota maior que ${project.team}, mas está abaixo.`);
      }
      if (project.finalist !== index < FINALISTS) {
        throw new DomainError(`As finalistas são as ${FINALISTS} primeiras (${project.team}).`);
      }
    });
    return new Ranking(projects);
  }

  get finalists(): readonly EvaluatedProject[] {
    return this.projects.filter((project) => project.finalist);
  }

  search(query: string): readonly EvaluatedProject[] {
    return this.projects.filter((project) => matchesQuery(project, query));
  }
}
