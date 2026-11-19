// avaliação técnica no Apps Script (Evaluation.gs): só com a chave, só para quem é da equipe e só a nota dela
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AppsScriptSandbox } from '../../helpers/apps-script/sandbox';
import { PEOPLE, TOKEN } from '../../helpers/apps-script/feedbackSetup';

const HEADERS = [
  'Posição',
  'Equipe',
  'Projeto',
  'Tema',
  'Aderência',
  'Implementação',
  'Inovação',
  'UX',
  'Pitch',
  'Soma',
  'Penalidade',
  'Nota',
  'Finalista',
  'Resumo',
  'Justificativa Aderência',
  'Justificativa Implementação',
  'Justificativa Inovação',
  'Justificativa UX',
  'Justificativa Pitch',
  'Pontos fortes',
  'Pontos de atenção',
];

function setup() {
  const script = new AppsScriptSandbox();
  script.seed(PEOPLE);
  script.properties['SORTEIO_TOKEN'] = TOKEN;
  const sheet = script.book.insertSheet('Avaliação técnica');
  sheet.appendRow(HEADERS);
  sheet.appendRow([
    1,
    'Equipe Mew',
    'App Mew',
    'Tema A',
    23,
    22,
    16,
    13,
    13,
    87,
    0,
    87,
    'sim',
    'Resumo Mew.',
    'Ader Mew.',
    'Impl Mew.',
    'Inov Mew.',
    'UX Mew.',
    'Pitch Mew.',
    'Forte 1\n Forte 2 \n',
    'Atenção 1',
  ]);
  sheet.appendRow([
    2,
    'Equipe Onix',
    'App Onix',
    'Tema B',
    23,
    20,
    17,
    14,
    13,
    87,
    0,
    86.99,
    'não',
    'Resumo Onix.',
  ]);
  const lookup = (team: unknown, email: unknown, token = TOKEN) =>
    script.post({ action: 'evaluation-lookup', token, team, email }) as unknown as Record<string, unknown> & {
      result?: Record<string, unknown>;
    };
  return { script, lookup };
}

describe('Apps Script · avaliação técnica', () => {
  it('sem a chave certa não responde', () => {
    expect(setup().lookup('Equipe Mew', 'hr26-aaaaaa@exemplo.com', 'errada').error).toBe('unauthorized');
  });

  it('integrante da equipe recebe só a nota da própria equipe, sem e-mails', () => {
    const res = setup().lookup('Equipe Mew', 'hr26-aaaaaa@exemplo.com');
    expect(res.ok).toBe(true);
    expect(res['total']).toBe(2);
    expect(res.result).toMatchObject({
      rank: 1,
      team: 'Mew',
      grade: 87,
      finalist: true,
      summary: 'Resumo Mew.',
    });
    const text = JSON.stringify(res);
    expect(text).not.toContain('Onix');
    expect(text).not.toContain('@exemplo.com');
  });

  it('devolve a análise (justificativas e listas, uma linha por item); sem as colunas, vem vazia', () => {
    const { lookup } = setup();
    expect(lookup('Mew', 'hr26-aaaaaa@exemplo.com').result).toMatchObject({
      justifications: {
        adherence: 'Ader Mew.',
        implementation: 'Impl Mew.',
        innovation: 'Inov Mew.',
        ux: 'UX Mew.',
        pitch: 'Pitch Mew.',
      },
      strengths: ['Forte 1', 'Forte 2'],
      attention: ['Atenção 1'],
    });
    const onix = lookup('Onix', 'hr26-dddddd@exemplo.com').result;
    expect(onix?.['strengths']).toEqual([]);
    expect(onix?.['justifications']).toMatchObject({ adherence: '' });
  });

  it('aceita o nome com ou sem "Equipe", com acento/caixa diferentes, e e-mail com espaços', () => {
    const { lookup } = setup();
    expect(lookup(' mew ', ' HR26-AAAAAA@exemplo.com ').ok).toBe(true);
    expect(lookup('EQUIPE MEW', 'hr26-bbbbbb@exemplo.com').ok).toBe(true);
    expect(lookup('Onix', 'hr26-dddddd@exemplo.com').result?.['grade']).toBe(86.99);
  });

  it('e-mail de outra equipe, cancelado ou desconhecido não abre nada (mesma resposta)', () => {
    const { lookup } = setup();
    for (const [team, email] of [
      ['Equipe Onix', 'hr26-aaaaaa@exemplo.com'],
      ['Equipe Mew', 'hr26-eeeeee@exemplo.com'],
      ['Equipe Mew', 'ninguem@exemplo.com'],
      ['', ''],
      [null, 42],
    ]) {
      const res = lookup(team, email);
      expect(res).toEqual({ ok: false, error: 'not-found' });
    }
  });

  it('sem a aba de notas responde erro de servidor, sem vazar nada', () => {
    const { script, lookup } = setup();
    script.book.sheets.splice(
      script.book.sheets.findIndex((s) => s.name === 'Avaliação técnica'),
      1,
    );
    expect(lookup('Equipe Mew', 'hr26-aaaaaa@exemplo.com')).toEqual({ ok: false, error: 'server' });
  });
});
