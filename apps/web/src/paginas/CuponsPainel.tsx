import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, type CupomAdmin, type DadosCupom, type ItemCupom, type SituacaoCupom, type UsoCupom } from '../api';
import { dataBr } from '../textos';
import { dataHora, reais } from './Admin';

/** Menor cobrança do Asaas: o cupom não pode deixar um pagamento entre R$ 0,01 e R$ 4,99 (docs/cupons.md). */
const MINIMO_COBRANCA = 5;

const SITUACAO: Record<SituacaoCupom, { texto: string; classe: string }> = {
  ativo: { texto: 'Valendo', classe: 's-sem_impedimento' },
  agendado: { texto: 'Agendado', classe: 's-atencao' },
  pausado: { texto: 'Pausado', classe: 's-nao_verificado' },
  vencido: { texto: 'Vencido', classe: 's-nao_verificado' },
  esgotado: { texto: 'Esgotado', classe: 's-impedimento' },
};

const SITUACAO_USO: Record<UsoCupom['status'], string> = {
  reservado: 'Aguardando pagamento',
  usado: 'Pago',
  liberado: 'Não contou (cancelado ou estornado)',
};

const NOVO: DadosCupom = {
  codigo: '',
  descricao: '',
  tipo: 'percentual',
  valor: 20,
  alvos: [],
  meses: 1,
  limiteUsos: null,
  limitePorConta: 1,
  apenasNovos: false,
  validoDe: null,
  validoAte: null,
  ativo: true,
};

const centavos = (v: number) => Math.round(v * 100) / 100;
const precoCom = (c: Pick<DadosCupom, 'tipo' | 'valor'>, valor: number) =>
  Math.max(0, centavos(valor - (c.tipo === 'percentual' ? (valor * c.valor) / 100 : c.valor)));

function descreverDesconto(c: Pick<DadosCupom, 'tipo' | 'valor'>) {
  return c.tipo === 'percentual' ? `${c.valor.toLocaleString('pt-BR')}%` : reais(c.valor);
}

function descreverMeses(meses: number | null) {
  if (meses == null) return 'todas as mensalidades';
  return meses === 1 ? '1ª mensalidade' : `${meses} primeiras mensalidades`;
}

function descreverValidade(c: Pick<DadosCupom, 'validoDe' | 'validoAte'>) {
  if (!c.validoDe && !c.validoAte) return 'Sem prazo';
  if (c.validoDe && c.validoAte) return `${dataBr(c.validoDe)} a ${dataBr(c.validoAte)}`;
  return c.validoDe ? `A partir de ${dataBr(c.validoDe)}` : `Até ${dataBr(c.validoAte!)}`;
}

/** Código fácil de ditar por telefone: sem 0/O nem 1/I. */
function gerarCodigo() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `APTO${Array.from(crypto.getRandomValues(new Uint8Array(5)), (n) => letras[n % letras.length]).join('')}`;
}

const linkDivulgacao = (codigo: string) => `${window.location.origin}/planos?cupom=${encodeURIComponent(codigo)}`;

/**
 * Aba "Cupons" do painel: criar, editar, pausar e acompanhar os cupons de desconto.
 * O desconto vai para o Asaas no valor da cobrança ou da assinatura (docs/cupons.md).
 */
