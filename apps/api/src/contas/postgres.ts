import pg from 'pg';
import type { Assinatura, DadosDoTitular, Lancamento, Pedido, RepositorioContas, Saldo, TipoCredito, Usuario } from './tipos.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const USUARIO = `id, nome, email, whatsapp, profissao, pagamento_cliente_id, email_confirmado_em, papel, bloqueado_em, tour_visto_em, totp_ativado_em, senha_hash IS NOT NULL AS tem_senha, google_sub IS NOT NULL AS com_google`;

function usuario(r: Record<string, unknown>): Usuario {
  return {
    id: r.id as string,
    nome: r.nome as string,
    email: r.email as string,
    whatsapp: (r.whatsapp as string) ?? undefined,
    profissao: (r.profissao as string) ?? undefined,
    pagamentoClienteId: (r.pagamento_cliente_id as string) ?? undefined,
    emailConfirmado: r.email_confirmado_em != null,
    papel: (r.papel as Usuario['papel']) ?? 'usuario',
    bloqueado: r.bloqueado_em != null,
    tourVisto: r.tour_visto_em != null,
    doisFatores: r.totp_ativado_em != null,
    temSenha: r.tem_senha !== false,
    comGoogle: r.com_google === true,
    sessaoCriadaEm: r.sessao_criada_em ? (r.sessao_criada_em as Date).toISOString() : undefined,
    personificadoPor: (r.personificado_por as string) ?? undefined,
  };
}

function pedido(r: Record<string, unknown>): Pedido {
  return {
    id: r.id as string,
    usuarioId: r.usuario_id as string,
    produto: r.produto as string,
    valor: Number(r.valor),
    status: r.status as Pedido['status'],
    provedor: r.provedor as string,
    provedorId: (r.provedor_id as string) ?? undefined,
    link: (r.link as string) ?? undefined,
    criadoEm: (r.criado_em as Date).toISOString(),
    creditos: r.creditos_consulta == null ? undefined : { consulta: r.creditos_consulta as number, dossie: (r.creditos_dossie as number) ?? 0 },
    nomeProduto: (r.nome_produto as string) ?? undefined,
    assinaturaId: (r.assinatura_id as string) ?? undefined,
    cupom: (r.cupom_codigo as string) ?? undefined,
    desconto: r.desconto == null ? undefined : Number(r.desconto),
  };
}

function assinatura(r: Record<string, unknown>): Assinatura {
  const data = (v: unknown) => (v ? (v as Date).toISOString() : undefined);
  return {
    id: r.id as string,
    usuarioId: r.usuario_id as string,
    planoId: r.plano_id as string,
    nomePlano: r.nome_plano as string,
    valorMensal: Number(r.valor_mensal),
    creditos: { consulta: r.creditos_consulta as number, dossie: r.creditos_dossie as number },
    limiteCarteira: r.limite_carteira as number,
    limiteMembros: (r.limite_membros as number) ?? 1,
    cupom: (r.cupom_codigo as string) ?? undefined,
    valorCheio: r.valor_cheio == null ? undefined : Number(r.valor_cheio),
    status: r.status as Assinatura['status'],
    provedor: r.provedor as string,
    provedorId: (r.provedor_id as string) ?? undefined,
    link: (r.link as string) ?? undefined,
    criadaEm: data(r.criada_em)!,
    ativadaEm: data(r.ativada_em),
    canceladaEm: data(r.cancelada_em),
  };
}

export class RepositorioContasPostgres implements RepositorioContas {
  constructor(private pool: pg.Pool) {}

  async buscarPorId(id: string) {
    const { rows } = await this.pool.query(`SELECT ${USUARIO} FROM usuario WHERE id = $1`, [id]);
    return rows[0] ? usuario(rows[0]) : null;
  }

  async confirmarEmail(usuarioId: string) {
    const { rowCount } = await this.pool.query(
      'UPDATE usuario SET email_confirmado_em = now() WHERE id = $1 AND email_confirmado_em IS NULL',
      [usuarioId],
    );
    return (rowCount ?? 0) > 0;
  }

