import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, type Pedido } from '../api';
import { EntradaSenha } from '../componentes/EntradaSenha';
import { Icone } from '../componentes/Icones';
import { NOME_PAPEL } from './Equipe';
import { useSessao } from '../sessao';
import { dataBr } from '../textos';

const STATUS: Record<Pedido['status'], string> = {
  pendente: 'Aguardando pagamento',
  pago: 'Pago',
  estornado: 'Estornado',
  cancelado: 'Cancelado',
};

/** Confirmação da exclusão: explica o que some e o que a lei manda guardar, e pede a senha de novo. */
function ExcluirConta({ aoCancelar }: { aoCancelar: () => void }) {
  const [senha, setSenha] = useState('');
  const [entendo, setEntendo] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function excluir(ev: FormEvent) {
    ev.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      await api.excluirConta(senha);
      // Recarrega o site do zero: a sessão já não existe no servidor e nada da conta fica na memória da página.
      window.location.replace('/?conta=excluida');
    } catch (e) {
      setErro((e as Error).message);
      setEnviando(false);
    }
  }

  return (
    <form className="exclusao pilha-p" onSubmit={excluir}>
      <strong>Excluir a conta é definitivo.</strong>
      <ul className="lista-simples">
        <li>
          <b>Apagamos</b> seu nome, e-mail, WhatsApp, profissão, senha, a carteira de imóveis e os avisos. Os créditos que sobraram são
          perdidos.
        </li>
        <li>
          <b>Cancelamos</b> a assinatura, se houver: não haverá novas cobranças.
        </li>
        <li>
          <b>Equipe:</b> você sai da equipe em que estiver. Se for o responsável, a equipe é desfeita e cada pessoa volta à própria conta.
        </li>
        <li>
          <b>Guardamos</b>, sem seus dados de contato, só os registros das compras (valor, data e situação), porque a lei manda guardar
          (Código Tributário Nacional, art. 195). Os relatórios já emitidos continuam abrindo pelo QR, sem indicar quem os gerou.
        </li>
      </ul>
      <p className="fonte-suave">Antes de excluir, se quiser, baixe seus dados.</p>
      <EntradaSenha rotulo="Sua senha" value={senha} onChange={setSenha} autoComplete="current-password" />
      <label className="marcar">
        <input type="checkbox" checked={entendo} onChange={(e) => setEntendo(e.target.checked)} />
        <span>Entendo que a exclusão não pode ser desfeita.</span>
      </label>
      {erro && (
        <p className="alerta alerta-erro" role="alert">
          {erro}
        </p>
      )}
      <div className="botoes">
        <button type="submit" className="botao botao-perigo-cheio" disabled={!entendo || !senha || enviando}>
          {enviando ? 'Excluindo…' : 'Excluir minha conta'}
        </button>
        <button type="button" className="botao botao-secundario" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function Conta() {
  const { sessao, carregando, sair } = useSessao();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [excluindo, setExcluindo] = useState(false);
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

      {sessao.equipe && (
        <p className="faixa-equipe">
          <Icone nome="camadas" className="l-icone-p" />
          <span>
            {sessao.equipe.papel === 'responsavel' ? (
              'Você é o responsável pela equipe: o saldo abaixo é usado por todos.'
            ) : (
              <>
                Você está na equipe de <strong>{sessao.equipe.donoNome}</strong> como {NOME_PAPEL[sessao.equipe.papel].toLowerCase()}: o saldo
                abaixo é o da equipe.
              </>
            )}{' '}
            <Link to="/equipe">Ver equipe</Link>
          </span>
        </p>
      )}

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
          {sessao.equipe ? 'Carteira da equipe' : 'Minha carteira'}
        </Link>
        <Link to="/equipe" className="botao botao-secundario">
          Equipe
        </Link>
        <Link to="/planos" className="botao botao-secundario">
          Planos e créditos
        </Link>
        {sessao.nivelAdmin && (
          <Link to="/admin" className="botao botao-secundario">
            Painel administrativo
          </Link>
        )}
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

      <section className="cartao pilha-p">
        <h2 className="secao-titulo">Seus dados</h2>
        <p className="fonte-suave">
          Pela Lei Geral de Proteção de Dados (LGPD, art. 18), você pode baixar uma cópia de tudo o que guardamos sobre você ou excluir a
          sua conta quando quiser.
        </p>
        <div className="botoes">
          {/* Só o titular baixa: no modo "entrar como" a API recusa. */}
          <a href={api.enderecoMeusDados} download className="botao botao-secundario">
            <Icone nome="documento" className="l-icone-p" /> Baixar meus dados
          </a>
          {!excluindo && (
            <button type="button" className="botao botao-perigo" onClick={() => setExcluindo(true)}>
              Excluir minha conta
            </button>
          )}
        </div>
        {excluindo && <ExcluirConta aoCancelar={() => setExcluindo(false)} />}
      </section>

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
