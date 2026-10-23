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
      <h1 className="titulo-pagina">Minha conta</h1>
      <section className="cartao pilha-p">
        <dl className="dados">
          <dt>Nome</dt>
          <dd>{sessao.usuario.nome}</dd>
          <dt>E-mail</dt>
          <dd>
            {sessao.usuario.email} {sessao.usuario.emailConfirmado ? '(confirmado)' : '(não confirmado)'}
          </dd>
          <dt>Consultas</dt>
          <dd>{sessao.saldo.consulta}</dd>
          <dt>Dossiês</dt>
          <dd>{sessao.saldo.dossie}</dd>
        </dl>
        <div className="botoes">
          <Link to="/carteira" className="botao botao-primario">
            Minha carteira de imóveis
          </Link>
          <Link to="/planos" className="botao botao-secundario">
            Comprar créditos
          </Link>
          {sessao.admin && (
            <Link to="/admin" className="botao botao-secundario">
              Painel administrativo
            </Link>
          )}
        </div>
      </section>

      {pedidos.length > 0 && (
        <section className="cartao pilha-p">
          <h2 className="secao-titulo">Compras</h2>
          <ul className="lista-simples">
            {pedidos.map((p) => (
              <li key={p.id}>
                {dataBr(p.criadoEm)} — {p.produto} — {p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} — {STATUS[p.status]}
              </li>
            ))}
          </ul>
        </section>
      )}

      <button
        type="button"
        className="botao botao-secundario"
        onClick={async () => {
          await sair();
          navegar('/');
        }}
      >
        Sair
      </button>
    </div>
  );
}
