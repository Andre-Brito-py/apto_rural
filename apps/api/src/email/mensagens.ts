import type { Mensagem } from './enviador.js';

function escapar(t: string): string {
  return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** HTML simples, legível em qualquer leitor de e-mail e no celular. */
function html(titulo: string, paragrafos: string[], botao: { texto: string; link: string }, rodape: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f7f5ef;font-family:Arial,Helvetica,sans-serif;color:#1b1c18">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
<p style="font-weight:bold;color:#14532d;font-size:18px;margin:0 0 16px">Apto Rural</p>
<div style="background:#fff;border:1px solid #d9d5c8;border-radius:12px;padding:20px">
<h1 style="font-size:20px;margin:0 0 12px">${escapar(titulo)}</h1>
${paragrafos.map((p) => `<p style="font-size:16px;line-height:1.5;margin:0 0 12px">${escapar(p)}</p>`).join('')}
<p style="margin:20px 0"><a href="${escapar(botao.link)}" style="background:#14532d;color:#fff;text-decoration:none;font-weight:bold;padding:14px 20px;border-radius:10px;display:inline-block">${escapar(botao.texto)}</a></p>
<p style="font-size:13px;color:#4a4d45;margin:0">Se o botão não funcionar, copie este endereço no navegador:<br>${escapar(botao.link)}</p>
</div>
<p style="font-size:12px;color:#4a4d45;margin:16px 4px">${escapar(rodape)}</p>
</div></body></html>`;
}

export function mensagemConfirmacao(nome: string, para: string, link: string): Mensagem {
  const primeiro = nome.split(' ')[0];
  const paragrafos = [
    `Olá, ${primeiro}! Falta só confirmar seu e-mail para ativar a conta.`,
    'Ao confirmar, você ganha 1 consulta grátis para checar um imóvel real.',
  ];
  const rodape = 'O link vale por 48 horas. Se você não criou uma conta no Apto Rural, ignore este e-mail.';
  return {
    para,
    assunto: 'Confirme seu e-mail no Apto Rural',
    texto: `${paragrafos.join('\n\n')}\n\nConfirmar e-mail: ${link}\n\n${rodape}`,
    html: html('Confirme seu e-mail', paragrafos, { texto: 'Confirmar e-mail', link }, rodape),
  };
}

export function mensagemRedefinirSenha(nome: string, para: string, link: string): Mensagem {
  const primeiro = nome.split(' ')[0];
  const paragrafos = [`Olá, ${primeiro}! Recebemos um pedido para criar uma nova senha na sua conta.`];
  const rodape = 'O link vale por 1 hora e só pode ser usado uma vez. Se não foi você, ignore este e-mail: sua senha continua a mesma.';
  return {
    para,
    assunto: 'Nova senha no Apto Rural',
    texto: `${paragrafos[0]}\n\nCriar nova senha: ${link}\n\n${rodape}`,
    html: html('Criar nova senha', paragrafos, { texto: 'Criar nova senha', link }, rodape),
  };
}
