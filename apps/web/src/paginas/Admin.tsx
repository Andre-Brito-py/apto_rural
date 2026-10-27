import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { api, type ErroRegistrado, type PainelResumo, type RegistroAuditoria, type UsuarioAdmin } from '../api';
import { useSessao } from '../sessao';
import { dataBr } from '../textos';
import { ConfiguracoesPainel } from './ConfiguracoesPainel';
import { CuponsPainel } from './CuponsPainel';
import { IAPainel } from './IAPainel';

export const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }) : '—';

const SITUACAO_BASE = {
  em_dia: { texto: 'Em dia', classe: 's-sem_impedimento' },
  atrasada: { texto: 'Atrasada', classe: 's-impedimento' },
  nao_carregada: { texto: 'Não carregada', classe: 's-impedimento' },
} as const;

type Aba = 'geral' | 'usuarios' | 'pedidos' | 'cupons' | 'configuracoes' | 'ia' | 'auditoria';

/** Painel interno, em abas: saúde do sistema e do negócio, usuários, vendas, preços e auditoria. */
export function Admin() {
  const { sessao, carregando } = useSessao();
  const [painel, setPainel] = useState<PainelResumo | null>(null);
  const [erros, setErros] = useState<ErroRegistrado[]>([]);
  const [pedidos, setPedidos] = useState<Awaited<ReturnType<typeof api.admin.pedidos>>['pedidos']>([]);
  const [falha, setFalha] = useState('');
  // A aba fica no endereço (?aba=usuarios): dá para voltar direto e mandar o link.
  const [parametros, setParametros] = useSearchParams();
  const aba = (parametros.get('aba') as Aba | null) ?? 'geral';

  async function carregar() {
    try {
      const [p, e, ped] = await Promise.all([api.admin.resumo(), api.admin.erros(), api.admin.pedidos()]);
      setPainel(p);
      setErros(e.erros);
      setPedidos(ped.pedidos);
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  const nivel = sessao?.nivelAdmin;
  useEffect(() => {
    if (nivel) carregar();
  }, [nivel]);

  if (carregando) return <div className="pagina">Carregando…</div>;
  if (!nivel && sessao?.bloqueioPainel) return <PainelBloqueado motivo={sessao.bloqueioPainel} />;
  if (!nivel) return <Navigate to="/" replace />;

  const r = painel?.resumo;
  const basesComProblema = painel?.bases.filter((b) => b.situacao !== 'em_dia').length ?? 0;
  const abas: { id: Aba; rotulo: string; marca?: number }[] = [
    { id: 'geral', rotulo: 'Visão geral', marca: (r?.erros24h ?? 0) + basesComProblema || undefined },
    { id: 'usuarios', rotulo: 'Usuários' },
    { id: 'pedidos', rotulo: 'Pedidos', marca: r?.pedidosPendentes || undefined },
    { id: 'cupons', rotulo: 'Cupons' },
    { id: 'configuracoes', rotulo: 'Preços e limites' },
    ...(nivel === 'admin'
      ? [
          { id: 'ia' as const, rotulo: 'Inteligência artificial' },
          { id: 'auditoria' as const, rotulo: 'Auditoria' },
        ]
      : []),
  ];

  return (
    <div className="pagina pagina-larga pilha">
      <div className="topo-com-acao">
        <div className="topo-pagina">
          <p className="sobretitulo">Painel administrativo</p>
          <h1 className="titulo-pagina">
            {abas.find((a) => a.id === aba)?.rotulo ?? 'Visão geral'}
            {nivel === 'suporte' && <span className="etiqueta">suporte: só leitura</span>}
          </h1>
        </div>
        <button type="button" className="botao botao-secundario" onClick={carregar}>
          Atualizar
        </button>
      </div>

      <nav className="abas-painel" aria-label="Seções do painel">
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            className={aba === a.id ? 'ativa' : ''}
            aria-current={aba === a.id ? 'page' : undefined}
            onClick={() => setParametros(a.id === 'geral' ? {} : { aba: a.id }, { replace: true })}
          >
            {a.rotulo}
            {a.marca ? <span className="aba-marca">{a.marca}</span> : null}
          </button>
        ))}
      </nav>

      {falha && <p className="alerta alerta-erro">{falha}</p>}

      {aba === 'usuarios' && <Usuarios />}
      {aba === 'cupons' && <CuponsPainel podeAlterar={nivel === 'admin'} />}
      {aba === 'configuracoes' && <ConfiguracoesPainel podeAlterar={nivel === 'admin'} />}
      {aba === 'ia' && nivel === 'admin' && <IAPainel />}
      {aba === 'auditoria' && nivel === 'admin' && <Auditoria />}

      {aba === 'geral' && r && (
        <>
          <section className="pilha-p" aria-label="Negócio">
            <h2 className="grupo-titulo">Negócio</h2>
            <div className="indicadores">
              <Indicador
                titulo="Receita recorrente"
                valor={reais(r.receitaRecorrente)}
                detalhe={`por mês · ${r.assinantes} assinantes${r.inadimplentes ? ` · ${r.inadimplentes} em atraso` : ''}`}
                alerta={r.inadimplentes > 0}
                destaque
              />
              <Indicador titulo="Receita em 30 dias" valor={reais(r.receita30d)} detalhe={`total ${reais(r.receitaTotal)}`} />
              <Indicador titulo="Pedidos pendentes" valor={r.pedidosPendentes} detalhe="aguardando pagamento" />
              <Indicador titulo="Contas" valor={r.usuarios} detalhe={`${r.confirmados} confirmadas · ${r.usuarios7d} novas em 7 dias`} />
            </div>
          </section>
          <section className="pilha-p" aria-label="Uso">
            <h2 className="grupo-titulo">Uso</h2>
            <div className="indicadores">
              <Indicador
                titulo="Consultas em 30 dias"
                valor={r.consultas30d}
                detalhe={`${r.consultas7d} em 7 dias · ${r.consultasHoje} hoje`}
              />
              <Indicador titulo="Imóveis na carteira" valor={r.imoveisCarteira} detalhe={`${r.avisos7d} avisos em 7 dias`} />
              <Indicador
                titulo="Créditos em circulação"
                valor={r.creditosEmCirculacao.consulta}
                detalhe={`consultas · ${r.creditosEmCirculacao.dossie} dossiês`}
              />
              <Indicador
                titulo="Erros nas últimas 24 h"
                valor={r.erros24h}
                detalhe={r.erros24h ? 'veja a lista abaixo' : 'tudo tranquilo'}
                alerta={r.erros24h > 0}
              />
            </div>
          </section>
        </>
      )}

      {aba === 'geral' && painel && <SaudeServidor s={painel.servidor} />}

      {aba === 'geral' && painel && (
        <section className="cartao pilha-p">
          <div className="item-topo">
            <h2 className="secao-titulo">Bases oficiais</h2>
            <span className={`selo ${basesComProblema ? 's-impedimento' : 's-sem_impedimento'}`}>
              {basesComProblema ? `${basesComProblema} com problema` : 'Todas em dia'}
            </span>
          </div>
          <div className="tabela-rolavel">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Base</th>
                  <th>Situação</th>
                  <th>Registros</th>
                  <th>Referência do órgão</th>
                  <th>Última conferência</th>
                </tr>
              </thead>
              <tbody>
                {painel.bases.map((b) => (
                  <tr key={b.fonteId}>
                    <td>{b.nome}</td>
                    <td>
                      <span className={`selo ${SITUACAO_BASE[b.situacao].classe}`}>{SITUACAO_BASE[b.situacao].texto}</span>
                    </td>
                    <td>{b.registros?.toLocaleString('pt-BR') ?? '—'}</td>
                    <td>{b.referencia ? dataBr(b.referencia) : 'download diário'}</td>
                    <td>
                      {dataHora(b.conferidoEm)}
                      {b.diasSemConferir ? ` (há ${b.diasSemConferir} d)` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {aba === 'geral' && (
        <section className="cartao pilha-p">
          <h2 className="secao-titulo">Erros recentes</h2>
          {erros.length === 0 ? (
            <p className="ajuda">Nenhum erro registrado.</p>
          ) : (
            <ul className="lista-erros">
              {erros.map((e) => (
                <li key={e.id}>
                  <details>
                    <summary>
                      <span className="fonte-suave">{dataHora(e.quando)}</span> <strong>[{e.origem}]</strong>{' '}
                      {e.rota && <code>{e.rota}</code>} {e.mensagem}
                    </summary>
                    {e.detalhe && <pre className="detalhe-erro">{e.detalhe}</pre>}
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {aba === 'pedidos' && (
        <section className="cartao pilha-p">
          <h2 className="so-leitor">Pedidos</h2>
          {pedidos.length === 0 && <p className="ajuda">Nenhum pedido ainda.</p>}
          <div className="tabela-rolavel">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Produto</th>
                  <th>Valor</th>
                  <th>Situação</th>
                  {nivel === 'admin' && <th />}
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id}>
                    <td>{dataHora(p.criadoEm)}</td>
                    <td>
                      <Link to={`/admin/usuarios/${p.usuarioId}`}>{p.email}</Link>
                    </td>
                    <td>{p.produto}</td>
                    <td>
                      {reais(p.valor)}
                      {p.cupom && (
                        <span className="ajuda" style={{ marginTop: 2 }}>
                          cupom <span className="mono">{p.cupom}</span>
                          {p.desconto ? ` (−${reais(p.desconto)})` : ''}
                        </span>
                      )}
                    </td>
                    <td>
                      {SITUACAO_PEDIDO[p.status] ?? p.status}
                      {p.provedor === 'simulado' ? ' (simulado)' : ''}
                      {p.motivoEstorno && <span className="fonte-suave"> — {p.motivoEstorno}</span>}
                    </td>
                    {nivel === 'admin' && (
                      <td>
                        {p.status === 'pago' && (
                          <button type="button" className="link-botao" onClick={() => estornar(p)}>
                            Estornar
                          </button>
                        )}
                        {p.status === 'pendente' && (
                          <button type="button" className="link-botao" onClick={() => cancelar(p)}>
                            Cancelar
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );

  async function estornar(p: { id: string; email: string; valor: number; produto: string }) {
    const motivo = window.prompt(
      `Estornar ${reais(p.valor)} (${p.produto}) de ${p.email}?\nO dinheiro volta pelo Asaas e os créditos do pacote saem da conta (o saldo pode ficar negativo).\n\nMotivo:`,
    );
    if (!motivo) return;
    try {
      await api.admin.estornar(p.id, motivo);
      await carregar();
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  async function cancelar(p: { id: string; email: string; valor: number }) {
    if (!window.confirm(`Cancelar a cobrança pendente de ${reais(p.valor)} de ${p.email}?`)) return;
    try {
      await api.admin.cancelarPedido(p.id);
      await carregar();
    } catch (e) {
      setFalha((e as Error).message);
    }
  }
}

/** Quem tem papel no painel mas não pode usá-lo nesta sessão: diz o que fazer. */
function PainelBloqueado({ motivo }: { motivo: 'reentrar' | 'dois_fatores' }) {
  const { sair } = useSessao();
  return (
    <div className="pagina pilha painel-bloqueado">
      <div className="topo-pagina">
        <p className="sobretitulo">Painel administrativo</p>
        <h1 className="titulo-pagina">{motivo === 'reentrar' ? 'Entre de novo para usar o painel' : 'Ligue a verificação em duas etapas'}</h1>
      </div>
      <section className="cartao pilha-p">
        {motivo === 'reentrar' ? (
          <>
            <p>
              Por segurança, o painel vale por 12 horas depois do login. O resto do site continua funcionando; para voltar ao painel,
              saia e entre de novo.
            </p>
            <div className="botoes-linha">
              <button type="button" className="botao botao-primario botao-auto" onClick={() => void sair().then(() => window.location.assign('/entrar?voltar=/admin'))}>
                Sair e entrar de novo
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              O painel mexe em pagamentos, créditos e cupons. Por isso, administração e suporte precisam da verificação em duas etapas:
              além da senha, um código do aplicativo autenticador do celular.
            </p>
            <div className="botoes-linha">
              <Link to="/conta#dois-fatores" className="botao botao-primario botao-auto">
                Ligar em Minha conta
              </Link>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

const SITUACAO_PEDIDO: Record<string, string> = {
  pendente: 'Aguardando pagamento',
  pago: 'Pago',
  estornado: 'Estornado',
  cancelado: 'Cancelado',
};

function Indicador({
  titulo,
  valor,
  detalhe,
  alerta,
  destaque,
}: {
  titulo: string;
  valor: number | string;
  detalhe: string;
  alerta?: boolean;
  destaque?: boolean;
}) {
  return (
    <div className={`indicador${alerta ? ' indicador-alerta' : ''}${destaque ? ' indicador-destaque' : ''}`}>
      <span className="indicador-titulo">{titulo}</span>
      <strong className="indicador-valor">{typeof valor === 'number' ? valor.toLocaleString('pt-BR') : valor}</strong>
      <span className="indicador-detalhe">{detalhe}</span>
    </div>
  );
}

export const NOME_ACAO: Record<string, string> = {
  ajustou_creditos: 'Ajustou créditos',
  entrou_como: 'Entrou como o usuário',
  saiu_do_modo_entrar_como: 'Saiu do modo "entrar como"',
  bloqueou: 'Bloqueou a conta',
  desbloqueou: 'Desbloqueou a conta',
  mudou_papel: 'Mudou o papel',
  reenviou_confirmacao: 'Reenviou a confirmação de e-mail',
  estornou_pedido: 'Estornou um pedido',
  desativou_dois_fatores: 'Desligou a verificação em duas etapas',
  cancelou_pedido: 'Cancelou um pedido',
  mudou_configuracao: 'Mudou uma configuração',
  definiu_chave_ia: 'Cadastrou a chave da OpenAI',
  apagou_chave_ia: 'Apagou a chave da OpenAI',
  cancelou_assinatura: 'Cancelou uma assinatura',
  criou_cupom: 'Criou um cupom',
  alterou_cupom: 'Alterou um cupom',
  apagou_cupom: 'Apagou um cupom',
  encerrou_desconto_cupom: 'Encerrou o desconto de cupom de uma assinatura',
};

export function descreverDetalhes(d: Record<string, unknown>): string {
  // Mudança de configuração guarda o antes e o depois inteiros: mostra só a chave.
  if (d.chave && ('antes' in d || 'depois' in d)) return `configuração: ${String(d.chave)}`;
  // Cupom alterado: o antes e o depois ficam no registro; na lista, só o código.
  if (d.cupom && ('antes' in d || 'depois' in d)) return `cupom: ${String(d.cupom)}`;
  return Object.entries(d)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}

const tamanho = (bytes: number | null) =>
  bytes == null ? '' : bytes > 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`;
const horasDesde = (iso: string | null) => (iso ? (Date.now() - Date.parse(iso)) / 3_600_000 : null);

/** Backup do banco, cópia fora do servidor e vigia do site (docs/backup-e-vigia.md). */
function SaudeServidor({ s }: { s: PainelResumo['servidor'] }) {
  const horasBackup = horasDesde(s.ultimoBackupOk);
  const backupOk = horasBackup != null && horasBackup <= 26;
  const externo = s.ultimoBackup?.externo;
  const vigiaOk = s.ultimaVigia?.ok === true && (horasDesde(s.ultimaVigia.quando) ?? 99) < 0.5;

  const linhas: { nome: string; ok: boolean; selo: string; detalhe: string }[] = [
    {
      nome: 'Backup do banco (todo dia às 3h)',
      ok: backupOk,
      selo: backupOk ? 'Em dia' : s.ultimoBackupOk ? 'Atrasado' : 'Nunca rodou',
      detalhe: s.ultimoBackupOk
        ? `Último que deu certo: ${dataHora(s.ultimoBackupOk)}${s.ultimoBackup?.localOk ? ` · ${tamanho(s.ultimoBackup.bytes)}` : ''}`
        : 'Ainda não há backup registrado.',
    },
    {
      nome: 'Cópia fora do servidor (cifrada)',
      ok: externo === 'ok',
      selo: externo === 'ok' ? 'Enviada' : externo === 'erro' ? 'Falhou' : externo === 'desligado' ? 'Desligada' : '—',
      detalhe:
        externo === 'desligado'
          ? 'Configure BACKUP_S3_* no .env.producao: sem isso, se o servidor se perder, os backups vão junto.'
          : externo === 'erro'
            ? `Última tentativa falhou${s.ultimoBackup?.mensagem ? `: ${s.ultimoBackup.mensagem.slice(0, 160)}` : ''}.`
            : s.ultimaCopiaExterna
              ? `Última cópia enviada: ${dataHora(s.ultimaCopiaExterna)}`
              : 'Ainda não há cópia registrada.',
    },
    {
      nome: 'Vigia do site (a cada 5 min, pelo endereço público)',
      ok: vigiaOk && s.vigiaAvisoConfigurado,
      selo: !s.ultimaVigia ? 'Sem dados' : !vigiaOk ? 'Falhando' : s.vigiaAvisoConfigurado ? 'No ar' : 'Sem aviso externo',
      detalhe: [
        s.ultimaVigia
          ? `Última conferência: ${dataHora(s.ultimaVigia.quando)}, ${s.ultimaVigia.ok ? `ok em ${s.ultimaVigia.ms} ms` : (s.ultimaVigia.mensagem ?? 'falhou')}`
          : 'O vigia ainda não rodou.',
        s.vigiaFalhas24h ? `${s.vigiaFalhas24h} falhas nas últimas 24 h` : '',
        s.vigiaAvisoConfigurado ? '' : 'Configure VIGIA_URL_SITE para ser avisado se o servidor cair.',
      ]
        .filter(Boolean)
        .join(' · '),
    },
  ];
  const problemas = linhas.filter((l) => !l.ok).length;

  return (
    <section className="cartao pilha-p">
      <div className="item-topo">
        <h2 className="secao-titulo">Servidor</h2>
        <span className={`selo ${problemas ? 's-impedimento' : 's-sem_impedimento'}`}>{problemas ? `${problemas} para ver` : 'Tudo em ordem'}</span>
      </div>
      <ul className="lista-servidor">
        {linhas.map((l) => (
          <li key={l.nome}>
            <span>
              <strong>{l.nome}</strong>
              <span className="fonte-suave">{l.detalhe}</span>
            </span>
            <span className={`selo ${l.ok ? 's-sem_impedimento' : 's-impedimento'}`}>{l.selo}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Auditoria() {
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  useEffect(() => {
    api.admin
      .auditoria()
      .then((r) => setRegistros(r.auditoria))
      .catch(() => undefined);
  }, []);
  return (
    <section className="cartao pilha-p">
      <h2 className="secao-titulo">Auditoria (ações administrativas)</h2>
      {registros.length === 0 ? (
        <p className="ajuda">Nenhuma ação registrada.</p>
      ) : (
        <div className="tabela-rolavel">
          <table className="tabela">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Quem</th>
                <th>Ação</th>
                <th>Em quem</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((a, i) => (
                <tr key={i}>
                  <td>{dataHora(a.quando)}</td>
                  <td>{a.adminEmail}</td>
                  <td>{NOME_ACAO[a.acao] ?? a.acao}</td>
                  <td>{a.alvoId ? <Link to={`/admin/usuarios/${a.alvoId}`}>{a.alvoEmail}</Link> : '—'}</td>
                  <td>{descreverDetalhes(a.detalhes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Usuarios() {
  const { sessao } = useSessao();
  const podeAlterar = sessao?.nivelAdmin === 'admin';
  const [busca, setBusca] = useState('');
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [ajustando, setAjustando] = useState<UsuarioAdmin | null>(null);

  async function buscar(ev?: FormEvent) {
    ev?.preventDefault();
    setUsuarios((await api.admin.usuarios(busca)).usuarios);
  }

  useEffect(() => {
    buscar();
  }, []);

  return (
    <section className="cartao pilha-p">
      <h2 className="so-leitor">Usuários</h2>
      <form onSubmit={buscar} className="linha-acompanhar">
        <input
          className="entrada"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou e-mail"
          aria-label="Buscar usuário"
        />
        <button type="submit" className="botao botao-secundario">
          Buscar
        </button>
      </form>
      <div className="tabela-rolavel">
        <table className="tabela">
          <thead>
            <tr>
              <th>Nome / e-mail</th>
              <th>Desde</th>
              <th>Consultas feitas</th>
              <th>Saldo</th>
              <th>Pago</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>
                  <Link to={`/admin/usuarios/${u.id}`}>{u.nome}</Link>
                  {u.papel !== 'usuario' && <span className="etiqueta">{u.papel}</span>}
                  {u.bloqueado && <span className="etiqueta etiqueta-vermelha">bloqueado</span>}
                  <br />
                  <span className="fonte-suave">
                    {u.email} {u.confirmado ? '' : '(não confirmado)'}
                  </span>
                </td>
                <td>{dataBr(u.criadoEm)}</td>
                <td>{u.consultas}</td>
                <td>
                  {u.saldo.consulta} consultas · {u.saldo.dossie} dossiês
                </td>
                <td>{reais(u.pago)}</td>
                <td>
                  {podeAlterar && (
                    <button type="button" className="link-botao" onClick={() => setAjustando(u)}>
                      Ajustar créditos
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ajustando && (
        <AjusteCreditos
          usuario={ajustando}
          aoFechar={async (mudou) => {
            setAjustando(null);
            if (mudou) await buscar();
          }}
        />
      )}
    </section>
  );
}

export function AjusteCreditos({ usuario, aoFechar }: { usuario: { id: string; nome: string }; aoFechar: (mudou: boolean) => void }) {
  const [tipo, setTipo] = useState<'consulta' | 'dossie'>('consulta');
  const [quantidade, setQuantidade] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErro('');
    try {
      await api.admin.ajustarCreditos(usuario.id, tipo, Number(quantidade), motivo);
      aoFechar(true);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <form className="cartao pilha-p ajuste" onSubmit={salvar}>
      <strong>Ajustar créditos de {usuario.nome}</strong>
      <p className="ajuda" style={{ marginTop: 0 }}>
        Use número negativo para retirar. O ajuste fica registrado com seu e-mail e o motivo.
      </p>
      <div className="linha-acompanhar">
        <select
          className="entrada"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as 'consulta' | 'dossie')}
          aria-label="Tipo de crédito"
        >
          <option value="consulta">Consultas</option>
          <option value="dossie">Dossiês</option>
        </select>
        <input
          className="entrada"
          type="number"
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
          aria-label="Quantidade"
        />
      </div>
      <input
        className="entrada"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo (ex.: cortesia para piloto)"
        aria-label="Motivo"
      />
      {erro && <p className="alerta alerta-erro">{erro}</p>}
      <div className="botoes">
        <button type="submit" className="botao botao-primario">
          Salvar ajuste
        </button>
        <button type="button" className="botao botao-secundario" onClick={() => aoFechar(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
