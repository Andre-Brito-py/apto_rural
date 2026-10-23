import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Assinatura, type Catalogo, type Plano, type Produto } from '../api';
import { useSessao } from '../sessao';
import { contagem, dataBr } from '../textos';

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const SITUACAO: Record<Assinatura['status'], string> = {
  pendente: 'Aguardando o primeiro pagamento',
  ativa: 'Ativa',
  inadimplente: 'Mensalidade em atraso',
  cancelada: 'Cancelada',
};

/** Escolha do que comprar: assinatura mensal (principal) ou compra avulsa. */
export function Planos() {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [documento, setDocumento] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const { sessao } = useSessao();
  const navegar = useNavigate();

  useEffect(() => {
    api.planos().then((r) => setPlanos(r.planos)).catch(() => undefined);
    api.produtos().then(setCatalogo).catch((e: Error) => setErro(e.message));
  }, []);

  useEffect(() => {
    if (sessao) api.assinatura().then((r) => setAssinatura(r.assinatura)).catch(() => undefined);
  }, [sessao]);

  const exigeDocumento = catalogo?.exigeDocumento ?? false;

  /** Primeiro toque escolhe (e pede CPF/CNPJ, se preciso); o segundo vai ao pagamento. */
  async function seguir(chave: string, acao: () => Promise<{ link: string }>) {
    if (!sessao) {
      navegar('/entrar?modo=criar&voltar=/planos');
      return;
    }
    if (exigeDocumento && escolhido !== chave) {
      setEscolhido(chave);
      return;
    }
    setErro('');
    setEnviando(true);
    try {
      window.location.assign((await acao()).link);
    } catch (e) {
      setErro((e as Error).message);
      setEnviando(false);
    }
  }

  async function cancelar() {
    if (!window.confirm('Cancelar a assinatura? As próximas mensalidades não serão cobradas e os créditos que você já tem continuam seus.')) return;
    try {
      await api.cancelarAssinatura();
      setAssinatura(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const campoDocumento = (chave: string) =>
    escolhido === chave && exigeDocumento ? (
      <label className="campo" style={{ marginTop: 12 }}>
        <span className="rotulo">CPF ou CNPJ para a cobrança</span>
        <input className="entrada" inputMode="numeric" value={documento} onChange={(e) => setDocumento(e.target.value)} />
        <span className="ajuda">Vai direto para o meio de pagamento; não guardamos este número.</span>
      </label>
    ) : null;

  return (
    <div className="pagina pilha">
      <div className="pilha-p">
        <h1 className="titulo-pagina">Planos</h1>
        <p className="subtitulo">Assine e receba créditos todo mês, com a carteira de fazendas inclusa. Pix, cartão ou boleto.</p>
      </div>

      {catalogo?.simulado && (
        <p className="alerta" style={{ background: '#fef3c7', borderColor: '#f2d27a' }}>
          Pagamento <strong>simulado</strong> (desenvolvimento): nenhuma cobrança real é feita.
        </p>
      )}
      {erro && (
        <p className="alerta alerta-erro" role="alert">
          {erro}
        </p>
      )}

      {sessao && (
        <div className="cartao pilha-p">
          <p>
            Seu saldo: <strong>{contagem(sessao.saldo.consulta, 'consulta', 'consultas')}</strong> e{' '}
            <strong>{contagem(sessao.saldo.dossie, 'dossiê', 'dossiês')}</strong>.
          </p>
          {assinatura && (
            <div className="assinatura-atual pilha-p">
              <p>
                Plano <strong>{assinatura.nomePlano}</strong> — {reais(assinatura.valorMensal)}/mês ·{' '}
                <span className={assinatura.status === 'ativa' ? 'verificacao sim' : 'verificacao nao'}>{SITUACAO[assinatura.status]}</span>
                {assinatura.ativadaEm && <span className="fonte-suave"> · desde {dataBr(assinatura.ativadaEm)}</span>}
              </p>
              <div className="acoes-imovel">
                {assinatura.status !== 'ativa' && assinatura.link && (
                  <a href={assinatura.link} className="botao botao-primario">
                    Pagar mensalidade
                  </a>
                )}
                <button type="button" className="link-botao" onClick={cancelar}>
                  Cancelar assinatura
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <section className="pilha-p">
        <h2 className="secao-titulo">Assinatura mensal</h2>
        <ul className="planos">
          {planos.map((p) => (
            <li key={p.id} className={`cartao plano${p.destaque ? ' plano-destaque' : ''}`}>
              {p.destaque && <span className="plano-selo">Mais escolhido</span>}
              <h3 className="secao-titulo">{p.nome}</h3>
              <p className="plano-preco">
                {reais(p.valorMensal)}
                <span className="plano-periodo">/mês</span>
              </p>
              <ul className="lista-simples">
                <li>{contagem(p.creditosMensais.consulta, 'consulta', 'consultas')} por mês</li>
                <li>{contagem(p.creditosMensais.dossie, 'dossiê', 'dossiês')} por mês</li>
                <li>Carteira com até {p.limiteCarteira} fazendas, reconferidas todo dia</li>
                <li>Créditos que sobram passam para o mês seguinte</li>
              </ul>
              {campoDocumento(`plano:${p.id}`)}
              <button
                type="button"
                className={`botao ${p.destaque ? 'botao-primario' : 'botao-secundario'}`}
                style={{ marginTop: 12, width: '100%' }}
                disabled={enviando || !catalogo?.pagamentoDisponivel || (assinatura != null && assinatura.planoId !== p.id)}
                onClick={() => seguir(`plano:${p.id}`, () => api.assinar(p.id, documento || undefined))}
              >
                {assinatura?.planoId === p.id
                  ? 'Seu plano'
                  : assinatura
                    ? 'Cancele o atual para trocar'
                    : escolhido === `plano:${p.id}` || !exigeDocumento
                      ? 'Ir para o pagamento'
                      : 'Assinar'}
              </button>
            </li>
          ))}
        </ul>
        <p className="ajuda">Cancele quando quiser: as próximas mensalidades deixam de ser cobradas e os créditos que você já tem continuam seus.</p>
      </section>

      <section className="pilha-p">
        <h2 className="secao-titulo">Compra avulsa</h2>
        <ul className="planos">
          {catalogo?.produtos.map((p: Produto) => (
            <li key={p.id} className="cartao plano">
              <h3 className="secao-titulo">{p.nome}</h3>
              <p className="plano-preco">{reais(p.valor)}</p>
              <p>{p.descricao}</p>
              {campoDocumento(`produto:${p.id}`)}
              <button
                type="button"
                className="botao botao-secundario"
                style={{ marginTop: 12, width: '100%' }}
                disabled={enviando || !catalogo.pagamentoDisponivel}
                onClick={() => seguir(`produto:${p.id}`, () => api.comprar(p.id, documento || undefined))}
              >
                {escolhido === `produto:${p.id}` || !exigeDocumento ? 'Ir para o pagamento' : 'Comprar'}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p className="avisos">
        Preços em reais. Dúvidas sobre cobrança: veja os <Link to="/termos">termos de uso</Link>.
      </p>
    </div>
  );
}
