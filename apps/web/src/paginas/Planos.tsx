import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Catalogo, type Produto } from '../api';
import { useSessao } from '../sessao';
import { contagem } from '../textos';

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function Planos() {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [escolhido, setEscolhido] = useState<Produto | null>(null);
  const [documento, setDocumento] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const { sessao } = useSessao();
  const navegar = useNavigate();

  useEffect(() => {
    api.produtos().then(setCatalogo).catch((e: Error) => setErro(e.message));
  }, []);

  async function comprar(p: Produto) {
    if (!sessao) {
      navegar(`/entrar?modo=criar&voltar=/planos`);
      return;
    }
    if (catalogo?.exigeDocumento && escolhido?.id !== p.id) {
      setEscolhido(p);
      return;
    }
    setErro('');
    setEnviando(true);
    try {
      const { link } = await api.comprar(p.id, documento || undefined);
      // Fatura hospedada pelo provedor (ou a página simulada, em desenvolvimento).
      window.location.assign(link);
    } catch (e) {
      setErro((e as Error).message);
      setEnviando(false);
    }
  }

  return (
    <div className="pagina pilha">
      <div className="pilha-p">
        <h1 className="titulo-pagina">Créditos de consulta</h1>
        <p className="subtitulo">Pague com Pix, cartão ou boleto. Os créditos não vencem.</p>
      </div>

      {sessao && (
        <p className="cartao">
          Seu saldo: <strong>{contagem(sessao.saldo.consulta, 'consulta', 'consultas')}</strong> e{' '}
          <strong>{contagem(sessao.saldo.dossie, 'dossiê', 'dossiês')}</strong>.
        </p>
      )}

      {catalogo?.simulado && (
        <p className="alerta" style={{ background: '#fef3c7', borderColor: '#f2d27a' }}>
          Pagamento <strong>simulado</strong> (desenvolvimento): nenhuma cobrança real é feita.
        </p>
      )}
      {catalogo && !catalogo.pagamentoDisponivel && (
        <p className="alerta alerta-erro">Pagamentos ainda não estão disponíveis neste servidor.</p>
      )}
      {erro && (
        <p className="alerta alerta-erro" role="alert">
          {erro}
        </p>
      )}

      <ul className="planos">
        {catalogo?.produtos.map((p) => (
          <li key={p.id} className={`cartao plano${p.destaque ? ' plano-destaque' : ''}`}>
            {p.destaque && <span className="plano-selo">Mais escolhido</span>}
            <h2 className="secao-titulo">{p.nome}</h2>
            <p className="plano-preco">{reais(p.valor)}</p>
            <p>{p.descricao}</p>
            {p.creditos.consulta > 1 && <p className="fonte-suave">{reais(p.valor / p.creditos.consulta)} por consulta, com dossiês inclusos.</p>}

            {escolhido?.id === p.id && catalogo.exigeDocumento && (
              <label className="campo" style={{ marginTop: 12 }}>
                <span className="rotulo">CPF ou CNPJ para a cobrança</span>
                <input className="entrada" inputMode="numeric" value={documento} onChange={(e) => setDocumento(e.target.value)} />
                <span className="ajuda">Vai direto para o meio de pagamento; não guardamos este número.</span>
              </label>
            )}

            <button
              type="button"
              className={`botao ${p.destaque ? 'botao-primario' : 'botao-secundario'}`}
              style={{ marginTop: 12, width: '100%' }}
              disabled={enviando || !catalogo.pagamentoDisponivel}
              onClick={() => comprar(p)}
            >
              {escolhido?.id === p.id || !catalogo.exigeDocumento ? 'Ir para o pagamento' : 'Comprar'}
            </button>
          </li>
        ))}
      </ul>

      <p className="avisos">
        Preços em reais. Dúvidas sobre cobrança: veja os <Link to="/termos">termos de uso</Link>.
      </p>
    </div>
  );
}
