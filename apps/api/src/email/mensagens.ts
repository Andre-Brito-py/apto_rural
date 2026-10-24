import type { Mensagem } from './enviador.js';

function escapar(t: string): string {
  return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** HTML simples, legível em qualquer leitor de e-mail e no celular. */
function html(titulo: string, paragrafos: string[], botao: { texto: string; link: string }, rodape: string): string {
  // Cores e assinatura da marca (docs/marca.md). Sem imagens: muitos leitores de e-mail bloqueiam SVG e imagens externas.
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f6f7f4;font-family:Inter,'Segoe UI',Arial,Helvetica,sans-serif;color:#111a14">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
<p style="color:#0f3f22;font-size:19px;letter-spacing:-0.3px;margin:0 0 16px"><span style="display:inline-block;width:22px;height:22px;border-radius:6px;background:#14532d;vertical-align:-4px;margin-right:8px"></span><b>Apto</b> Rural</p>
<div style="background:#fff;border:1px solid #e3e7e1;border-radius:12px;padding:20px">
<h1 style="font-size:20px;margin:0 0 12px">${escapar(titulo)}</h1>
${paragrafos.map((p) => `<p style="font-size:16px;line-height:1.5;margin:0 0 12px">${escapar(p)}</p>`).join('')}
<p style="margin:20px 0"><a href="${escapar(botao.link)}" style="background:#14532d;color:#fff;text-decoration:none;font-weight:bold;padding:14px 20px;border-radius:10px;display:inline-block">${escapar(botao.texto)}</a></p>
<p style="font-size:13px;color:#566158;margin:0">Se o botão não funcionar, copie este endereço no navegador:<br>${escapar(botao.link)}</p>
</div>
<p style="font-size:12px;color:#566158;margin:16px 4px">${escapar(rodape)}</p>
<p style="font-size:12px;color:#566158;margin:0 4px"><b style="color:#0f3f22">Apto Rural</b> · Do vermelho ao verde.</p>
</div></body></html>`;
}

const NOME_STATUS: Record<string, string> = {
  impedimento: 'Impedimento',
  atencao: 'Atenção',
  sem_impedimento: 'OK',
  nao_verificado: 'Não verificado',
};

/** Resumo diário do que mudou nos imóveis da carteira. */
export function mensagemAvisosCarteira(
  nome: string,
  para: string,
  avisos: { codCar: string; apelido?: string; alteracoes: { titulo: string; de: string; para: string; piorou: boolean }[] }[],
  link: string,
): Mensagem {
  const primeiro = nome.split(' ')[0];
  const piorou = avisos.some((a) => a.alteracoes.some((x) => x.piorou));
  const linhas = avisos.flatMap((a) => [
    `${a.apelido ?? 'Imóvel'} (CAR ${a.codCar}):`,
    ...a.alteracoes.map((x) => `• ${x.titulo}: ${NOME_STATUS[x.de]} → ${NOME_STATUS[x.para]}${x.piorou ? ' ⚠' : ''}`),
  ]);
  const abertura = `Olá, ${primeiro}! A reconferência de hoje encontrou mudanças em ${avisos.length === 1 ? '1 imóvel' : `${avisos.length} imóveis`} da sua carteira.`;
  const rodape = 'Você recebe este e-mail porque acompanha estes imóveis no Apto Rural. Pré-checagem com bases públicas; não substitui a análise do banco.';
  return {
    para,
    assunto: piorou ? 'Atenção: mudança em imóvel da sua carteira' : 'Mudança em imóvel da sua carteira',
    texto: `${abertura}\n\n${linhas.join('\n')}\n\nVer a carteira: ${link}\n\n${rodape}`,
    html: html('Mudanças na sua carteira', [abertura, ...linhas], { texto: 'Ver a carteira', link }, rodape),
  };
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

const NOME_PAPEL: Record<string, string> = { administrador: 'administrador', tecnico: 'técnico' };

/** Convite para entrar na equipe de um escritório (plano Escritório). */
export function mensagemConviteEquipe(quemConvidou: string, responsavel: string, papel: string, para: string, link: string): Mensagem {
  const paragrafos = [
    `${quemConvidou} convidou você para a equipe de ${responsavel} no Apto Rural, como ${NOME_PAPEL[papel] ?? papel}.`,
    'Na equipe, você consulta imóveis e acompanha a carteira usando os créditos do escritório, sem pagar nada à parte.',
    'Para aceitar, abra o link e entre (ou crie sua conta) com este mesmo e-mail.',
  ];
  const rodape = 'O convite vale por 7 dias e só pode ser usado uma vez. Se você não conhece quem convidou, ignore este e-mail.';
  return {
    para,
    assunto: `${quemConvidou} convidou você para a equipe no Apto Rural`,
    texto: `${paragrafos.join('\n\n')}\n\nAceitar o convite: ${link}\n\n${rodape}`,
    html: html('Convite para a equipe', paragrafos, { texto: 'Ver o convite', link }, rodape),
  };
}

/** Comprovante da exclusão, mandado para o e-mail antigo antes de ele ser apagado. */
export function mensagemContaExcluida(nome: string, para: string, link: string): Mensagem {
  const primeiro = nome.split(' ')[0];
  const paragrafos = [
    `Olá, ${primeiro}. Sua conta no Apto Rural foi excluída, como você pediu.`,
    'Apagamos seu nome, e-mail, WhatsApp, profissão, senha, carteira de imóveis e avisos. Se havia assinatura, ela foi cancelada e não haverá novas cobranças.',
    'Por obrigação legal, os registros das compras (valor, data e situação) ficam guardados pelo prazo da lei, sem seus dados de contato. Os relatórios já emitidos continuam abrindo pelo código QR, sem indicar quem os gerou.',
  ];
  const rodape = 'Se não foi você quem pediu a exclusão, responda a este e-mail.';
  return {
    para,
    assunto: 'Sua conta no Apto Rural foi excluída',
    texto: `${paragrafos.join('\n\n')}\n\n${rodape}`,
    html: html('Conta excluída', paragrafos, { texto: 'Visitar o Apto Rural', link }, rodape),
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
