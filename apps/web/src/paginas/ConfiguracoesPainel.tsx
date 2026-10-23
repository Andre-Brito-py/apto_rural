import { useEffect, useState, type ReactNode } from 'react';
import { api, type Configs, type Plano, type Produto } from '../api';

/**
 * Preços, limites e aviso do site, sem mexer no código. Cada bloco salva
 * sozinho, é validado pela API e fica na auditoria. Suporte só vê.
 */
export function ConfiguracoesPainel({ podeAlterar }: { podeAlterar: boolean }) {
  const [cfg, setCfg] = useState<Configs | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api.admin
      .configuracoes()
      .then(setCfg)
      .catch((e: Error) => setErro(e.message));
  }, []);

  if (erro) return <p className="alerta alerta-erro">{erro}</p>;
  if (!cfg) return null;

  return (
    <section className="cartao pilha-p">
      <h2 className="secao-titulo">Configurações {podeAlterar ? '' : <span className="fonte-suave">(só leitura)</span>}</h2>
      <p className="ajuda" style={{ marginTop: 0 }}>
        Mudanças valem para compras novas em até 30 segundos. Pedidos já feitos mantêm o preço e os créditos da compra.
      </p>
      <PlanosEditor inicial={cfg.planos} podeAlterar={podeAlterar} />
      <Pacotes inicial={cfg.produtos} podeAlterar={podeAlterar} />
      <div className="grade-3">
        <Bloco
          titulo="Carteira de quem não assina"
          podeAlterar={podeAlterar}
          salvar={(v) => api.admin.salvarConfiguracao('limite_carteira', v)}
          inicial={cfg.limite_carteira}
          render={(v, set) => (
            <label className="campo">
              <span className="ajuda">Imóveis por conta (assinantes usam o limite do plano)</span>
              <input className="entrada" type="number" min={0} value={v} onChange={(e) => set(Number(e.target.value))} disabled={!podeAlterar} />
            </label>
          )}
        />
        <Bloco
          titulo="Amostra grátis"
          podeAlterar={podeAlterar}
          salvar={(v) => api.admin.salvarConfiguracao('creditos_boas_vindas', v)}
          inicial={cfg.creditos_boas_vindas}
          render={(v, set) => (
            <div className="linha-acompanhar">
              <label>
                <span className="ajuda">Consultas</span>
                <input className="entrada" type="number" min={0} value={v.consulta} onChange={(e) => set({ ...v, consulta: Number(e.target.value) })} disabled={!podeAlterar} />
              </label>
              <label>
                <span className="ajuda">Dossiês</span>
                <input className="entrada" type="number" min={0} value={v.dossie} onChange={(e) => set({ ...v, dossie: Number(e.target.value) })} disabled={!podeAlterar} />
              </label>
            </div>
          )}
        />
        <Bloco
          titulo="Aviso no topo do site"
          podeAlterar={podeAlterar}
          salvar={(v) => api.admin.salvarConfiguracao('aviso_site', v)}
          inicial={cfg.aviso_site}
          render={(v, set) => (
            <div className="pilha-p">
              <textarea
                className="entrada"
                rows={2}
                maxLength={300}
                value={v.texto}
                placeholder="Ex.: Manutenção hoje às 22h."
                onChange={(e) => set({ ...v, texto: e.target.value })}
                disabled={!podeAlterar}
              />
              <div className="linha-acompanhar">
                <select className="entrada" value={v.tipo} onChange={(e) => set({ ...v, tipo: e.target.value as 'info' | 'alerta' })} disabled={!podeAlterar}>
                  <option value="info">Informação (verde)</option>
                  <option value="alerta">Alerta (amarelo)</option>
                </select>
                <label className="marcar" style={{ paddingTop: 0 }}>
                  <input type="checkbox" checked={v.ativo} onChange={(e) => set({ ...v, ativo: e.target.checked })} disabled={!podeAlterar} />
                  <span>Mostrar</span>
                </label>
              </div>
            </div>
          )}
        />
      </div>
    </section>
  );
}

/** Um bloco de configuração com seu próprio botão de salvar. */
function Bloco<T>({
  titulo,
  inicial,
  render,
  salvar,
  podeAlterar,
}: {
  titulo: string;
  inicial: T;
  render: (valor: T, definir: (v: T) => void) => ReactNode;
  salvar: (v: T) => Promise<unknown>;
  podeAlterar: boolean;
}) {
  const [valor, setValor] = useState(inicial);
  const [estado, setEstado] = useState<{ ok?: string; erro?: string }>({});

  async function enviar() {
    setEstado({});
    try {
      await salvar(valor);
      setEstado({ ok: 'Salvo.' });
    } catch (e) {
      setEstado({ erro: (e as Error).message });
    }
  }

  return (
    <div className="cartao pilha-p">
      <strong>{titulo}</strong>
      {render(valor, setValor)}
      {podeAlterar && (
        <button type="button" className="botao botao-secundario" onClick={enviar}>
          Salvar
        </button>
      )}
      {estado.ok && <span className="verificacao sim">✓ {estado.ok}</span>}
      {estado.erro && <span className="alerta alerta-erro">{estado.erro}</span>}
    </div>
  );
}

