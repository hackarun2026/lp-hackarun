// consulta da avaliação técnica na função do site: quem consegue ver, o que volta, freios e fila
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  handleEvaluation,
  IP_MAX_FAILURES,
  TEAM_MAX_FAILURES,
  teamKey,
  type EvaluationDeps,
} from '../../../src/server/avaliacao/handler';
import { ConsultQueue } from '../../../src/server/avaliacao/queue';
import { MemoryAttemptStore } from '../../../src/server/sorteio/attempts';

const ORIGIN = 'https://hackarun.com.br';
const ENV = {
  SORTEIO_TOKEN: 'k'.repeat(40),
  PUBLIC_REGISTRATION_ENDPOINT: 'https://script.google.com/macros/s/x/exec',
};
const RESULT = { rank: 8, team: 'Hypno', grade: 86.99, summary: 'Resumo.' };

class MapCache {
  readonly store = new Map<string, string>();
  match = (r: Request) =>
    Promise.resolve(this.store.has(r.url) ? new Response(this.store.get(r.url)) : undefined);
  put = async (r: Request, res: Response) => void this.store.set(r.url, await res.text());
}

function harness(
  reply: (body: Record<string, unknown>) => unknown = () => ({ ok: true, total: 47, result: RESULT }),
) {
  const upstream = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify(reply(body)));
  });
  const deps: EvaluationDeps = {
    fetch: upstream as unknown as typeof fetch,
    cache: new MapCache(),
    attempts: new MemoryAttemptStore(),
    sleep: () => Promise.resolve(),
    queue: new ConsultQueue(4, 1000),
  };
  const ask = (fields: unknown, init: { origin?: string | null; ip?: string; env?: typeof ENV } = {}) => {
    const headers: Record<string, string> = { 'CF-Connecting-IP': init.ip ?? '1.1.1.1' };
    if (init.origin !== null) headers['Origin'] = init.origin ?? ORIGIN;
    return handleEvaluation(
      new Request(`${ORIGIN}/api/avaliacao`, { method: 'POST', headers, body: JSON.stringify(fields) }),
      init.env ?? ENV,
      deps,
    );
  };
  return { upstream, deps, ask };
}

const read = async (res: Response) => (await res.json()) as Record<string, unknown>;

describe('consulta da avaliação técnica', () => {
  it('normaliza o nome da equipe igual ao Apps Script', () => {
    expect(teamKey('  Equipe HYPNÔ ')).toBe('hypno');
    expect(teamKey('hypno')).toBe('hypno');
  });

  it('integrante certo recebe a nota da equipe, e a chave nunca volta', async () => {
    const { ask, upstream } = harness();
    const res = await ask({ team: 'Equipe Hypno', email: ' Ana@Exemplo.com ' });
    expect(res.status).toBe(200);
    expect(await read(res)).toEqual({ ok: true, total: 47, result: RESULT });
    const sent = JSON.parse(String(upstream.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(sent).toMatchObject({ action: 'evaluation-lookup', team: 'hypno', email: 'ana@exemplo.com' });
  });

  it('sem Origin do próprio site, outro método ou corpo inválido não chama a planilha', async () => {
    const { ask, upstream } = harness();
    expect((await ask({ team: 'x', email: 'a@b.c' }, { origin: null })).status).toBe(403);
    expect((await ask({ team: 'x', email: 'a@b.c' }, { origin: 'https://outro.site' })).status).toBe(403);
    expect((await ask({ team: '', email: 'a@b.c' })).status).toBe(400);
    expect((await ask({ team: 'x', email: 'sem-arroba' })).status).toBe(400);
    expect((await ask(['lista'])).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('sem a chave configurada fica indisponível', async () => {
    const { ask } = harness();
    expect(
      (await ask({ team: 'x', email: 'a@b.c' }, { env: { ...ENV, SORTEIO_TOKEN: 'curta' } })).status,
    ).toBe(503);
  });

  it('erro de equipe ou e-mail é a mesma resposta genérica e conta como tentativa', async () => {
    const { ask } = harness(() => ({ ok: false, error: 'not-found' }));
    const res = await ask({ team: 'Hypno', email: 'errado@x.com' });
    expect(res.status).toBe(401);
    expect(await read(res)).toEqual({ ok: false, error: 'not-found' });
  });

  it(`trava a equipe depois de ${TEAM_MAX_FAILURES} erros, sem chamar mais a planilha`, async () => {
    const { ask, upstream } = harness(() => ({ ok: false, error: 'not-found' }));
    for (let i = 0; i < TEAM_MAX_FAILURES; i++) {
      await ask({ team: 'Hypno', email: `e${i}@x.com` }, { ip: `10.0.0.${i}` });
    }
    const calls = upstream.mock.calls.length;
    expect((await ask({ team: 'Hypno', email: 'certo@x.com' }, { ip: '9.9.9.9' })).status).toBe(429);
    expect(upstream.mock.calls.length).toBe(calls);
  });

  it(`trava o IP depois de ${IP_MAX_FAILURES} erros (em equipes diferentes)`, async () => {
    const { ask } = harness(() => ({ ok: false, error: 'not-found' }));
    for (let i = 0; i < IP_MAX_FAILURES; i++) await ask({ team: `time ${i}`, email: 'a@x.com' });
    expect((await ask({ team: 'outro', email: 'a@x.com' })).status).toBe(429);
  });

  it('a mesma consulta de novo vem guardada, sem chamar a planilha', async () => {
    const { ask, upstream } = harness();
    await ask({ team: 'Hypno', email: 'ana@exemplo.com' });
    const again = await ask({ team: 'equipe hypno', email: 'ANA@exemplo.com' });
    expect(again.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('planilha fora do ar responde indisponível, sem contar como erro de quem consultou', async () => {
    const { ask, deps } = harness(() => ({ ok: false, error: 'server' }));
    const res = await ask({ team: 'Hypno', email: 'ana@exemplo.com' });
    expect(res.status).toBe(503);
    expect(await deps.attempts.failures('avaliacao-equipe|hypno')).toBe(0);
  });
});

describe('fila de consultas', () => {
  it('roda no máximo N ao mesmo tempo e atende os demais em ordem', async () => {
    const queue = new ConsultQueue(2, 10_000);
    let active = 0;
    let peak = 0;
    const order: number[] = [];
    const task = (id: number) => async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      order.push(id);
      active--;
      return id;
    };
    const results = await Promise.all([1, 2, 3, 4, 5].map((id) => queue.run(task(id))));
    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
    expect(order.slice(2)).toEqual([3, 4, 5]);
  });

  it('quem espera demais sai da fila com null e a tarefa não roda', async () => {
    const queue = new ConsultQueue(1, 10);
    let release: () => void = () => undefined;
    const first = queue.run(() => new Promise<string>((r) => (release = () => r('a'))));
    const late = vi.fn(() => Promise.resolve('b'));
    expect(await queue.run(late)).toBeNull();
    expect(late).not.toHaveBeenCalled();
    expect(queue.pending).toBe(0);
    release();
    expect(await first).toBe('a');
  });

  it('fila cheia na função responde ocupado com Retry-After', async () => {
    const { deps, ask } = harness();
    // nenhuma vaga livre: a consulta espera 5 ms e desiste
    deps.queue = new ConsultQueue(0, 5);
    const res = await ask({ team: 'Hypno', email: 'ana@exemplo.com' });
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('3');
    expect(await read(res)).toEqual({ ok: false, error: 'busy' });
  });
});
