import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ErroApi } from '../api';
import { Icone } from '../componentes/Icones';
import { useSessao } from '../sessao';

const VANTAGENS = [
  'Os itens do MCR 2-9 conferidos nas bases oficiais',
  'Semáforo e relatório em PDF em segundos',
  'Dossiê com o caminho de saída quando dá vermelho',
  'Carteira de fazendas reconferida todo dia',
];

const PROFISSOES = [
  'Técnico agrícola',
  'Engenheiro agrônomo',
  'Projetista de crédito rural',
  'Escritório de assistência técnica',
  'Corretor de imóveis rurais',
  'Outra',
];

export function Entrar() {
  const [busca] = useSearchParams();
  const [modo, setModo] = useState<'entrar' | 'criar'>(busca.get('modo') === 'criar' ? 'criar' : 'entrar');
  const [nome, setNome] = useState('');
  // Vindo de um convite de equipe, o e-mail já vem preenchido.
  const [email, setEmail] = useState(busca.get('email') ?? '');
  const [whatsapp, setWhatsapp] = useState('');
  const [profissao, setProfissao] = useState('');
  const [senha, setSenha] = useState('');
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState<{ mensagem: string; campo?: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const { definir } = useSessao();
  const navegar = useNavigate();
  // Só caminhos deste site: "//outro.com" ou "/\outro.com" levariam para fora (golpe de phishing).
  const pedido = busca.get('voltar') ?? '/';
  const destino = /^\/(?![/\\])/.test(pedido) ? pedido : '/';

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const sessao =
        modo === 'entrar'
          ? await api.entrar(email, senha)
          : await api.criarConta({
              nome,
              email,
              whatsapp: whatsapp || undefined,
              profissao: profissao || undefined,
              senha,
              aceiteTermos: aceite,
            });
      definir(sessao);
      navegar(destino, { replace: true });
    } catch (e) {
      const err = e as ErroApi;
      setErro({ mensagem: err.message, campo: err.campo });
      setEnviando(false);
    }
  }

  const criar = modo === 'criar';

  return (
    <div className="pagina pagina-media">
      <div className="acesso">
        <aside className="acesso-lado" aria-label="Por que o Apto Rural">
          <p className="sobretitulo">Apto Rural</p>
          <h2>Confira a fazenda antes do banco</h2>
          <ul>
            {VANTAGENS.map((v) => (
              <li key={v}>
                <span className="l-check">
                  <Icone nome="check" />
                </span>
                {v}
              </li>
            ))}
          </ul>
          <p className="acesso-nota">Pré-checagem com bases públicas. A decisão de crédito continua sendo do banco.</p>
        </aside>

        <div className="pilha">
          <div className="topo-pagina">
            <h1 className="titulo-pagina">{criar ? 'Crie sua conta' : 'Entre na sua conta'}</h1>
            <p className="subtitulo">
              {criar ? 'Confirme o e-mail e ganhe a primeira consulta de um imóvel real.' : 'Use o e-mail e a senha da sua conta.'}
            </p>
          </div>

          <div className="abas" role="tablist">
            <button type="button" role="tab" aria-selected={!criar} className={!criar ? 'ativa' : ''} onClick={() => setModo('entrar')}>
              Entrar
            </button>
            <button type="button" role="tab" aria-selected={criar} className={criar ? 'ativa' : ''} onClick={() => setModo('criar')}>
              Criar conta
            </button>
          </div>

          <form className="cartao" onSubmit={enviar} noValidate>
            {criar && (
              <label className="campo">
                <span className="rotulo">Nome</span>
                <input className="entrada" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" required />
              </label>
            )}
            <label className="campo">
              <span className="rotulo">E-mail</span>
              <input
                className="entrada"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
                required
              />
            </label>
            {criar && (
              <>
                <label className="campo">
                  <span className="rotulo">WhatsApp (opcional)</span>
                  <input
                    className="entrada"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="(65) 99999-0000"
                  />
                  <span className="ajuda">Para avisos da carteira de imóveis, quando estiverem disponíveis.</span>
                </label>
                <label className="campo">
                  <span className="rotulo">Você trabalha como</span>
                  <select className="entrada" value={profissao} onChange={(e) => setProfissao(e.target.value)}>
                    <option value="">Escolha…</option>
                    {PROFISSOES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label className="campo">
              <span className="rotulo">Senha</span>
              <input
                className="entrada"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete={criar ? 'new-password' : 'current-password'}
                required
              />
              {criar ? (
                <span className="ajuda">Pelo menos 10 caracteres.</span>
              ) : (
                <Link to="/esqueci-senha" className="ajuda">
                  Esqueci minha senha
                </Link>
              )}
            </label>
            {criar && (
              <label className="marcar campo">
                <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
                <span>
                  Li e aceito os <Link to="/termos">termos de uso</Link> e a <Link to="/privacidade">política de privacidade</Link>.
                </span>
              </label>
            )}

            {erro && (
              <p className="alerta alerta-erro" role="alert" style={{ marginTop: 20 }}>
                {erro.mensagem}
              </p>
            )}

            <div style={{ marginTop: 24 }}>
              <button className="botao botao-primario" type="submit" disabled={enviando}>
                {enviando ? 'Aguarde…' : criar ? 'Criar conta' : 'Entrar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