function PlanosEditor({ inicial, podeAlterar }: { inicial: Plano[]; podeAlterar: boolean }) {
  const [planos, setPlanos] = useState(inicial);
  const [estado, setEstado] = useState<{ ok?: string; erro?: string }>({});
  const originais = new Set(inicial.map((p) => p.id));

  function mudar(i: number, campo: Partial<Plano>) {
    setPlanos((ps) => ps.map((p, j) => (j === i ? { ...p, ...campo } : p)));
  }

  async function salvar() {
    setEstado({});
    try {
      const r = await api.admin.salvarConfiguracao('planos', planos);
      setPlanos(r.valor);
      setEstado({ ok: 'Planos salvos.' });
    } catch (e) {
      setEstado({ erro: (e as Error).message });
    }
  }

  const num = (v: string) => Number(v);

  return (
    <div className="pilha-p">
      <strong>Planos mensais (assinatura)</strong>
      <div className="tabela-rolavel">
        <table className="tabela tabela-edicao">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome</th>
              <th>Descrição</th>
              <th>R$/mês</th>
              <th>Consultas/mês</th>
              <th>Dossiês/mês</th>
              <th>Carteira</th>
              <th title="Pessoas que usam a conta, contando o responsável. 1 = sem equipe.">Pessoas</th>
              <th>Destaque</th>
              <th>Ativo</th>
            </tr>
          </thead>
          <tbody>
            {planos.map((p, i) => (
              <tr key={i}>
                <td>
                  {originais.has(p.id) ? (
                    <code>{p.id}</code>
                  ) : (
                    <input className="entrada" value={p.id} placeholder="ex.: plano-safra" onChange={(e) => mudar(i, { id: e.target.value })} disabled={!podeAlterar} />
                  )}
                </td>
                <td>
                  <input className="entrada" value={p.nome} onChange={(e) => mudar(i, { nome: e.target.value })} disabled={!podeAlterar} />
                </td>
                <td>
                  <input className="entrada" value={p.descricao} onChange={(e) => mudar(i, { descricao: e.target.value })} disabled={!podeAlterar} />
                </td>
                <td>
                  <input className="entrada" type="number" step="0.01" value={p.valorMensal} onChange={(e) => mudar(i, { valorMensal: num(e.target.value) })} disabled={!podeAlterar} />
                </td>
                <td>
                  <input
                    className="entrada"
                    type="number"
                    min={0}
                    value={p.creditosMensais.consulta}
                    onChange={(e) => mudar(i, { creditosMensais: { ...p.creditosMensais, consulta: num(e.target.value) } })}
                    disabled={!podeAlterar}
                  />
                </td>
                <td>
                  <input
                    className="entrada"
                    type="number"
                    min={0}
                    value={p.creditosMensais.dossie}
                    onChange={(e) => mudar(i, { creditosMensais: { ...p.creditosMensais, dossie: num(e.target.value) } })}
                    disabled={!podeAlterar}
                  />
                </td>
                <td>
                  <input className="entrada" type="number" min={0} value={p.limiteCarteira} onChange={(e) => mudar(i, { limiteCarteira: num(e.target.value) })} disabled={!podeAlterar} />
                </td>
                <td>
                  <input
                    className="entrada"
                    type="number"
                    min={1}
                    value={p.limiteMembros ?? 1}
                    onChange={(e) => mudar(i, { limiteMembros: num(e.target.value) })}
                    disabled={!podeAlterar}
                    aria-label="Pessoas na equipe"
                  />
                </td>
                <td>
                  <input type="checkbox" checked={!!p.destaque} onChange={(e) => mudar(i, { destaque: e.target.checked })} disabled={!podeAlterar} aria-label="Destaque" />
                </td>
                <td>
                  <input type="checkbox" checked={p.ativo} onChange={(e) => mudar(i, { ativo: e.target.checked })} disabled={!podeAlterar} aria-label="Ativo" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {podeAlterar && (
        <div className="botoes">
          <button
            type="button"
            className="botao botao-secundario"
            onClick={() =>
              setPlanos((ps) => [...ps, { id: '', nome: '', descricao: '', valorMensal: 0, creditosMensais: { consulta: 0, dossie: 0 }, limiteCarteira: 0, limiteMembros: 1, ativo: true }])
            }
          >
            Novo plano
          </button>
          <button type="button" className="botao botao-primario" onClick={salvar}>
            Salvar planos
          </button>
        </div>
      )}
      <p className="ajuda" style={{ marginTop: 0 }}>
        Mudanças valem para novos assinantes. Quem já assina continua com o valor, os créditos e a carteira da contratação.
      </p>
      {estado.ok && <span className="verificacao sim">✓ {estado.ok}</span>}
      {estado.erro && <span className="alerta alerta-erro">{estado.erro}</span>}
    </div>
  );
}

function Pacotes({ inicial, podeAlterar }: { inicial: Produto[]; podeAlterar: boolean }) {
  const [pacotes, setPacotes] = useState(inicial);
  const [estado, setEstado] = useState<{ ok?: string; erro?: string }>({});
  const originais = new Set(inicial.map((p) => p.id));

  function mudar(i: number, campo: Partial<Produto>) {
    setPacotes((ps) => ps.map((p, j) => (j === i ? { ...p, ...campo } : p)));
  }

  function adicionar() {
    setPacotes((ps) => [...ps, { id: '', nome: '', descricao: '', valor: 0, creditos: { consulta: 0, dossie: 0 }, ativo: true }]);
  }

  async function salvar() {
    setEstado({});
    try {
      const r = await api.admin.salvarConfiguracao('produtos', pacotes);
      setPacotes(r.valor);
      setEstado({ ok: 'Pacotes salvos.' });
    } catch (e) {
      setEstado({ erro: (e as Error).message });
    }
  }

  return (
    <div className="pilha-p">
      <strong>Compras avulsas</strong>
      <div className="tabela-rolavel">
        <table className="tabela tabela-edicao">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome</th>
              <th>Descrição</th>
              <th>Preço (R$)</th>
              <th>Consultas</th>
              <th>Dossiês</th>
              <th>Destaque</th>
              <th>Ativo</th>
            </tr>
          </thead>
          <tbody>
            {pacotes.map((p, i) => (
              <tr key={i}>
                <td>
                  {originais.has(p.id) ? (
                    <code>{p.id}</code>
                  ) : (
                    <input className="entrada" value={p.id} placeholder="ex.: pacote-safra" onChange={(e) => mudar(i, { id: e.target.value })} disabled={!podeAlterar} />
                  )}
                </td>
                <td>
                  <input className="entrada" value={p.nome} onChange={(e) => mudar(i, { nome: e.target.value })} disabled={!podeAlterar} />
                </td>
                <td>
                  <input className="entrada" value={p.descricao} onChange={(e) => mudar(i, { descricao: e.target.value })} disabled={!podeAlterar} />
                </td>
                <td>
                  <input className="entrada" type="number" step="0.01" value={p.valor} onChange={(e) => mudar(i, { valor: Number(e.target.value) })} disabled={!podeAlterar} />
                </td>
                <td>
                  <input
                    className="entrada"
                    type="number"
                    min={0}
                    value={p.creditos.consulta}
                    onChange={(e) => mudar(i, { creditos: { ...p.creditos, consulta: Number(e.target.value) } })}
                    disabled={!podeAlterar}
                  />
                </td>
                <td>
                  <input
                    className="entrada"
                    type="number"
                    min={0}
                    value={p.creditos.dossie}
                    onChange={(e) => mudar(i, { creditos: { ...p.creditos, dossie: Number(e.target.value) } })}
                    disabled={!podeAlterar}
                  />
                </td>
                <td>
                  <input type="checkbox" checked={!!p.destaque} onChange={(e) => mudar(i, { destaque: e.target.checked })} disabled={!podeAlterar} aria-label="Destaque" />
                </td>
                <td>
                  <input type="checkbox" checked={p.ativo} onChange={(e) => mudar(i, { ativo: e.target.checked })} disabled={!podeAlterar} aria-label="Ativo" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {podeAlterar && (
        <div className="botoes">
          <button type="button" className="botao botao-secundario" onClick={adicionar}>
            Novo pacote
          </button>
          <button type="button" className="botao botao-primario" onClick={salvar}>
            Salvar pacotes
          </button>
        </div>
      )}
      <p className="ajuda" style={{ marginTop: 0 }}>
        Para tirar um pacote de venda, desmarque "Ativo" (não apague: pedidos antigos continuam válidos).
      </p>
      {estado.ok && <span className="verificacao sim">✓ {estado.ok}</span>}
      {estado.erro && <span className="alerta alerta-erro">{estado.erro}</span>}
    </div>
  );
}
