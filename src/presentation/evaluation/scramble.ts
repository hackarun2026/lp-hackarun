// um quadro do efeito de embaralhar: com progress de 0 a 1, as letras travam da esquerda para a direita no texto
// final e o resto mostra caracteres sorteados. Espaços e pontuação de número (",", "/", "—", "−") ficam no lugar
// para o texto não "pular" de largura
const KEEP = /[\s,./—−-]/;

export function scrambleFrame(final: string, progress: number, pick: () => string): string {
  const chars = [...final];
  const locked = Math.floor(Math.min(1, Math.max(0, progress)) * chars.length);
  return chars.map((char, i) => (i < locked || KEEP.test(char) ? char : pick())).join('');
}
