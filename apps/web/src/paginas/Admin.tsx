import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, type ErroRegistrado, type PainelResumo, type RegistroAuditoria, type UsuarioAdmin } from '../api';
import { useSessao } from '../sessao';
import { dataBr } from '../textos';
import { ConfiguracoesPainel } from './ConfiguracoesPainel';

export const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }) : '—';

const SITUACAO_BASE = {
  em_dia: { texto: 'Em dia', classe: 's-sem_impedimento' },
  atrasada: { texto: 'Atrasada', classe: 's-impedimento' },
  nao_carregada: { texto: 'Não carregada', classe: 's-impedimento' },
} as const;

/** Painel interno: saúde do sistema, erros, usuários e vendas. */
export function Admin() {
  const { sessao, carregando } = useSessao();
  const [painel, setPainel] = useState<PainelResumo | null>(null);
  const [erros, setErros] = useState<ErroRegistrado[]>([]);
  const [pedidos, setPedidos] = useState<Awaited<ReturnType<typeof api.admin.pedidos>>['pedidos']>([]);
  const [falha, setFalha] = useState('');

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
  if (!nivel) return <Navigate to="/" replace />;

  const r = painel?.resumo;
  return (
    <div className="pagina pagina-larga pilha">
      <div className="item-topo">
        <h1 className="titulo-pagina">Painel {nivel === 'suporte' && <span className="fonte-suave">(suporte: só leitura)</span>}</h1>
        <button type="button" className="botao botao-secundario" onClick={carregar}>
          Atualizar
        </button>
      </div>
      {falha && <p className="alerta alerta-erro">{falha}</p>}

      {r && (
        <section className="indicadores" aria-label="Indicadores">
          <Indicador titulo="Contas" valor={r.usuarios} detalhe={`${r.confirmados} confirmadas · ${r.usuarios7d} nos últimos 7 dias`} />
          <Indicador titulo="Consultas" valor={r.consultas30d} detalhe={`30 dias · ${r.consultas7d} em 7 dias · ${r.consultasHoje} hoje`} />
          <Indicador titulo="Receita" valor={reais(r.receita30d)} detalhe={`30 dias · total ${reais(r.receitaTotal)}`} />
          <Indicador titulo="Pedidos pendentes" valor={r.pedidosPendentes} detalhe="aguardando pagamento" />
          <Indicador
            titulo="Créditos em circulação"
            valor={r.creditosEmCirculacao.consulta}
            detalhe={`consultas · ${r.creditosEmCirculacao.dossie} dossiês`}
          />
          <Indicador titulo="Carteira" valor={r.imoveisCarteira} detalhe={`imóveis · ${r.avisos7d} avisos em 7 dias`} />
          <Indicador titulo="Erros (24h)" valor={r.erros24h} detalhe="ver lista abaixo" alerta={r.erros24h > 0} />
        </section>
      )}

      {painel && (
        <section className="cartao pilha-p">
          <h2 className="secao-titulo">Bases oficiais</h2>
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
                    <span className="fonte-suave">{dataHora(e.quando)}</span> <strong>[{e.origem}]</strong> {e.rota && <code>{e.rota}</code>}{' '}
                    {e.mensagem}
                  </summary>
                  {e.detalhe && <pre className="detalhe-erro">{e.detalhe}</pre>}
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Usuarios />

      {nivel === 'admin' && <Auditoria />}

      <section className="cartao pilha-p">
        <h2 className="secao-titulo">Pedidos</h2>
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
                  <td>{reais(p.valor)}</td>
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

      <ConfiguracoesPainel podeAlterar={nivel === 'admin'} />
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

const SITUACAO_PEDIDO: Record<string, string> = {
  pendente: 'Aguardando pagamento',
  pago: 'Pago',
  estornado: 'Estornado',
  cancelado: 'Cancelado',
};

function Indicador({ titulo, valor, detalhe, alerta }: { titulo: string; valor: number | string; detalhe: string; alerta?: boolean }) {
  return (
    <div className={`cartao indicador${alerta ? ' indicador-alerta' : ''}`}>
      <span className="fonte-suave">{titulo}</span>
      <strong className="indicador-valor">{typeof valor === 'number' ? valor.toLocaleString('pt-BR') : valor}</strong>
      <span className="ajuda" style={{ marginTop: 0 }}>
        {detalhe}
      </span>
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
  cancelou_pedido: 'Cancelou um pedido',
  mudou_configuracao: 'Mudou uma configuração',
};

export function descreverDetalhes(d: Record<string, unknown>): string {
  // Mudança de configuração guarda o antes e o depois inteiros: mostra só a chave.
  if (d.chave && ('antes' in d || 'depois' in d)) return `configuração: ${String(d.chave)}`;
  return Object.entries(d)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
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
      <h2 className="secao-titulo">Usuários</h2>
      <form onSubmit={buscar} className="linha-acompanhar">
        <input className="entrada" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar usuário" />
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
        <select className="entrada" value={tipo} onChange={(e) => setTipo(e.target.value as 'consulta' | 'dossie')} aria-label="Tipo de crédito">
          <option value="consulta">Consultas</option>
          <option value="dossie">Dossiês</option>
        </select>
        <input className="entrada" type="number" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} aria-label="Quantidade" />
      </div>
      <input className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (ex.: cortesia para piloto)" aria-label="Motivo" />
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
