import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, type Pedido } from '../api';
import { useSessao } from '../sessao';
import { dataBr } from '../textos';

const STATUS: Record<Pedido['status'], string> = {
  pendente: 'Aguardando pagamento',
  pago: 'Pago',
  estornado: 'Estornado',
  cancelado: 'Cancelado',
};

export function Conta() {
  const { sessao, carregando, sair } = useSessao();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const navegar = useNavigate();

  useEffect(() => {
    if (sessao) api.pedidos().then((r) => setPedidos(r.pedidos)).catch(() => undefined);
  }, [sessao]);

  if (carregando) return <div className="pagina">Carregando…</div>;
  if (!sessao) return <Navigate to="/entrar?voltar=/conta" replace />;

  return (
    <div className="pagina pilha">
      <div className="topo-pagina">
        <p className="sobretitulo">Minha conta</p>
        <h1 className="titulo-pagina">Olá, {sessao.usuario.nome.split(' ')[0]}</h1>
      </div>

      <div className="saldos">
        <div className="saldo-bloco">
          <span className="saldo-numero">{sessao.saldo.consulta}</span>
          <span className="fonte-suave">{sessao.saldo.consulta === 1 ? 'consulta disponível' : 'consultas disponíveis'}</span>
        </div>
        <div className="saldo-bloco">
          <span className="saldo-numero">{sessao.saldo.dossie}</span>
          <span className="fonte-suave">{sessao.saldo.dossie === 1 ? 'dossiê disponível' : 'dossiês disponíveis'}</span>
        </div>
      </div>

      <div className="botoes">
        <Link to="/consultar" className="botao botao-primario">
          Consultar um imóvel
        </Link>
        <Link to="/carteira" className="botao botao-secundario">
          Minha carteira
        </Link>
        <Link to="/planos" className="botao botao-secundario">
          Planos e créditos
        </Link>
      </div>

      <section className="cartao pilha-p">
        <h2 className="secao-titulo">Dados da conta</h2>
        <dl className="dados">
          <dt>Nome</dt>
          <dd>{sessao.usuario.nome}</dd>
          <dt>E-mail</dt>
          <dd>
            {sessao.usuario.email}{' '}
            <span className={`etiqueta${sessao.usuario.emailConfirmado ? '' : ' etiqueta-vermelha'}`}>
              {sessao.usuario.emailConfirmado ? 'confirmado' : 'não confirmado'}
            </span>
          </dd>
        </dl>
        {sessao.nivelAdmin && (
          <Link to="/admin" className="l-link">
            Abrir o painel administrativo
          </Link>
        )}
      </section>

      {pedidos.length > 0 && (
        <section className="cartao pilha-p">
          <h2 className="secao-titulo">Compras</h2>
          <div className="tabela-rolavel">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Item</th>
                  <th>Valor</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id}>
                    <td>{dataBr(p.criadoEm)}</td>
                    <td>{p.produto}</td>
                    <td>{p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>{STATUS[p.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <button
        type="button"
        className="link-botao"
        onClick={async () => {
          await sair();
          navegar('/');
        }}
      >
        Sair da conta
      </button>
    </div>
  );
}