export function CuponsPainel({ podeAlterar }: { podeAlterar: boolean }) {
  const [cupons, setCupons] = useState<CupomAdmin[] | null>(null);
  const [itens, setItens] = useState<ItemCupom[]>([]);
  const [editando, setEditando] = useState<{ id?: string; dados: DadosCupom; usado: boolean } | null>(null);
  const [vendo, setVendo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  async function carregar() {
    try {
      const r = await api.admin.cupons();
      setCupons(r.cupons);
      setItens(r.itens);
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message });
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  const dadosDe = (c: CupomAdmin): DadosCupom => ({
    codigo: c.codigo,
    descricao: c.descricao,
    tipo: c.tipo,
    valor: c.valor,
    alvos: c.alvos,
    meses: c.meses,
    limiteUsos: c.limiteUsos,
    limitePorConta: c.limitePorConta,
    apenasNovos: c.apenasNovos,
    validoDe: c.validoDe,
    validoAte: c.validoAte,
    ativo: c.ativo,
  });

  async function alternar(c: CupomAdmin) {
    setAviso(null);
    try {
      await api.admin.salvarCupom(c.id, { ...dadosDe(c), ativo: !c.ativo });
      setAviso({ tipo: 'ok', texto: c.ativo ? `Cupom ${c.codigo} pausado: não vale mais em compras novas.` : `Cupom ${c.codigo} valendo de novo.` });
      await carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message });
    }
  }

  async function apagar(c: CupomAdmin) {
    if (!window.confirm(`Apagar o cupom ${c.codigo}? Só dá para apagar cupom que nunca foi usado.`)) return;
    setAviso(null);
    try {
      await api.admin.apagarCupom(c.id);
      setAviso({ tipo: 'ok', texto: `Cupom ${c.codigo} apagado.` });
      await carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message });
    }
  }

  async function copiar(codigo: string) {
    try {
      await navigator.clipboard.writeText(linkDivulgacao(codigo));
      setAviso({ tipo: 'ok', texto: `Link copiado: ${linkDivulgacao(codigo)}` });
    } catch {
      setAviso({ tipo: 'ok', texto: `Link de divulgação: ${linkDivulgacao(codigo)}` });
    }
  }

  const nomeItem = (id: string) => itens.find((i) => i.id === id)?.nome ?? id;
  const valeEmPlano = (c: CupomAdmin) => c.alvos.length === 0 || c.alvos.some((id) => itens.find((i) => i.id === id)?.plano);

  if (editando) {
    return (
      <FormularioCupom
        inicial={editando}
        itens={itens}
        aoFechar={async (texto) => {
          setEditando(null);
          if (texto) setAviso({ tipo: 'ok', texto });
          await carregar();
        }}
      />
    );
  }
  if (vendo) return <UsosCupom id={vendo} podeAlterar={podeAlterar} aoFechar={() => (setVendo(null), void carregar())} />;

  return (
    <div className="pilha">
      <section className="cartao pilha-p">
        <div className="topo-com-acao">
          <div>
            <h2 className="secao-titulo">Cupons de desconto</h2>
            <p className="ajuda" style={{ marginTop: 2 }}>
              O desconto vai direto para a cobrança no Asaas. Na assinatura, as mensalidades voltam sozinhas ao valor cheio quando acabam
              os meses de desconto. Divulgue o link <span className="mono">/planos?cupom=CÓDIGO</span>: o cupom já entra aplicado.
            </p>
          </div>
          {podeAlterar && (
            <button type="button" className="botao botao-primario botao-auto" onClick={() => setEditando({ dados: { ...NOVO }, usado: false })}>
              Novo cupom
            </button>
          )}
        </div>
        {aviso && <p className={`alerta ${aviso.tipo === 'erro' ? 'alerta-erro' : 'alerta-ok'}`}>{aviso.texto}</p>}
        {cupons?.length === 0 && <p className="ajuda">Nenhum cupom ainda. Crie o primeiro para os seus clientes de lançamento.</p>}
        {cupons && cupons.length > 0 && (
          <div className="tabela-rolavel">
            <table className="tabela tabela-cupons">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Desconto</th>
                  <th>Vale em</th>
                  <th>Usos</th>
                  <th>Validade</th>
                  <th>Situação</th>
                  <th>Desconto dado</th>
                  <th>Receita</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cupons.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong className="mono">{c.codigo}</strong>
                      {c.descricao && <span className="ajuda" style={{ marginTop: 2 }}>{c.descricao}</span>}
                    </td>
                    <td>
                      {descreverDesconto(c)}
                      {(valeEmPlano(c) || c.apenasNovos) && (
                        <span className="ajuda" style={{ marginTop: 2 }}>
                          {valeEmPlano(c) ? `assinatura: ${descreverMeses(c.meses)}` : ''}
                          {valeEmPlano(c) && c.apenasNovos ? ' · ' : ''}
                          {c.apenasNovos ? 'só na 1ª compra' : ''}
                        </span>
                      )}
                    </td>
                    <td>{c.alvos.length === 0 ? 'Tudo' : c.alvos.map(nomeItem).join(', ')}</td>
                    <td>
                      {c.usados}
                      {c.limiteUsos != null ? ` de ${c.limiteUsos}` : ''}
                      <span className="ajuda" style={{ marginTop: 2 }}>
                        {c.reservados ? `${c.reservados} aguardando pagamento · ` : ''}
                        {c.limitePorConta === 1 ? '1 por conta' : `${c.limitePorConta} por conta`}
                      </span>
                    </td>
                    <td>{descreverValidade(c)}</td>
                    <td>
                      <span className={`selo ${SITUACAO[c.situacao].classe}`}>{SITUACAO[c.situacao].texto}</span>
                    </td>
                    <td>{reais(c.descontoConcedido)}</td>
                    <td>{reais(c.receita)}</td>
                    <td className="acoes-cupom">
                      <button type="button" className="link-botao" onClick={() => setVendo(c.id)}>
                        Usos
                      </button>
                      <button type="button" className="link-botao" onClick={() => copiar(c.codigo)}>
                        Copiar link
                      </button>
                      {podeAlterar && (
                        <>
                          <button type="button" className="link-botao" onClick={() => setEditando({ id: c.id, dados: dadosDe(c), usado: c.usados + c.reservados > 0 })}>
                            Editar
                          </button>
                          <button type="button" className="link-botao" onClick={() => alternar(c)}>
                            {c.ativo ? 'Pausar' : 'Ativar'}
                          </button>
                          {c.usados + c.reservados === 0 && (
                            <button type="button" className="link-botao" onClick={() => apagar(c)}>
                              Apagar
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** Criar ou editar um cupom, com a simulação do preço em cada plano e produto. */
function FormularioCupom({
  inicial,
  itens,
  aoFechar,
}: {
  inicial: { id?: string; dados: DadosCupom; usado: boolean };
  itens: ItemCupom[];
  aoFechar: (aviso?: string) => void;
}) {
  const [d, setD] = useState<DadosCupom>(inicial.dados);
  const [erro, setErro] = useState<{ texto: string; campo?: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const mudar = <K extends keyof DadosCupom>(k: K, v: DadosCupom[K]) => setD((x) => ({ ...x, [k]: v }));
  const numero = (texto: string) => (texto === '' ? NaN : Number(texto.replace(',', '.')));

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const r = inicial.id ? await api.admin.salvarCupom(inicial.id, d) : await api.admin.criarCupom(d);
      aoFechar(inicial.id ? `Cupom ${r.cupom.codigo} salvo.` : `Cupom ${r.cupom.codigo} criado. Link de divulgação: ${linkDivulgacao(r.cupom.codigo)}`);
    } catch (e) {
      setErro({ texto: (e as Error).message, campo: (e as { campo?: string }).campo });
      setSalvando(false);
    }
  }

  const todos = d.alvos.length === 0;
  const alternarAlvo = (id: string) => mudar('alvos', d.alvos.includes(id) ? d.alvos.filter((a) => a !== id) : [...d.alvos, id]);
  const valeEm = (id: string) => todos || d.alvos.includes(id);
  const valorOk = Number.isFinite(d.valor) && d.valor > 0;

  return (
    <form className="cartao pilha formulario-cupom" onSubmit={salvar} noValidate>
      <div className="topo-com-acao">
        <h2 className="secao-titulo">{inicial.id ? `Editar cupom ${inicial.dados.codigo}` : 'Novo cupom'}</h2>
        <button type="button" className="link-botao" onClick={() => aoFechar()}>
          Voltar para a lista
        </button>
      </div>
      {inicial.usado && (
        <p className="alerta" role="note">
          Este cupom já foi usado. Mudanças valem para as compras novas; quem já comprou ou assinou mantém as condições do dia.
        </p>
      )}

      <div className="grade-cupom">
        <label className="campo">
          <span className="rotulo">Código</span>
          <span className="linha-acompanhar">
            <input
              className="entrada entrada-cupom"
              value={d.codigo}
              onChange={(e) => mudar('codigo', e.target.value.toUpperCase())}
              maxLength={30}
              placeholder="Ex.: BEMVINDO30"
              disabled={inicial.usado}
              aria-invalid={erro?.campo === 'codigo' ? true : undefined}
              required
            />
            {!inicial.usado && (
              <button type="button" className="botao botao-secundario botao-auto" onClick={() => mudar('codigo', gerarCodigo())}>
                Gerar
              </button>
            )}
          </span>
          <span className="ajuda">3 a 30 letras, números, hífen ou sublinhado. O cliente pode digitar em minúsculas.</span>
        </label>

        <label className="campo">
          <span className="rotulo">Anotação interna (o cliente não vê)</span>
          <input className="entrada" value={d.descricao} maxLength={200} onChange={(e) => mudar('descricao', e.target.value)} placeholder="Ex.: Feira de Sorriso, parceiro X" />
        </label>
      </div>

      <fieldset className="campo grupo-cupom">
        <legend className="rotulo">Desconto</legend>
        <div className="linha-acompanhar">
          <label className="marcar">
            <input type="radio" name="tipo" checked={d.tipo === 'percentual'} onChange={() => mudar('tipo', 'percentual')} />
            <span>Porcentagem (%)</span>
          </label>
          <label className="marcar">
            <input type="radio" name="tipo" checked={d.tipo === 'fixo'} onChange={() => mudar('tipo', 'fixo')} />
            <span>Valor fixo (R$)</span>
          </label>
        </div>
        <label className="campo" style={{ marginTop: 8 }}>
          <span className="ajuda" style={{ marginTop: 0 }}>{d.tipo === 'percentual' ? 'Quantos por cento (1 a 100)' : 'Quantos reais a menos'}</span>
          <input
            className="entrada entrada-numero"
            type="number"
            inputMode="decimal"
            min={0.01}
            max={d.tipo === 'percentual' ? 100 : undefined}
            step={0.01}
            value={Number.isFinite(d.valor) ? d.valor : ''}
            onChange={(e) => mudar('valor', numero(e.target.value))}
            aria-invalid={erro?.campo === 'valor' ? true : undefined}
          />
        </label>
      </fieldset>

      <fieldset className="campo grupo-cupom">
        <legend className="rotulo">Vale em</legend>
        <label className="marcar">
          <input type="checkbox" checked={todos} onChange={() => mudar('alvos', todos ? itens.filter((i) => i.ativo).map((i) => i.id) : [])} />
          <span>Todos os planos e produtos</span>
        </label>
        {!todos && (
          <div className="lista-alvos">
            {itens.map((i) => (
              <label key={i.id} className="marcar">
                <input type="checkbox" checked={d.alvos.includes(i.id)} onChange={() => alternarAlvo(i.id)} />
                <span>
                  {i.plano ? `Plano ${i.nome}` : i.nome} ({reais(i.valor)}
                  {i.plano ? '/mês' : ''}){i.ativo ? '' : ' · fora de venda'}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="campo grupo-cupom">
        <legend className="rotulo">Na assinatura mensal, o desconto vale por</legend>
        <div className="linha-acompanhar">
          <label className="marcar">
            <input type="radio" name="meses" checked={d.meses != null} onChange={() => mudar('meses', d.meses ?? 1)} />
            <span>Algumas mensalidades</span>
          </label>
          <label className="marcar">
            <input type="radio" name="meses" checked={d.meses == null} onChange={() => mudar('meses', null)} />
            <span>Todas, enquanto a assinatura durar</span>
          </label>
        </div>
        {d.meses != null && (
          <label className="campo" style={{ marginTop: 8 }}>
            <span className="ajuda" style={{ marginTop: 0 }}>Quantas mensalidades com desconto (depois, o valor volta ao cheio sozinho no Asaas)</span>
            <input
              className="entrada entrada-numero"
              type="number"
              min={1}
              max={120}
              value={Number.isFinite(d.meses) ? d.meses : ''}
              onChange={(e) => mudar('meses', numero(e.target.value))}
            />
          </label>
        )}
      </fieldset>

      <div className="grade-cupom">
        <fieldset className="campo grupo-cupom">
          <legend className="rotulo">Quantas vezes pode ser usado</legend>
          <label className="marcar">
            <input type="checkbox" checked={d.limiteUsos == null} onChange={(e) => mudar('limiteUsos', e.target.checked ? null : 10)} />
            <span>Sem limite no total</span>
          </label>
          {d.limiteUsos != null && (
            <label className="campo" style={{ marginTop: 8 }}>
              <span className="ajuda" style={{ marginTop: 0 }}>Usos no total (ex.: os 10 primeiros clientes)</span>
              <input
                className="entrada entrada-numero"
                type="number"
                min={1}
                value={Number.isFinite(d.limiteUsos) ? d.limiteUsos : ''}
                onChange={(e) => mudar('limiteUsos', numero(e.target.value))}
              />
            </label>
          )}
          <label className="campo" style={{ marginTop: 8 }}>
            <span className="ajuda" style={{ marginTop: 0 }}>Usos por conta</span>
            <input
              className="entrada entrada-numero"
              type="number"
              min={1}
              value={Number.isFinite(d.limitePorConta) ? d.limitePorConta : ''}
              onChange={(e) => mudar('limitePorConta', numero(e.target.value))}
            />
          </label>
          <label className="marcar" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={d.apenasNovos} onChange={(e) => mudar('apenasNovos', e.target.checked)} />
            <span>Só para quem nunca comprou nem assinou</span>
          </label>
        </fieldset>

        <fieldset className="campo grupo-cupom">
          <legend className="rotulo">Quando vale (horário de Brasília)</legend>
          <label className="campo">
            <span className="ajuda" style={{ marginTop: 0 }}>A partir de (vazio = já)</span>
            <input className="entrada" type="date" value={d.validoDe ?? ''} onChange={(e) => mudar('validoDe', e.target.value || null)} />
          </label>
          <label className="campo" style={{ marginTop: 8 }}>
            <span className="ajuda" style={{ marginTop: 0 }}>Até (inclusive; vazio = sem data para acabar)</span>
            <input
              className="entrada"
              type="date"
              value={d.validoAte ?? ''}
              onChange={(e) => mudar('validoAte', e.target.value || null)}
              aria-invalid={erro?.campo === 'validoAte' ? true : undefined}
            />
          </label>
          <label className="marcar" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={d.ativo} onChange={(e) => mudar('ativo', e.target.checked)} />
            <span>Ativo (desmarque para pausar)</span>
          </label>
        </fieldset>
      </div>

      <section className="pilha-p">
        <h3 className="secao-titulo">Como fica o preço</h3>
        <div className="tabela-rolavel">
          <table className="tabela">
            <thead>
              <tr>
                <th>Plano ou produto</th>
                <th>Preço</th>
                <th>Com o cupom</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {itens
                .filter((i) => i.ativo)
                .map((i) => {
                  const final = valorOk ? precoCom(d, i.valor) : i.valor;
                  const vale = valeEm(i.id);
                  const abaixo = vale && valorOk && (i.plano ? final < MINIMO_COBRANCA : final > 0 && final < MINIMO_COBRANCA);
                  return (
                    <tr key={i.id}>
                      <td>{i.plano ? `Plano ${i.nome}` : i.nome}</td>
                      <td>
                        {reais(i.valor)}
                        {i.plano ? '/mês' : ''}
                      </td>
                      <td>
                        {!vale ? (
                          <span className="fonte-suave">não vale</span>
                        ) : (
                          <>
                            <strong>{final === 0 ? 'Grátis' : reais(final)}</strong>
                            {i.plano && final > 0 ? `/mês (${descreverMeses(d.meses)})` : ''}
                          </>
                        )}
                      </td>
                      <td>
                        {abaixo && (
                          <span className="etiqueta etiqueta-vermelha">
                            {i.plano ? 'mensalidade abaixo de R$ 5,00: o cupom será recusado' : 'abaixo de R$ 5,00: o cupom será recusado'}
                          </span>
                        )}
                        {vale && !i.plano && final === 0 && <span className="etiqueta">sem cobrança: créditos na hora</span>}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <p className="ajuda">O Asaas não cobra menos de R$ 5,00. Compra avulsa de graça (100%) é liberada sem cobrança; mensalidade precisa ficar em R$ 5,00 ou mais.</p>
      </section>

      {erro && (
        <p className="alerta alerta-erro" role="alert">
          {erro.texto}
        </p>
      )}
      <div className="botoes">
        <button type="submit" className="botao botao-primario botao-auto" disabled={salvando}>
          {salvando ? 'Salvando…' : inicial.id ? 'Salvar cupom' : 'Criar cupom'}
        </button>
        <button type="button" className="botao botao-secundario botao-auto" onClick={() => aoFechar()}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Quem usou o cupom, em quê e quanto pagou; assinatura com desconto pode ser encerrada aqui. */
function UsosCupom({ id, podeAlterar, aoFechar }: { id: string; podeAlterar: boolean; aoFechar: () => void }) {
  const [dados, setDados] = useState<{ cupom: CupomAdmin; usos: UsoCupom[] } | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  async function carregar() {
    try {
      setDados(await api.admin.cupom(id));
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message });
    }
  }
  useEffect(() => {
    carregar();
  }, [id]);

  async function encerrar(u: UsoCupom) {
    if (!window.confirm(`Encerrar agora o desconto de ${u.email}? As próximas mensalidades do plano ${u.nomeItem} voltam a ${reais(u.valorOriginal)} no Asaas.`)) return;
    setAviso(null);
    try {
      const r = await api.admin.encerrarDescontoCupom(u.id);
      setAviso({ tipo: 'ok', texto: r.mensagem });
      await carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message });
    }
  }

  if (!dados) return <p className="ajuda">{aviso?.texto ?? 'Carregando…'}</p>;
  const { cupom, usos } = dados;
  return (
    <section className="cartao pilha-p">
      <div className="topo-com-acao">
        <h2 className="secao-titulo">
          Usos do cupom <span className="mono">{cupom.codigo}</span>
        </h2>
        <button type="button" className="link-botao" onClick={aoFechar}>
          Voltar para a lista
        </button>
      </div>
      {aviso && <p className={`alerta ${aviso.tipo === 'erro' ? 'alerta-erro' : 'alerta-ok'}`}>{aviso.texto}</p>}
      {usos.length === 0 && <p className="ajuda">Ninguém usou este cupom ainda.</p>}
      {usos.length > 0 && (
        <div className="tabela-rolavel">
          <table className="tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>Em</th>
                <th>Valor</th>
                <th>Situação</th>
                <th>Desconto na assinatura</th>
                {podeAlterar && <th />}
              </tr>
            </thead>
            <tbody>
              {usos.map((u) => (
                <tr key={u.id}>
                  <td>{dataHora(u.criadoEm)}</td>
                  <td>
                    <Link to={`/admin/usuarios/${u.usuarioId}`}>{u.email || '(conta excluída)'}</Link>
                  </td>
                  <td>{u.assinaturaId ? `Plano ${u.nomeItem}` : u.nomeItem}</td>
                  <td>
                    <s className="fonte-suave">{reais(u.valorOriginal)}</s> {u.valorFinal === 0 ? 'Grátis' : reais(u.valorFinal)}
                    {u.assinaturaId ? '/mês' : ''}
                  </td>
                  <td>{SITUACAO_USO[u.status]}</td>
                  <td>
                    {!u.assinaturaId
                      ? '—'
                      : u.descontoEncerradoEm
                        ? `Acabou em ${dataHora(u.descontoEncerradoEm)} (${u.mensalidadesPagas} com desconto)`
                        : u.meses == null
                          ? `${u.mensalidadesPagas} paga(s), sem prazo para acabar`
                          : `${u.mensalidadesPagas} de ${u.meses} mensalidades`}
                  </td>
                  {podeAlterar && (
                    <td>
                      {u.assinaturaId && !u.descontoEncerradoEm && u.status !== 'liberado' && (
                        <button type="button" className="link-botao" onClick={() => encerrar(u)}>
                          Encerrar desconto
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
