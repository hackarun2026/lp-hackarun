// consulta da avaliação técnica (/api/avaliacao): a equipe manda o nome da equipe e o e-mail de um integrante; a
// planilha confere e devolve só a nota daquela equipe. As notas nunca ficam no site público. Freios: limite de erros
// por IP e por equipe, fila de consultas ao Apps Script e resposta guardada 10 min (a mesma equipe consultando de novo
// não chama a planilha). Só imports relativos (a função da Cloudflare não usa os aliases do Astro)
import { TOKEN_MIN, validEndpoint } from '../sorteio/config';
import type { AttemptStore } from '../sorteio/attempts';
import type { EdgeCache } from '../equipes/proxy';
import { ConsultQueue } from './queue';

export interface EvaluationEnv {
  SORTEIO_TOKEN?: string;
  SORTEIO_PLANILHA_URL?: string;
  PUBLIC_REGISTRATION_ENDPOINT?: string;
}

export interface EvaluationDeps {
  fetch: typeof fetch;
  cache: EdgeCache | null;
  attempts: AttemptStore;
  sleep(ms: number): Promise<void>;
  queue?: ConsultQueue;
}

export const EVALUATION_API = '/api/avaliacao';
// a turma inteira pode sair pelo mesmo Wi-Fi: o freio por IP é alto; por equipe, quem erra o e-mail várias vezes
export const IP_MAX_FAILURES = 60;
export const TEAM_MAX_FAILURES = 10;
export const QUEUE_LIMIT = 4;
export const QUEUE_MAX_WAIT_MS = 15_000;
const RESULT_CACHE_SECONDS = 10 * 60;
const FAILURE_DELAY_MS = 400;
const UPSTREAM_TIMEOUT_MS = 25_000;
const MAX_BODY_BYTES = 2 * 1024;

const sharedQueue = new ConsultQueue(QUEUE_LIMIT, QUEUE_MAX_WAIT_MS);

export const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max).trim() : '');

// mesma regra do Evaluation.gs: "Equipe Hypno" = "hypno"
export function teamKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\s*equipe\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Upstream = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

async function askSheet(endpoint: string, token: string, team: string, email: string, deps: EvaluationDeps) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await deps.fetch(endpoint, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'evaluation-lookup', token, team, email }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, error: 'unavailable' } as Upstream;
    const parsed = (await response.json()) as Record<string, unknown>;
    if (parsed['ok'] === true && parsed['result']) return { ok: true, body: parsed } as Upstream;
    return { ok: false, error: parsed['error'] === 'not-found' ? 'not-found' : 'unavailable' } as Upstream;
  } catch {
    return { ok: false, error: 'unavailable' } as Upstream;
  } finally {
    clearTimeout(timer);
  }
}

export async function handleEvaluation(
  request: Request,
  env: EvaluationEnv,
  deps: EvaluationDeps,
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method' });
  const origin = request.headers.get('Origin');
  if (origin === null || origin !== new URL(request.url).origin)
    return json(403, { ok: false, error: 'forbidden' });
  const token = (env.SORTEIO_TOKEN ?? '').trim();
  const endpoint = (
    (env.SORTEIO_PLANILHA_URL ?? '').trim() ||
    (env.PUBLIC_REGISTRATION_ENDPOINT ?? '')
  ).trim();
  if (token.length < TOKEN_MIN || !validEndpoint(endpoint))
    return json(503, { ok: false, error: 'unavailable' });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { ok: false, error: 'too-large' });
  let fields: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
    fields = parsed as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: 'bad-request' });
  }
  const team = teamKey(text(fields['team'], 80));
  const email = text(fields['email'], 200).toLowerCase();
  if (!team || !email.includes('@')) return json(400, { ok: false, error: 'bad-request' });

  const ipKey = `avaliacao-ip|${request.headers.get('CF-Connecting-IP') ?? 'local'}`;
  const teamKeyId = `avaliacao-equipe|${team}`;
  const [ipFailures, teamFailures] = await Promise.all([
    deps.attempts.failures(ipKey),
    deps.attempts.failures(teamKeyId),
  ]);
  if (ipFailures >= IP_MAX_FAILURES || teamFailures >= TEAM_MAX_FAILURES) {
    return json(429, { ok: false, error: 'rate-limited' });
  }

  const cacheKey = new Request(
    `https://avaliacao-cache.invalid/${await digest(`${token}|${team}|${email}`)}`,
  );
  const hit = await deps.cache?.match(cacheKey);
  if (hit) return json(200, await hit.json());

  const queue = deps.queue ?? sharedQueue;
  const answer = await queue.run(() => askSheet(endpoint, token, team, email, deps));
  if (answer === null) return json(503, { ok: false, error: 'busy' }, { 'Retry-After': '3' });
  if (!answer.ok && answer.error === 'not-found') {
    await Promise.all([deps.attempts.fail(ipKey), deps.attempts.fail(teamKeyId)]);
    await deps.sleep(FAILURE_DELAY_MS);
    return json(401, { ok: false, error: 'not-found' });
  }
  if (!answer.ok) return json(503, { ok: false, error: 'unavailable' }, { 'Retry-After': '5' });

  await deps.attempts.clear(teamKeyId);
  const body = { ok: true, total: answer.body['total'], result: answer.body['result'] };
  await deps.cache?.put(
    cacheKey,
    new Response(JSON.stringify(body), { headers: { 'Cache-Control': `max-age=${RESULT_CACHE_SECONDS}` } }),
  );
  return json(200, body);
}
