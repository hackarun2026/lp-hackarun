// consulta da nota no navegador: fila cheia tenta de novo sozinha; erro de identificação não insiste
import { describe, expect, it, vi } from 'vitest';
import { consult, RETRY_DELAYS_MS } from '@presentation/evaluation/consult';
import { isTeamResult } from '@presentation/evaluation/teamResult';

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function deps(responses: Response[]) {
  const fetch = vi.fn(() => Promise.resolve(responses.shift() ?? reply(503, { ok: false })));
  const onQueue = vi.fn();
  return {
    fetch: fetch as unknown as typeof globalThis.fetch,
    wait: () => Promise.resolve(),
    onQueue,
    calls: fetch,
  };
}

describe('consulta da avaliação no navegador', () => {
  it('fila cheia: espera e tenta de novo até conseguir', async () => {
    const d = deps([
      reply(503, { error: 'busy' }),
      reply(503, { error: 'busy' }),
      reply(200, { ok: true, total: 47, result: { x: 1 } }),
    ]);
    const outcome = await consult('Hypno', 'a@b.com', d);
    expect(outcome).toEqual({ kind: 'ok', total: 47, result: { x: 1 } });
    expect(d.onQueue).toHaveBeenCalledTimes(2);
  });

  it('desiste depois de todas as tentativas', async () => {
    const d = deps([]);
    expect((await consult('Hypno', 'a@b.com', d)).kind).toBe('unavailable');
    expect(d.calls).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1);
  });

  it.each([
    [401, 'not-found'],
    [429, 'rate-limited'],
    [400, 'invalid'],
  ])('resposta %i (%s) não tenta de novo', async (status, kind) => {
    const d = deps([reply(status, { ok: false })]);
    expect((await consult('Hypno', 'a@b.com', d)).kind).toBe(kind);
    expect(d.calls).toHaveBeenCalledTimes(1);
  });

  it('só aceita um resultado completo', () => {
    const scores = { adherence: 1, implementation: 1, innovation: 1, ux: 1, pitch: 1 };
    expect(isTeamResult({ rank: 1, team: 'A', grade: 5, sum: 5, scores })).toBe(true);
    expect(isTeamResult({ rank: 1, team: 'A', grade: 5, sum: 5, scores: { ...scores, pitch: '1' } })).toBe(
      false,
    );
    expect(isTeamResult(null)).toBe(false);
  });
});
