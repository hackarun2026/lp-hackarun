// fila de consultas: no máximo N chamadas ao Apps Script ao mesmo tempo por instância da função (ele aceita só 30
// simultâneas no total e cada uma leva alguns segundos). Quem chega depois espera a vez, em ordem; se a espera passar
// do limite, a resposta é "ocupado" e o navegador tenta de novo sozinho
export class ConsultQueue {
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly limit: number,
    private readonly maxWaitMs: number,
    private readonly timer: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
  ) {}

  get pending(): number {
    return this.waiting.length;
  }

  // roda a tarefa quando houver vaga; null = esperou demais (a tarefa não rodou)
  async run<T>(task: () => Promise<T>): Promise<T | null> {
    if (!(await this.acquire())) return null;
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<boolean> {
    if (this.running < this.limit) {
      this.running++;
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      let done = false;
      const turn = () => {
        if (done) return;
        done = true;
        this.running++;
        resolve(true);
      };
      this.waiting.push(turn);
      this.timer(() => {
        if (done) return;
        done = true;
        const index = this.waiting.indexOf(turn);
        if (index >= 0) this.waiting.splice(index, 1);
        resolve(false);
      }, this.maxWaitMs);
    });
  }

  private release(): void {
    this.running--;
    this.waiting.shift()?.();
  }
}
