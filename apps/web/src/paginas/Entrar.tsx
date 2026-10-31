import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ErroApi, type Saude } from '../api';
import { BotaoGoogle } from '../componentes/BotaoGoogle';
import { EntradaSenha } from '../componentes/EntradaSenha';
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

/** O que falta para concluir o login pelo Google (a API diz pelo "campo" da resposta). */
type PassoGoogle = 'aceiteTermos' | 'senha' | 'codigo';

export function Entrar({ saude }: { saude: Saude | null }) {
  const [busca] = useSearchParams();
  const [modo, setModo] = useState<'entrar' | 'criar'>(busca.get('modo') === 'criar' ? 'criar' : 'entrar');
  const [nome, setNome] = useState('');
  // Vindo de um convite de equipe, o e-mail já vem preenchido.
  const [email, setEmail] = useState(busca.get('email') ?? '');
  const [whatsapp, setWhatsapp] = useState('');
  const [profissao, setProfissao] = useState('');
  const [senha, setSenha] = useState('');
  const [aceite, setAceite] = useState(false);
  // Segunda etapa: aparece quando a conta tem a verificação em duas etapas ligada.
  const [pedirCodigo, setPedirCodigo] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<{ mensagem: string; campo?: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const { definir } = useSessao();
  const navegar = useNavigate();
  // Só caminhos deste site: "//outro.com" ou "/\outro.com" levariam para fora (golpe de phishing).
  const pedido = busca.get('voltar') ?? '/';
  const destino = /^\/(?![/\\])/.test(pedido) ? pedido : '/';

  // Login pelo Google: o token do Google e o passo que falta (aceite, senha da conta ou código).
  const [google, setGoogle] = useState<{ credencial: string; passo: PassoGoogle; mensagem: string } | null>(null);
  const [googleSenha, setGoogleSenha] = useState('');
  const [googleCodigo, setGoogleCodigo] = useState('');
  const [googleAceite, setGoogleAceite] = useState(false);

  async function entrarGoogle(credencial: string, extra: { senha?: string; codigo?: string; aceiteTermos?: boolean } = {}) {
    setErro(null);
    setEnviando(true);
    try {
      definir(await api.entrarGoogle({ credencial, ...extra }));
      navegar(destino, { replace: true });
    } catch (e) {
      const err = e as ErroApi;
      const passo = err.campo as PassoGoogle | undefined;
      // Primeira vez que o passo aparece: é um pedido, não um erro. Depois, é erro (senha ou código errado).
      if (passo && ['aceiteTermos', 'senha', 'codigo'].includes(passo) && google?.passo !== passo) {
        setGoogle({ credencial, passo, mensagem: err.message });
      } else {
        setErro({ mensagem: err.message, campo: err.campo });
      }
      setEnviando(false);
    }
  }

  function continuarGoogle(ev: FormEvent) {
    ev.preventDefault();
    if (!google) return;
    void entrarGoogle(google.credencial, {
      senha: google.passo === 'senha' ? googleSenha : undefined,
      codigo: google.passo === 'codigo' ? googleCodigo : undefined,
      aceiteTermos: google.passo === 'aceiteTermos' ? googleAceite : undefined,
    });
  }

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const sessao =
        modo === 'entrar'
          ? await api.entrar(email, senha, pedirCodigo ? codigo : undefined)
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
      // Senha certa, falta o código: mostra o campo sem tratar como erro.
      if (err.campo === 'codigo' && !pedirCodigo) {
        setPedirCodigo(true);
        setErro(null);
      } else setErro({ mensagem: err.message, campo: err.campo });
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

          {busca.get('senha') === 'nova' && (
            <p className="alerta alerta-ok" role="status">
              Senha nova criada. Entre com ela e com o código do aplicativo autenticador.
            </p>
          )}

          <div className="abas" role="tablist">
            <button type="button" role="tab" aria-selected={!criar} className={!criar ? 'ativa' : ''} onClick={() => setModo('entrar')}>
              Entrar
            </button>
            <button type="button" role="tab" aria-selected={criar} className={criar ? 'ativa' : ''} onClick={() => setModo('criar')}>
              Criar conta
            </button>
          </div>

          {google && (
            <form className="cartao pilha-p" onSubmit={continuarGoogle} noValidate aria-labelledby="titulo-google">
              <h2 id="titulo-google" className="form-secao" style={{ marginTop: 0 }}>
                Continuar com o Google
              </h2>
              <p role="status">{google.mensagem}</p>
              {google.passo === 'aceiteTermos' && (
                <label className="marcar campo">
                  <input type="checkbox" checked={googleAceite} onChange={(e) => setGoogleAceite(e.target.checked)} />
                  <span>
                    Li e aceito os <Link to="/termos">termos de uso</Link> e a <Link to="/privacidade">política de privacidade</Link>.
                  </span>
                </label>
              )}
              {google.passo === 'senha' && (
                <EntradaSenha rotulo="Senha da conta do Apto Rural" value={googleSenha} onChange={setGoogleSenha} autoComplete="current-password" />
              )}
              {google.passo === 'codigo' && (
                <label className="campo">
                  <span className="rotulo">Código de verificação</span>
                  <input
                    className="entrada entrada-codigo"
                    value={googleCodigo}
                    onChange={(e) => setGoogleCodigo(e.target.value)}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={9}
                    placeholder="000000"
                    autoFocus
                  />
                  <span className="ajuda">Os 6 dígitos do aplicativo autenticador, ou um código de recuperação.</span>
                </label>
              )}
              {erro && (
                <p className="alerta alerta-erro" role="alert">
                  {erro.mensagem}
                </p>
              )}
              <div className="botoes" style={{ marginTop: 16 }}>
                <button className="botao botao-primario" type="submit" disabled={enviando}>
                  {enviando ? 'Aguarde…' : google.passo === 'aceiteTermos' ? 'Criar minha conta' : 'Continuar'}
                </button>
                <button
                  type="button"
                  className="botao botao-secundario"
                  onClick={() => {
                    setGoogle(null);
                    setErro(null);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {!google && saude?.google && (
            <div className="acesso-google">
              <BotaoGoogle clienteId={saude.google} criar={criar} aoEntrar={(credencial) => void entrarGoogle(credencial)} />
              <p className="acesso-ou">
                <span>ou com e-mail e senha</span>
              </p>
            </div>
          )}
          <form className="cartao" onSubmit={enviar} noValidate hidden={google != null}>
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
            <EntradaSenha rotulo="Senha" value={senha} onChange={setSenha} autoComplete={criar ? 'new-password' : 'current-password'} />
            {!criar && pedirCodigo && (
              <label className="campo">
                <span className="rotulo">Código de verificação</span>
                <input
                  className="entrada entrada-codigo"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={9}
                  placeholder="000000"
                  autoFocus
                  aria-invalid={erro?.campo === 'codigo' ? true : undefined}
                />
                <span className="ajuda">
                  Abra o aplicativo autenticador e digite os 6 dígitos do Apto Rural. Sem o celular? Use um dos códigos de recuperação.
                </span>
              </label>
            )}
            {criar ? (
              <span className="ajuda">Pelo menos 10 caracteres.</span>
            ) : (
              <Link to="/esqueci-senha" className="ajuda">
                Esqueci minha senha
              </Link>
            )}
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
