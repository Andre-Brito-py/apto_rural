import nodemailer, { type Transporter } from 'nodemailer';

export interface Mensagem {
  para: string;
  assunto: string;
  texto: string;
  html: string;
}

export interface Enviador {
  enviar(m: Mensagem): Promise<void>;
}

/** SMTP: funciona com qualquer provedor (Brevo, Amazon SES, Resend, Workspace…). */
export class EnviadorSmtp implements Enviador {
  private transporte: Transporter;

  constructor(
    opcoes: { host: string; porta: number; usuario?: string; senha?: string; semTls?: boolean },
    private remetente: string,
  ) {
    this.transporte = nodemailer.createTransport({
      host: opcoes.host,
      port: opcoes.porta,
      secure: opcoes.porta === 465, // 465 = TLS direto; 587 = STARTTLS
      // semTls: só nos testes de navegador, com o Mailpit local (recusado em produção).
      requireTLS: !opcoes.semTls && opcoes.porta !== 465 && opcoes.porta !== 25,
      auth: opcoes.usuario ? { user: opcoes.usuario, pass: opcoes.senha } : undefined,
    });
  }

  async enviar(m: Mensagem) {
    await this.transporte.sendMail({ from: this.remetente, to: m.para, subject: m.assunto, text: m.texto, html: m.html });
  }
}

/** Desenvolvimento sem SMTP: mostra o e-mail no log da API. */
export class EnviadorConsole implements Enviador {
  async enviar(m: Mensagem) {
    console.log(`\n=== E-MAIL (não enviado: SMTP não configurado) ===\nPara: ${m.para}\nAssunto: ${m.assunto}\n\n${m.texto}\n===\n`);
  }
}

/** Testes: guarda as mensagens para conferir. */
export class EnviadorMemoria implements Enviador {
  enviadas: Mensagem[] = [];
  async enviar(m: Mensagem) {
    this.enviadas.push(m);
  }
}
