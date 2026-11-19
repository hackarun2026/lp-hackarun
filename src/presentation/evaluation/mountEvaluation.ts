// efeitos e busca da página /avaliacao. O HTML já chega com o texto final; aqui cada bloco entra quando aparece na
// tela, como na formação das equipes do sorteio: o texto embaralha em caracteres de terminal e trava no valor certo,
// numa cascata leve. No fundo, uma chuva de código bem fraca. "Reduzir movimento" desliga tudo isso
import { normalizeSearch } from '@domain/evaluation/Ranking';
import { scrambleFrame } from './scramble';

const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトﾊﾋﾌﾍﾎ0123456789ABCDEF<>/{}[]#$%';
const DIGITS = '0123456789';
const SCRAMBLE_MS = 650;
const STAGGER_MS = 45;

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const randomOf = (pool: string) => (): string => pool[Math.floor(Math.random() * pool.length)] ?? ' ';

// texto final guardado uma vez: uma animação nova nunca lê o texto no meio de outra
const finals = new WeakMap<HTMLElement, string>();
const runs = new WeakMap<HTMLElement, number>();

function scramble(el: HTMLElement, delay: number): void {
  const final = finals.get(el) ?? (el.textContent ?? '').trim();
  finals.set(el, final);
  const run = (runs.get(el) ?? 0) + 1;
  runs.set(el, run);
  const pool = el.hasAttribute('data-ev-number') ? DIGITS : GLYPHS;
  const pick = randomOf(pool);
  const start = performance.now() + delay;
  el.classList.add('ev-scrambling');
  const step = (now: number) => {
    if (runs.get(el) !== run) return;
    const progress = Math.min(1, Math.max(0, (now - start) / SCRAMBLE_MS));
    el.textContent = scrambleFrame(final, progress, pick);
    if (progress < 1) {
      requestAnimationFrame(step);
      return;
    }
    el.textContent = final;
    el.classList.remove('ev-scrambling');
    el.classList.add('ev-locked');
  };
  requestAnimationFrame(step);
}

const revealed = new WeakSet<HTMLElement>();

function reveal(block: HTMLElement, order: number): void {
  if (revealed.has(block)) return;
  revealed.add(block);
  const delay = order * STAGGER_MS;
  window.setTimeout(() => {
    block.classList.remove('ev-wait');
    block.classList.add('ev-in');
  }, delay);
  block
    .querySelectorAll<HTMLElement>('[data-ev-scramble], [data-ev-number]')
    .forEach((el, i) => scramble(el, delay + i * 25));
}

function watchReveals(): void {
  const blocks = [...document.querySelectorAll<HTMLElement>('[data-ev-reveal], [data-ev-row]')];
  blocks.forEach((block) => block.classList.add('ev-wait'));
  // blocos que entram juntos (ex.: várias linhas num scroll rápido) saem em cascata, não todos de uma vez
  const observer = new IntersectionObserver(
    (entries) => {
      entries
        .filter((entry) => entry.isIntersecting)
        .forEach((entry, order) => {
          observer.unobserve(entry.target);
          reveal(entry.target as HTMLElement, order);
        });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
  );
  blocks.forEach((block) => observer.observe(block));
}

function countUp(): void {
  document.querySelectorAll<HTMLElement>('[data-ev-count]').forEach((el) => {
    const target = Number(el.dataset['evCount']);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1200);
      el.textContent = String(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function rain(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const pick = randomOf(GLYPHS);
  const size = 16;
  let drops: number[] = [];
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drops = Array.from({ length: Math.ceil(canvas.clientWidth / size) }, () => Math.random() * -60);
  };
  resize();
  new ResizeObserver(resize).observe(canvas);

  let visible = true;
  new IntersectionObserver(([entry]) => (visible = entry?.isIntersecting ?? false)).observe(canvas);
  let last = 0;
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    // ~20 quadros por segundo bastam e poupam bateria; parada quando sai da tela ou a aba fica escondida
    if (!visible || document.hidden || now - last < 50) return;
    last = now;
    ctx.fillStyle = 'rgb(2 3 11 / 0.18)';
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.font = `${size - 2}px "JetBrains Mono Variable", ui-monospace, monospace`;
    drops.forEach((y, i) => {
      ctx.fillStyle = Math.random() > 0.96 ? '#e8fdff' : i % 5 === 0 ? '#941bff' : '#00e5ff';
      ctx.fillText(pick(), i * size, y * size);
      drops[i] = y * size > canvas.clientHeight && Math.random() > 0.975 ? 0 : y + 1;
    });
  };
  requestAnimationFrame(frame);
}

function setupSearch(): void {
  const input = document.querySelector<HTMLInputElement>('[data-ev-query]');
  const status = document.querySelector<HTMLElement>('[data-ev-status]');
  const empty = document.querySelector<HTMLElement>('[data-ev-empty]');
  const rows = [...document.querySelectorAll<HTMLElement>('[data-ev-row]')];
  if (!input || !status || !empty) return;
  const total = rows.length;
  const apply = () => {
    const needle = normalizeSearch(input.value);
    let shown = 0;
    rows.forEach((row) => {
      const match = needle === '' || (row.dataset['search'] ?? '').includes(needle);
      row.hidden = !match;
      if (!match) return;
      shown++;
      // a linha achada aparece na hora (a busca não espera o scroll)
      if (needle !== '') reveal(row, shown - 1);
    });
    empty.hidden = shown > 0;
    status.textContent =
      needle === '' ? `${total} projetos` : `${shown} de ${total} ${shown === 1 ? 'projeto' : 'projetos'}`;
  };
  input.addEventListener('input', apply);
  // Esc limpa a busca
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || input.value === '') return;
    input.value = '';
    apply();
  });
}

export function mountEvaluation(): void {
  setupSearch();
  if (reducedMotion()) return;
  document.documentElement.classList.add('ev-js');
  watchReveals();
  countUp();
  const canvas = document.querySelector<HTMLCanvasElement>('[data-ev-rain]');
  if (canvas) rain(canvas);
}
