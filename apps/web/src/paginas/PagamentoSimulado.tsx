import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Pedido, type Produto } from '../api';
import { useSessao } from '../sessao';

/** Só existe no desenvolvimento: faz o papel da fatura do provedor. */
export function PagamentoSimulado() {
  const { id = '' } = useParams();
  const [dados, setDados] = useState<{ pedido: Pedido; produto?: Produto } | null>(null);
  const [erro, setErro] = useState('');
  const [pago, setPago] = useState(false);
  const { atualizarSaldo } = useSessao();

  useEffect(() => {
    api.pedido(id).then(setDados).catch((e: Error) => setErro(e.message));
  }, [id]);

  async function pagar() {
    try {
      const r = await api.pagarSimulado(id);
      await atualizarSaldo(r.saldo);
      setPago(true);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <div className="pagina pilha" style={{ maxWidth: 520 }}>
      <p className="alerta" style={{ background: '#fef3c7', borderColor: '#f2d27a' }}>
        <strong>Fatura simulada.</strong> Em produção, esta tela é a fatura do Asaas com Pix, cartão e boleto.
      </p>
      {erro && <p className="alerta alerta-erro">{erro}</p>}
      {dados && (
        <div className="cartao pilha-p">
          <h1 className="titulo-pagina">{dados.produto?.nome}</h1>
          <p>Valor: {dados.pedido.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          {pago || dados.pedido.status === 'pago' ? (
            <>
              <p className="verificacao sim">✓ Pagamento confirmado. Os créditos já estão na sua conta.</p>
              <Link to="/" className="botao botao-primario">
                Consultar um imóvel
              </Link>
            </>
          ) : (
            <button type="button" className="botao botao-primario" onClick={pagar}>
              Simular pagamento confirmado
            </button>
          )}
        </div>
      )}
    </div>
  );
}
