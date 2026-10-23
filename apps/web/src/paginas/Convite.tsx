import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type ConviteEquipe } from '../api';
import { Icone } from '../componentes/Icones';
import { useSessao } from '../sessao';
import { contagem } from '../textos';
import { NOME_PAPEL } from './Equipe';

const SITUACAO: Record<Exclude<ConviteEquipe['situacao'], 'pendente'>, string> = {
  aceito: 'Este convite já foi aceito.',
  cancelado: 'Este convite foi cancelado por quem convidou.',
  vencido: 'Este convite venceu (vale por 7 dias). Peça um novo a quem convidou.',
};

/** Link do e-mail de convite: mostra o convite e deixa aceitar com a conta do mesmo e-mail. */
export function Convite() {
  const [busca] = useSearchParams();
  const token = busca.get('token') ?? '';
  const { sessao, carregando, atualizarSaldo, sair } = useSessao();
  const navegar = useNavigate();
  const [convite, setConvite] = useState<ConviteEquipe | null>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!token) {
      setErro('Link incompleto. Abra o convite direto do e-mail.');
      return;
    }
    api.equipe
      .verConvite(token)
      .then(setConvite)
      .catch((e: Error) => setErro(e.message));
  }, [token]);

  const aqui = `/convite?token=${encodeURIComponent(token)}`;

  async function aceitar() {
    setErro('');
    setEnviando(true);
    try {
      await api.equipe.aceitarConvite(token);
      await atualizarSaldo();
      navegar('/equipe', { replace: true });
    } catch (e) {
      setErro((e as Error).message);
      setEnviando(false);
    }
  }

  const mesmoEmail = sessao && convite && sessao.usuario.email.toLowerCase() === convite.email;

  return (
    <div className="pagina pilha" style={{ maxWidth: 600 }}>
      <div className="topo-pagina">
        <p className="sobretitulo">Convite para equipe</p>
        <h1 className="titulo-pagina">{convite ? `Equipe de ${convite.donoNome}` : 'Convite'}</h1>
      </div>

      {erro && (
        <p className="alerta alerta-erro" role="alert">
          {erro}
        </p>
      )}

      {convite && convite.situacao !== 'pendente' && (
        <p className="alerta" role="status">
          {SITUACAO[convite.situacao]}
        </p>
      )}

      {convite && convite.situacao === 'pendente' && !carregando && (
        <section className="cartao pilha-p">
          <span className="l-icone-caixa">
            <Icone nome="camadas" />
          </span>
          <p>
            Você foi convidado para a equipe de <strong>{convite.donoNome}</strong> no Apto Rural, como{' '}
            <strong>{NOME_PAPEL[convite.papel].toLowerCase()}</strong>.
          </p>
          <ul className="lista-simples">
            <li>Você consulta imóveis e acompanha a carteira usando os créditos da equipe.</li>
            <li>Cada pessoa entra com o próprio e-mail e senha.</li>
            <li>Se tiver créditos pessoais, eles ficam guardados e voltam se você sair da equipe.</li>
          </ul>

          {!sessao ? (
            <>
              <p className="fonte-suave">
                O convite foi enviado para <strong>{convite.email}</strong>. Entre ou crie sua conta com esse e-mail para aceitar.
              </p>
              <div className="botoes">
                <Link to={`/entrar?modo=criar&email=${encodeURIComponent(convite.email)}&voltar=${encodeURIComponent(aqui)}`} className="botao botao-primario">
                  Criar conta e aceitar
                </Link>
                <Link to={`/entrar?email=${encodeURIComponent(convite.email)}&voltar=${encodeURIComponent(aqui)}`} className="botao botao-secundario">
                  Já tenho conta
                </Link>
              </div>
            </>
          ) : mesmoEmail ? (
            <>
              {(sessao.saldo.consulta > 0 || sessao.saldo.dossie > 0) && !sessao.equipe && (
                <p className="fonte-suave">
                  Seus créditos pessoais ({contagem(sessao.saldo.consulta, 'consulta', 'consultas')} e{' '}
                  {contagem(sessao.saldo.dossie, 'dossiê', 'dossiês')}) ficam guardados enquanto você estiver na equipe.
                </p>
              )}
              <div>
                <button type="button" className="botao botao-primario" onClick={aceitar} disabled={enviando}>
                  {enviando ? 'Entrando na equipe…' : 'Aceitar e entrar na equipe'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="alerta">
                Você está na conta de <strong>{sessao.usuario.email}</strong>, mas o convite foi enviado para <strong>{convite.email}</strong>.
              </p>
              <div>
                <button
                  type="button"
                  className="botao botao-secundario"
                  onClick={async () => {
                    await sair();
                    navegar(`/entrar?email=${encodeURIComponent(convite.email)}&voltar=${encodeURIComponent(aqui)}`);
                  }}
                >
                  Sair e entrar com {convite.email}
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
