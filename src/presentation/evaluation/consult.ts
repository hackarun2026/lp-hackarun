// formulário da /avaliacao: manda nome da equipe + e-mail para a função do site e mostra o resultado. Quando muitas
// equipes consultam juntas, a função responde "ocupado" e aqui a consulta entra na fila: tenta de novo sozinha, com
// espera crescente, mostrando que está aguardando a vez
import { isTeamResult, renderTeamResult } from './teamResult';

const API = '/api/avaliacao';
export const RETRY_DELAYS_MS = [2000, 4000, 6000, 8000];

export type ConsultOutcome =
  | { kind: 'ok'; total: number; result: unknown }
  | { kind: 'not-found' }
  | { kind: 'rate-limited' }
  | { kind: 'invalid' }
  | { kind: 'unavailable' };

interface ConsultDeps {
  fetch: typeof fetch;
  wait(ms: number): Promise<void>;
  onQueue(attempt: number): void;
}

// uma consulta com as novas tentativas quando a fila está cheia ou a planilha demorou
export async function consult(team: string, email: string, deps: ConsultDeps): Promise<ConsultOutcome> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    let status = 0;
    let body: Record<string, unknown> = {};
    try {
      const response = await deps.fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team, email }),
      });
      status = response.status;
      body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      // sem rede: tenta de novo como se a fila estivesse cheia
    }
    if (status === 200 && body['ok'] === true) {
      return { kind: 'ok', total: Number(body['total']) || 0, result: body['result'] };
    }
    if (status === 401) return { kind: 'not-found' };
    if (status === 429) return { kind: 'rate-limited' };
    if (status === 400) return { kind: 'invalid' };
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined) break;
    deps.onQueue(attempt + 1);
    await deps.wait(delay);
  }
  return { kind: 'unavailable' };
}

const MESSAGES: Record<Exclude<ConsultOutcome['kind'], 'ok'>, string> = {
  'not-found':
    'Não encontramos essa combinação. Confira o nome da equipe e use o e-mail da inscrição de um integrante.',
  'rate-limited': 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
  invalid: 'Preencha o nome da equipe e um e-mail válido.',
  unavailable: 'A consulta está indisponível agora. Tente de novo em alguns minutos.',
};

export function setupConsult(colorOf: (team: string) => string, onShow: (card: HTMLElement) => void): void {
  const form = document.querySelector<HTMLFormElement>('[data-ev-form]');
  const status = document.querySelector<HTMLElement>('[data-ev-form-status]');
  const button = document.querySelector<HTMLButtonElement>('[data-ev-submit]');
  const output = document.querySelector<HTMLElement>('[data-ev-result]');
  if (!form || !status || !button || !output) return;
  let busy = false;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(form);
    const team = String(data.get('team') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    if (!team || !email.includes('@')) {
      status.textContent = MESSAGES.invalid;
      return;
    }
    busy = true;
    button.disabled = true;
    status.textContent = 'Consultando…';
    void consult(team, email, {
      fetch: (input, init) => fetch(input, init),
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      onQueue: (attempt) => {
        status.textContent = `Muitas equipes consultando agora. Você está na fila (tentativa ${attempt + 1})…`;
      },
    })
      .then((outcome) => {
        if (outcome.kind !== 'ok' || !isTeamResult(outcome.result)) {
          status.textContent = MESSAGES[outcome.kind === 'ok' ? 'unavailable' : outcome.kind];
          return;
        }
        status.textContent = '';
        renderTeamResult(output, outcome.result, outcome.total, colorOf(outcome.result.team));
        output.hidden = false;
        output.focus({ preventScroll: true });
        output.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const card = output.firstElementChild;
        if (card instanceof HTMLElement) onShow(card);
      })
      .finally(() => {
        busy = false;
        button.disabled = false;
      });
  });
}