  async definirSenha(usuarioId: string, senhaHash: string) {
    await this.pool.query('UPDATE usuario SET senha_hash = $2 WHERE id = $1', [usuarioId, senhaHash]);
  }

  async apagarSessoesDoUsuario(usuarioId: string) {
    await this.pool.query('DELETE FROM sessao WHERE usuario_id = $1', [usuarioId]);
  }

  async criarTokenEmail(usuarioId: string, tipo: 'confirmacao' | 'senha', tokenHash: string, expiraEm: Date) {
    await this.pool.query('INSERT INTO token_email (token_hash, usuario_id, tipo, expira_em) VALUES ($1, $2, $3, $4)', [
      tokenHash,
      usuarioId,
      tipo,
      expiraEm,
    ]);
  }

  async consumirTokenEmail(tokenHash: string, tipo: 'confirmacao' | 'senha') {
    // Atômico: dois cliques no mesmo link não usam o token duas vezes.
    const { rows } = await this.pool.query<{ usuario_id: string }>(
      `UPDATE token_email SET usado_em = now()
        WHERE token_hash = $1 AND tipo = $2 AND usado_em IS NULL AND expira_em > now()
        RETURNING usuario_id`,
      [tokenHash, tipo],
    );
    return rows[0]?.usuario_id ?? null;
  }

  async criarUsuario(
    u: Omit<Usuario, 'id' | 'emailConfirmado' | 'papel' | 'bloqueado' | 'personificadoPor'> & { senhaHash: string | null; googleSub?: string },
  ) {
    const { rows } = await this.pool.query(
      `INSERT INTO usuario (nome, email, whatsapp, profissao, senha_hash, google_sub, aceite_termos_em)
       VALUES ($1, lower($2), $3, $4, $5, $6, now())
       ON CONFLICT DO NOTHING
       RETURNING ${USUARIO}`,
      [u.nome, u.email, u.whatsapp ?? null, u.profissao ?? null, u.senhaHash, u.googleSub ?? null],
    );
    return rows[0] ? usuario(rows[0]) : 'email_existe';
  }

  async buscarPorGoogle(googleSub: string) {
    const { rows } = await this.pool.query(`SELECT ${USUARIO} FROM usuario WHERE google_sub = $1`, [googleSub]);
    return rows[0] ? usuario(rows[0]) : null;
  }

  async vincularGoogle(usuarioId: string, googleSub: string) {
    try {
      await this.pool.query('UPDATE usuario SET google_sub = $2 WHERE id = $1', [usuarioId, googleSub]);
      return true;
    } catch (e) {
      // google_sub é único: esta conta Google já está ligada a outra conta.
      if ((e as { code?: string }).code === '23505') return false;
      throw e;
    }
  }

  async buscarPorEmail(email: string) {
    const { rows } = await this.pool.query(`SELECT ${USUARIO}, senha_hash FROM usuario WHERE email = lower($1)`, [email]);
    return rows[0] ? { ...usuario(rows[0]), senhaHash: rows[0].senha_hash } : null;
  }

  async definirClientePagamento(usuarioId: string, clienteId: string) {
    await this.pool.query('UPDATE usuario SET pagamento_cliente_id = $2 WHERE id = $1', [usuarioId, clienteId]);
  }

  async marcarTourVisto(usuarioId: string) {
    await this.pool.query('UPDATE usuario SET tour_visto_em = coalesce(tour_visto_em, now()) WHERE id = $1', [usuarioId]);
  }

  async criarSessao(usuarioId: string, tokenHash: string, expiraEm: Date, personificadoPor?: string) {
    await this.pool.query('INSERT INTO sessao (token_hash, usuario_id, expira_em, personificado_por) VALUES ($1, $2, $3, $4)', [
      tokenHash,
      usuarioId,
      expiraEm,
      personificadoPor ?? null,
    ]);
  }

  async usuarioDaSessao(tokenHash: string) {
    const { rows } = await this.pool.query(
      `SELECT ${USUARIO.split(', ').map((c) => `u.${c}`).join(', ')}, s.personificado_por, s.criada_em AS sessao_criada_em
         FROM sessao s JOIN usuario u ON u.id = s.usuario_id
        WHERE s.token_hash = $1 AND s.expira_em > now()
          AND (u.bloqueado_em IS NULL OR s.personificado_por IS NOT NULL)`,
      [tokenHash],
    );
    return rows[0] ? usuario(rows[0]) : null;
  }

