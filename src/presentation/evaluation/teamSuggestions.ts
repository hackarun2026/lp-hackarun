// sugestão do nome da equipe na /avaliacao: a partir de 3 letras, mostra as equipes que contêm o que foi digitado
// (sem acento e sem diferença de maiúscula). Os nomes vêm da lista pública de equipes (/api/equipes), a mesma da
// página /equipes; não sai nada de nota nem de e-mail daqui
import { normalizeSearch } from '@domain/evaluation/Ranking';

export const MIN_CHARS = 3;
export const MAX_SUGGESTIONS = 8;

export function suggestTeams(names: readonly string[], typed: string): string[] {
  const needle = normalizeSearch(typed).replace(/^equipe\s*/, '');
  if (needle.length < MIN_CHARS) return [];
  return names
    .filter((name) =>
      normalizeSearch(name)
        .replace(/^equipe\s+/, '')
        .includes(needle),
    )
    .sort((a, b) => {
      // quem começa com o que foi digitado vem primeiro
      const start = (n: string) =>
        normalizeSearch(n)
          .replace(/^equipe\s+/, '')
          .startsWith(needle)
          ? 0
          : 1;
      return start(a) - start(b) || a.localeCompare(b, 'pt-BR');
    })
    .slice(0, MAX_SUGGESTIONS);
}

async function loadNames(): Promise<string[]> {
  try {
    const response = await fetch('/api/equipes');
    const body = (await response.json()) as { teams?: { name?: unknown }[] };
    return (body.teams ?? []).map((t) => (typeof t.name === 'string' ? t.name : '')).filter(Boolean);
  } catch {
    return [];
  }
}

export function setupTeamSuggestions(): void {
  const input = document.querySelector<HTMLInputElement>('[data-ev-team]');
  const list = document.querySelector<HTMLDataListElement>('[data-ev-team-options]');
  if (!input || !list) return;
  let names: Promise<string[]> | null = null;
  const update = async () => {
    names ??= loadNames();
    const options = suggestTeams(await names, input.value).map((name) => {
      const option = document.createElement('option');
      option.value = name;
      return option;
    });
    list.replaceChildren(...options);
  };
  input.addEventListener('input', () => void update());
  // a lista começa a baixar quando a pessoa entra no campo (antes de digitar a 3ª letra)
  input.addEventListener('focus', () => (names ??= loadNames()), { once: true });
}
