import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ErroApi } from '../api';
import { EntradaSenha } from '../componentes/EntradaSenha';
import { useSessao } from '../sessao';

/** Abre pelo link do e-mail de confirmação. */
export function ConfirmarEmail() {
  const [busca] = useSearchParams();
  const token = busca.get('token') ?? '';
  const [estado, setEstado] = useState<'confirmando' | 'ok' | 'erro'>('confirmando');
  const [mensagem, setMensagem] = useState('');
  const { sessao, definir } = useSessao();
  const enviado = useRef(false);

  useEffect(() => {
    // Uma chamada só, mesmo com o StrictMode montando duas vezes: o token vale uma vez.
    if (enviado.current) return;
    enviado.current = true;
    api
      .confirmarEmail(token)
      .then(async () => {
        setEstado('ok');
        definir(await api.eu().catch(() => null));
      })
      .catch((e: Error) => {
        setEstado('erro');
        setMensagem(e.message);
      });
  }, [token, definir]);

  return (
    <div className="pagina pilha" style={{ maxWidth: 520 }}>
      <h1 className="titulo-pagina">Confirmação de e-mail</h1>
      <div className="cartao pilha-p">
        {estado === 'confirmando' && <p>Confirmando…</p>}
        {estado === 'ok' && (
          <>
            <p className="verificacao sim">✓ E-mail confirmado. Sua consulta grátis já está na conta.</p>
            <Link to={sessao ? '/' : '/entrar'} className="botao botao-primario">
              {sessao ? 'Consultar um imóvel' : 'Entrar'}
            </Link>
          </>
        )}
        {estado === 'erro' && (
          <>
            <p className="alerta alerta-erro">{mensagem}</p>
            <Link to="/conta">Ir para minha conta</Link>
          </>
        )}
      </div>
    </div>
  );
}

export function EsqueciSenha() {
  const [email, setEmail] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      setMensagem((await api.esqueciSenha(email)).mensagem);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="pagina pilha" style={{ maxWidth: 520 }}>
      <div className="pilha-p">
        <h1 className="titulo-pagina">Esqueci minha senha</h1>
        <p className="subtitulo">Mandamos um link para você criar uma senha nova.</p>
      </div>
      {mensagem ? (
        <div className="cartao pilha-p">
          <p className="verificacao sim">✓ {mensagem}</p>
          <p className="ajuda">O link vale por 1 hora. Confira também a caixa de spam.</p>
          <Link to="/entrar">Voltar para entrar</Link>
        </div>
      ) : (
        <form className="cartao" onSubmit={enviar} noValidate>
          <label className="campo">
            <span className="rotulo">E-mail da conta</span>
            <input className="entrada" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {erro && (
            <p className="alerta alerta-erro" role="alert" style={{ marginTop: 16 }}>
              {erro}
            </p>
          )}
          <div style={{ marginTop: 24 }}>
            <button className="botao botao-primario" type="submit" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar link'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function RedefinirSenha() {
  const [busca] = useSearchParams();
  const token = busca.get('token') ?? '';
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<{ mensagem: string; campo?: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const { definir } = useSessao();
  const navegar = useNavigate();

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await api.redefinirSenha(token, senha);
      // Com a verificação em duas etapas, a pessoa entra com a senha nova e o código do aplicativo.
      if ('entrar' in r) {
        navegar('/entrar?senha=nova', { replace: true });
        return;
      }
      definir(r);
      navegar('/', { replace: true });
    } catch (e) {
      setErro({ mensagem: (e as ErroApi).message, campo: (e as ErroApi).campo });
      setEnviando(false);
    }
  }

  return (
    <div className="pagina pilha" style={{ maxWidth: 520 }}>
      <div className="pilha-p">
        <h1 className="titulo-pagina">Criar nova senha</h1>
        <p className="subtitulo">Ao salvar, você sai da conta em outros aparelhos.</p>
      </div>
      <form className="cartao" onSubmit={enviar} noValidate>
        <EntradaSenha rotulo="Nova senha" value={senha} onChange={setSenha} autoComplete="new-password" />
        <span className="ajuda">Pelo menos 10 caracteres.</span>
        {erro && (
          <p className="alerta alerta-erro" role="alert" style={{ marginTop: 16 }}>
            {erro.mensagem} {erro.campo !== 'senha' && <Link to="/esqueci-senha">Pedir um novo link</Link>}
          </p>
        )}
        <div style={{ marginTop: 24 }}>
          <button className="botao botao-primario" type="submit" disabled={enviando}>
            {enviando ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Faixa para quem ainda não confirmou o e-mail. */
export function AvisoConfirmarEmail() {
  const { sessao } = useSessao();
  const [estado, setEstado] = useState<'parado' | 'enviando' | 'enviado' | 'erro'>('parado');
  if (!sessao || sessao.usuario.emailConfirmado) return null;

  async function reenviar() {
    setEstado('enviando');
    try {
      await api.reenviarConfirmacao();
      setEstado('enviado');
    } catch {
      setEstado('erro');
    }
  }

  return (
    <div className="faixa-confirmar" role="status">
      <div className="pagina">
        <strong>Confirme seu e-mail</strong> para ganhar 1 consulta grátis. Mandamos um link para {sessao.usuario.email}.{' '}
        {estado === 'enviado' ? (
          <span>Novo link enviado.</span>
        ) : estado === 'erro' ? (
          <span>Não foi possível enviar agora.</span>
        ) : (
          <button type="button" className="link-botao" onClick={reenviar} disabled={estado === 'enviando'}>
            Reenviar
          </button>
        )}
      </div>
    </div>
  );
}