  async apagarSessao(tokenHash: string) {
    await this.pool.query('DELETE FROM sessao WHERE token_hash = $1', [tokenHash]);
  }

  async saldo(usuarioId: string): Promise<Saldo> {
    const { rows } = await this.pool.query<{ tipo: TipoCredito; total: string }>(
      'SELECT tipo, sum(quantidade) AS total FROM credito_lancamento WHERE usuario_id = $1 GROUP BY tipo',
      [usuarioId],
    );
    const saldo: Saldo = { consulta: 0, dossie: 0 };
    for (const r of rows) saldo[r.tipo] = Number(r.total);
    return saldo;
  }

  async lancar(l: Lancamento) {
    const { rowCount } = await this.pool.query(
      `INSERT INTO credito_lancamento (usuario_id, tipo, quantidade, motivo, referencia)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (referencia) DO NOTHING`,
      [l.usuarioId, l.tipo, l.quantidade, l.motivo, l.referencia],
    );
    return (rowCount ?? 0) > 0;
  }

  async debitar(usuarioId: string, tipo: TipoCredito, motivo: string, referencia: string, autorId?: string) {
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      // Trava a conta: duas consultas simultâneas não gastam o mesmo crédito.
      await cliente.query('SELECT 1 FROM usuario WHERE id = $1 FOR UPDATE', [usuarioId]);
      const { rows } = await cliente.query(
        'SELECT coalesce(sum(quantidade), 0) AS total FROM credito_lancamento WHERE usuario_id = $1 AND tipo = $2',
        [usuarioId, tipo],
      );
      if (Number(rows[0].total) < 1) {
        await cliente.query('ROLLBACK');
        return false;
      }
      await cliente.query(
        `INSERT INTO credito_lancamento (usuario_id, tipo, quantidade, motivo, referencia, autor_id) VALUES ($1, $2, -1, $3, $4, $5)`,
        [usuarioId, tipo, motivo, referencia, autorId ?? null],
      );
      await cliente.query('COMMIT');
      return true;
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw e;
    } finally {
      cliente.release();
    }
  }

  async criarPedido(p: Omit<Pedido, 'id' | 'status' | 'criadoEm'>) {
    const { rows } = await this.pool.query(
      `INSERT INTO pedido (usuario_id, produto, valor, provedor, creditos_consulta, creditos_dossie, nome_produto, assinatura_id, provedor_id,
                           cupom_codigo, desconto)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        p.usuarioId,
        p.produto,
        p.valor,
        p.provedor,
        p.creditos?.consulta ?? null,
        p.creditos?.dossie ?? null,
        p.nomeProduto ?? null,
        p.assinaturaId ?? null,
        p.provedorId ?? null,
        p.cupom ?? null,
        p.desconto ?? null,
      ],
    );
    return pedido(rows[0]);
  }

  async criarAssinatura(a: Omit<Assinatura, 'id' | 'status' | 'criadaEm' | 'ativadaEm' | 'canceladaEm'>) {
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO assinatura (usuario_id, plano_id, nome_plano, valor_mensal, creditos_consulta, creditos_dossie, limite_carteira, limite_membros,
                                 provedor, cupom_codigo, valor_cheio)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [
          a.usuarioId,
          a.planoId,
          a.nomePlano,
          a.valorMensal,
          a.creditos.consulta,
          a.creditos.dossie,
          a.limiteCarteira,
          a.limiteMembros,
          a.provedor,
          a.cupom ?? null,
          a.valorCheio ?? null,
        ],
      );
      return assinatura(rows[0]);
    } catch (e) {
      // Índice único parcial: já existe assinatura em andamento.
      if ((e as { code?: string }).code === '23505') return 'ja_existe' as const;
      throw e;
    }
  }

  async atualizarAssinatura(id: string, d: Partial<Pick<Assinatura, 'status' | 'provedorId' | 'link' | 'valorMensal'>>) {
    await this.pool.query(
      `UPDATE assinatura SET provedor_id = coalesce($2, provedor_id), link = coalesce($3, link), status = coalesce($4, status),
              valor_mensal = coalesce($5, valor_mensal),
              ativada_em = CASE WHEN $4 = 'ativa' THEN coalesce(ativada_em, now()) ELSE ativada_em END,
              cancelada_em = CASE WHEN $4 = 'cancelada' THEN now() ELSE cancelada_em END
        WHERE id = $1`,
      [id, d.provedorId ?? null, d.link ?? null, d.status ?? null, d.valorMensal ?? null],
    );
  }

  async buscarAssinatura(id: string) {
    if (!UUID.test(id)) return null;
    const { rows } = await this.pool.query('SELECT * FROM assinatura WHERE id = $1', [id]);
    return rows[0] ? assinatura(rows[0]) : null;
  }

  async buscarAssinaturaPorProvedor(provedorId: string) {
    const { rows } = await this.pool.query('SELECT * FROM assinatura WHERE provedor_id = $1', [provedorId]);
    return rows[0] ? assinatura(rows[0]) : null;
  }

  async assinaturaAtual(usuarioId: string) {
    const { rows } = await this.pool.query(
      `SELECT * FROM assinatura WHERE usuario_id = $1 AND status IN ('pendente', 'ativa', 'inadimplente') ORDER BY criada_em DESC LIMIT 1`,
      [usuarioId],
    );
    return rows[0] ? assinatura(rows[0]) : null;
  }

  async atualizarPedido(id: string, d: Partial<Pick<Pedido, 'provedorId' | 'link' | 'status'>>) {
    await this.pool.query(
      `UPDATE pedido SET provedor_id = coalesce($2, provedor_id), link = coalesce($3, link),
              status = coalesce($4, status),
              pago_em = CASE WHEN $4 = 'pago' THEN now() ELSE pago_em END
        WHERE id = $1`,
      [id, d.provedorId ?? null, d.link ?? null, d.status ?? null],
    );
  }

  async buscarPedido(id: string) {
    if (!UUID.test(id)) return null;
    const { rows } = await this.pool.query('SELECT * FROM pedido WHERE id = $1', [id]);
    return rows[0] ? pedido(rows[0]) : null;
  }

  async buscarPedidoPorProvedor(provedorId: string) {
    const { rows } = await this.pool.query('SELECT * FROM pedido WHERE provedor_id = $1', [provedorId]);
    return rows[0] ? pedido(rows[0]) : null;
  }

  async pedidosDoUsuario(usuarioId: string) {
    const { rows } = await this.pool.query('SELECT * FROM pedido WHERE usuario_id = $1 ORDER BY criado_em DESC LIMIT 50', [usuarioId]);
    return rows.map(pedido);
  }

  async dadosDoisFatores(usuarioId: string) {
    const { rows } = await this.pool.query('SELECT totp_segredo, totp_ativado_em, totp_ultimo_passo FROM usuario WHERE id = $1', [usuarioId]);
    const r = rows[0];
    return {
      segredoCifrado: (r?.totp_segredo as string) ?? undefined,
      ativo: r?.totp_ativado_em != null,
      ultimoPasso: r?.totp_ultimo_passo == null ? null : Number(r.totp_ultimo_passo),
    };
  }

  async guardarSegredoPendente(usuarioId: string, segredoCifrado: string) {
    const { rowCount } = await this.pool.query(
      'UPDATE usuario SET totp_segredo = $2, totp_ultimo_passo = NULL WHERE id = $1 AND totp_ativado_em IS NULL',
      [usuarioId, segredoCifrado],
    );
    return (rowCount ?? 0) > 0;
  }

  async ativarDoisFatores(usuarioId: string, hashesRecuperacao: string[]) {
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query('UPDATE usuario SET totp_ativado_em = now() WHERE id = $1 AND totp_segredo IS NOT NULL', [usuarioId]);
      await cliente.query('DELETE FROM totp_recuperacao WHERE usuario_id = $1', [usuarioId]);
      await cliente.query('INSERT INTO totp_recuperacao (usuario_id, codigo_hash) SELECT $1, unnest($2::text[])', [usuarioId, hashesRecuperacao]);
      await cliente.query('COMMIT');
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw e;
    } finally {
      cliente.release();
    }
  }

  async registrarPassoTotp(usuarioId: string, passo: number) {
    // Atômico: dois logins com o mesmo código ao mesmo tempo, só um passa.
    const { rowCount } = await this.pool.query(
      'UPDATE usuario SET totp_ultimo_passo = $2 WHERE id = $1 AND (totp_ultimo_passo IS NULL OR totp_ultimo_passo < $2)',
      [usuarioId, passo],
    );
    return (rowCount ?? 0) > 0;
  }

  async usarCodigoRecuperacao(usuarioId: string, hash: string) {
    const { rowCount } = await this.pool.query(
      `UPDATE totp_recuperacao SET usado_em = now()
        WHERE id = (SELECT id FROM totp_recuperacao WHERE usuario_id = $1 AND codigo_hash = $2 AND usado_em IS NULL LIMIT 1)`,
      [usuarioId, hash],
    );
    return (rowCount ?? 0) > 0;
  }

  async codigosRecuperacaoRestantes(usuarioId: string) {
    const { rows } = await this.pool.query('SELECT count(*)::int AS n FROM totp_recuperacao WHERE usuario_id = $1 AND usado_em IS NULL', [usuarioId]);
    return rows[0].n as number;
  }

  async desativarDoisFatores(usuarioId: string) {
    await this.pool.query('UPDATE usuario SET totp_segredo = NULL, totp_ativado_em = NULL, totp_ultimo_passo = NULL WHERE id = $1', [usuarioId]);
    await this.pool.query('DELETE FROM totp_recuperacao WHERE usuario_id = $1', [usuarioId]);
  }

  async apagarOutrasSessoes(usuarioId: string, tokenHashAtual: string) {
    await this.pool.query('DELETE FROM sessao WHERE usuario_id = $1 AND token_hash <> $2', [usuarioId, tokenHashAtual]);
  }

  async registrarEvento(id: string, provedor: string, payload: unknown) {
    const { rowCount } = await this.pool.query(
      'INSERT INTO webhook_evento (id, provedor, payload) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [id, provedor, payload],
    );
    return (rowCount ?? 0) > 0;
  }

  async exportarDados(usuarioId: string): Promise<DadosDoTitular> {
    const q = (sql: string) => this.pool.query(sql, [usuarioId]).then((r) => r.rows);
    // Nunca sai: hash da senha e hashes de tokens (não são dados da pessoa, e sim chaves de segurança).
    const [conta, creditos, pedidos, assinaturas, consultas, carteira, avisos, sessoesAbertas, equipe, apoioIA] = await Promise.all([
      q(`SELECT id, nome, email, whatsapp, profissao, papel, criado_em, aceite_termos_em, email_confirmado_em, bloqueado_em,
                google_sub IS NOT NULL AS entra_com_google
           FROM usuario WHERE id = $1`),
      q('SELECT tipo, quantidade, motivo, criado_em FROM credito_lancamento WHERE usuario_id = $1 ORDER BY id'),
      q(`SELECT id, produto, nome_produto, valor, status, provedor, criado_em, pago_em, assinatura_id, cupom_codigo, desconto
           FROM pedido WHERE usuario_id = $1 ORDER BY criado_em`),
      q(`SELECT id, plano_id, nome_plano, valor_mensal, creditos_consulta, creditos_dossie, limite_carteira, status,
                criada_em, ativada_em, cancelada_em, cupom_codigo, valor_cheio
           FROM assinatura WHERE usuario_id = $1 ORDER BY criada_em`),
      q(`SELECT id, cod_car, criada_em, data_referencia, resultado->>'veredito' AS veredito, dossie_liberado_em,
                documento_hash IS NOT NULL AS consultou_cpf_cnpj, resultado
           FROM consulta WHERE usuario_id = $1 ORDER BY criada_em`),
      q(`SELECT id, cod_car, apelido, situacao_car, modulos_fiscais, uso_coletivo, criado_em, verificado_em
           FROM imovel_monitorado WHERE usuario_id = $1 ORDER BY criado_em`),
      q('SELECT id, imovel_id, consulta_id, alteracoes, criado_em, lido_em, emailado_em FROM aviso WHERE usuario_id = $1 ORDER BY criado_em'),
      q(`SELECT criada_em, expira_em, personificado_por IS NOT NULL AS aberta_pelo_suporte
           FROM sessao WHERE usuario_id = $1 AND expira_em > now() ORDER BY criada_em`),
      q(`SELECT 'responsavel' AS papel, e.criada_em AS desde, (SELECT count(*)::int FROM equipe_membro m WHERE m.equipe_id = e.id) AS membros
           FROM equipe e WHERE e.dono_id = $1
         UNION ALL
         SELECT m.papel, m.entrou_em, NULL FROM equipe_membro m WHERE m.usuario_id = $1`),
      // Apoio por IA: o que foi lido dos documentos e os rascunhos (podem ter nome do produtor e outros dados).
      q(`SELECT a.id, a.consulta_id, a.tipo, a.regra_id, a.dados, a.criado_em
           FROM consulta_apoio a
          WHERE a.criado_por = $1 OR a.consulta_id IN (SELECT id FROM consulta WHERE usuario_id = $1)
          ORDER BY a.criado_em`),
    ]);
    return { conta: conta[0] ?? {}, creditos, pedidos, assinaturas, consultas, carteira, avisos, sessoesAbertas, equipe, apoioIA };
  }

  async excluirConta(usuarioId: string, emailHash: string) {
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query('INSERT INTO email_excluido (email_hash) VALUES ($1) ON CONFLICT DO NOTHING', [emailHash]);
      // Equipe: sai da que participa; a que é dele é desfeita (os membros voltam às contas próprias).
      await cliente.query('DELETE FROM equipe_membro WHERE usuario_id = $1', [usuarioId]);
      await cliente.query('DELETE FROM equipe WHERE dono_id = $1', [usuarioId]);
      await cliente.query('DELETE FROM convite_equipe WHERE email = (SELECT email FROM usuario WHERE id = $1)', [usuarioId]);
      // Só da pessoa: apaga (aviso e imóvel em cascata).
      await cliente.query('DELETE FROM imovel_monitorado WHERE usuario_id = $1', [usuarioId]);
      await cliente.query('DELETE FROM token_email WHERE usuario_id = $1', [usuarioId]);
      await cliente.query('DELETE FROM totp_recuperacao WHERE usuario_id = $1', [usuarioId]);
      await cliente.query('DELETE FROM sessao WHERE usuario_id = $1 OR personificado_por = $1', [usuarioId]);
      // Apoio por IA das consultas da pessoa (documentos lidos e rascunhos): só ela e a equipe viam, e
      // pode ter dado pessoal. O relatório do QR não depende disso. Antes de a consulta perder o dono.
      await cliente.query('DELETE FROM consulta_apoio WHERE consulta_id IN (SELECT id FROM consulta WHERE usuario_id = $1)', [usuarioId]);
      // Consultas: o QR do relatório que foi ao banco continua abrindo, mas sem dono e sem o código do CPF/CNPJ.
      await cliente.query('UPDATE consulta SET usuario_id = NULL, documento_hash = NULL WHERE usuario_id = $1', [usuarioId]);
      // A linha fica (pedidos e créditos apontam para ela), sem nenhum dado pessoal.
      await cliente.query(
        `UPDATE usuario
            SET nome = 'Conta excluída', email = 'excluida-' || id || '@excluida.invalid', whatsapp = NULL, profissao = NULL,
                senha_hash = 'excluida', papel = 'usuario', excluida_em = now(), bloqueado_em = coalesce(bloqueado_em, now()),
                totp_segredo = NULL, totp_ativado_em = NULL, totp_ultimo_passo = NULL, google_sub = NULL
          WHERE id = $1`,
        [usuarioId],
      );
      await cliente.query('COMMIT');
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw e;
    } finally {
      cliente.release();
    }
  }

  async emailJaExcluido(emailHash: string) {
    const { rowCount } = await this.pool.query('SELECT 1 FROM email_excluido WHERE email_hash = $1', [emailHash]);
    return (rowCount ?? 0) > 0;
  }
}
