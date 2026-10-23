/**
 * Freio de senha errada por e-mail, além do limite por IP: quem testa senhas
 * de uma conta trocando de IP para depois de MAX_FALHAS erros na janela.
 * Fica na memória (a API roda em um processo só); reiniciar zera a contagem.
 */
const MAX_FALHAS = 8;
const JANELA_MS = 15 * 60 * 1000;

export class TentativasLogin {
  private falhas = new Map<string, { quantidade: number; desde: number }>();

  constructor(private agora: () => number = Date.now) {}

  bloqueado(email: string): boolean {
    const f = this.atual(email);
    return f != null && f.quantidade >= MAX_FALHAS;
  }

  falhou(email: string) {
    const chave = email.toLowerCase();
    const f = this.atual(chave);
    this.falhas.set(chave, f ? { ...f, quantidade: f.quantidade + 1 } : { quantidade: 1, desde: this.agora() });
    // Não deixa o mapa crescer sem fim com e-mails inventados.
    if (this.falhas.size > 50_000) this.limpar();
  }

  acertou(email: string) {
    this.falhas.delete(email.toLowerCase());
  }

  private atual(email: string) {
    const chave = email.toLowerCase();
    const f = this.falhas.get(chave);
    if (f && this.agora() - f.desde > JANELA_MS) {
      this.falhas.delete(chave);
      return undefined;
    }
    return f;
  }

  private limpar() {
    for (const [chave, f] of this.falhas) if (this.agora() - f.desde > JANELA_MS) this.falhas.delete(chave);
  }
}
