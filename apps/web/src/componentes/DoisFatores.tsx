import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useSessao } from '../sessao';
import { CodigoQr } from './CodigoQr';
import { EntradaSenha } from './EntradaSenha';

/**
 * Verificação em duas etapas, em Minha conta: ligar (senha → QR no aplicativo autenticador →
 * primeiro código → códigos de recuperação) e desligar (senha e código). Obrigatória para
 * administrador e suporte no servidor de produção (docs/seguranca.md).
 */
export function DoisFatores({ obrigatoria }: { obrigatoria: boolean }) {
  const { sessao, definir } = useSessao();
  const [estado, setEstado] = useState<{ ativo: boolean; codigosRestantes: number } | null>(null);
  const [etapa, setEtapa] = useState<'' | 'senha' | 'qr' | 'codigos' | 'desligar'>('');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [novo, setNovo] = useState<{ segredo: string; endereco: string } | null>(null);
  const [codigos, setCodigos] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const carregar = () => api.doisFatores.ver().then(setEstado).catch(() => undefined);
  useEffect(() => {
    carregar();
  }, []);

  async function passo(acao: () => Promise<void>) {
    setErro('');
    setOcupado(true);
    try {
      await acao();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  const iniciar = (ev: FormEvent) => {
    ev.preventDefault();
    void passo(async () => {
      setNovo(await api.doisFatores.iniciar(senha));
      setSenha('');
      setEtapa('qr');
    });
  };

  const ativar = (ev: FormEvent) => {
    ev.preventDefault();
    void passo(async () => {
      const r = await api.doisFatores.ativar(codigo);
      setCodigos(r.codigosRecuperacao);
      setCodigo('');
      setEtapa('codigos');
      await carregar();
      // A sessão continua; /v1/eu já traz a verificação ligada (e o painel liberado).
      definir(await api.eu());
    });
  };

  const desligar = (ev: FormEvent) => {
    ev.preventDefault();
    void passo(async () => {
      await api.doisFatores.desativar(senha, codigo);
      setSenha('');
      setCodigo('');
      setEtapa('');
      await carregar();
      definir(await api.eu());
    });
  };

  if (!estado || !sessao) return null;

  return (
    <section className="cartao pilha-p dois-fatores" id="dois-fatores">
      <div className="topo-com-acao">
        <h2 className="secao-titulo">Verificação em duas etapas</h2>
        <span className={`selo ${estado.ativo ? 's-sem_impedimento' : obrigatoria ? 's-impedimento' : 's-nao_verificado'}`}>
          {estado.ativo ? 'Ligada' : obrigatoria ? 'Obrigatória para o painel' : 'Desligada'}
        </span>
      </div>
      <p className="fonte-suave">
        Além da senha, o login pede um código de 6 dígitos que muda a cada 30 segundos no seu celular, no aplicativo autenticador
        (Google Authenticator, Microsoft Authenticator ou outro). Quem descobrir a sua senha não entra sem o celular.
      </p>

      {erro && (
        <p className="alerta alerta-erro" role="alert">
          {erro}
        </p>
      )}

      {estado.ativo && etapa === '' && (
        <>
          <p>
            Códigos de recuperação que ainda valem: <strong>{estado.codigosRestantes}</strong>
            {estado.codigosRestantes <= 3 && ' — estão acabando: desligue e ligue de novo para gerar outros.'}
          </p>
          <div className="botoes">
            <button type="button" className="botao botao-secundario botao-auto" onClick={() => setEtapa('desligar')}>
              Desligar a verificação em duas etapas
            </button>
          </div>
        </>
      )}

      {!estado.ativo && etapa === '' && (
        <div className="botoes">
          <button type="button" className="botao botao-primario botao-auto" onClick={() => setEtapa('senha')}>
            Ligar a verificação em duas etapas
          </button>
        </div>
      )}

      {etapa === 'senha' && (
        <form className="pilha-p" onSubmit={iniciar}>
          <EntradaSenha rotulo="Confirme a sua senha" value={senha} onChange={setSenha} autoComplete="current-password" />
          <div className="botoes-linha">
            <button type="submit" className="botao botao-primario botao-auto" disabled={ocupado || !senha}>
              Continuar
            </button>
            <button type="button" className="link-botao" onClick={() => setEtapa('')}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {etapa === 'qr' && novo && (
        <form className="pilha-p" onSubmit={ativar}>
          <ol className="passos-2fa">
            <li>Instale um aplicativo autenticador no celular, se ainda não tiver.</li>
            <li>No aplicativo, adicione uma conta lendo este código QR:</li>
          </ol>
          <CodigoQr texto={novo.endereco} tamanho={180} rotulo="Código QR para o aplicativo autenticador" />
          <p className="ajuda">
            Não dá para ler o QR? Digite esta chave no aplicativo: <span className="mono chave-2fa">{novo.segredo.match(/.{1,4}/g)!.join(' ')}</span>
          </p>
          <label className="campo">
            <span className="rotulo">3. Digite o código de 6 dígitos que apareceu no aplicativo</span>
            <input
              className="entrada entrada-codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
            />
          </label>
          <div className="botoes-linha">
            <button type="submit" className="botao botao-primario botao-auto" disabled={ocupado || codigo.length < 6}>
              Ligar
            </button>
            <button type="button" className="link-botao" onClick={() => setEtapa('')}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {etapa === 'codigos' && (
        <div className="pilha-p">
          <p className="alerta alerta-ok" role="status">
            Verificação em duas etapas ligada. Os outros aparelhos em que você estava conectado precisam entrar de novo.
          </p>
          <p>
            <strong>Guarde estes códigos de recuperação</strong> (num gerenciador de senhas ou impressos). Cada um entra uma vez só, se você
            perder o celular. Eles não aparecem de novo.
          </p>
          <ul className="codigos-recuperacao mono">
            {codigos.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="botoes-linha">
            <button type="button" className="botao botao-secundario botao-auto" onClick={() => void navigator.clipboard?.writeText(codigos.join('\n'))}>
              Copiar os códigos
            </button>
            <button type="button" className="botao botao-primario botao-auto" onClick={() => setEtapa('')}>
              Já guardei
            </button>
          </div>
        </div>
      )}

      {etapa === 'desligar' && (
        <form className="pilha-p" onSubmit={desligar}>
          {obrigatoria && (
            <p className="alerta" role="note">
              Sem a verificação em duas etapas, o painel administrativo fica bloqueado para a sua conta.
            </p>
          )}
          <EntradaSenha rotulo="Sua senha" value={senha} onChange={setSenha} autoComplete="current-password" />
          <label className="campo">
            <span className="rotulo">Código do aplicativo ou de recuperação</span>
            <input className="entrada entrada-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} autoComplete="one-time-code" maxLength={9} />
          </label>
          <div className="botoes-linha">
            <button type="submit" className="botao botao-perigo botao-auto" disabled={ocupado || !senha || codigo.length < 6}>
              Desligar
            </button>
            <button type="button" className="link-botao" onClick={() => setEtapa('')}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
