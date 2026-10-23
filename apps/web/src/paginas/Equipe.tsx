import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, type Equipe as DadosEquipe, type PapelEquipe } from '../api';
import { Icone } from '../componentes/Icones';
import { useSessao } from '../sessao';
import { dataBr } from '../textos';

export const NOME_PAPEL: Record<PapelEquipe, string> = {
  responsavel: 'Responsável',
  administrador: 'Administrador',
  tecnico: 'Técnico',
};

const O_QUE_FAZ: { papel: PapelEquipe; texto: string }[] = [
  { papel: 'responsavel', texto: 'Paga o plano e faz tudo o que os outros fazem.' },
  { papel: 'administrador', texto: 'Convida e remove pessoas, muda papéis e tira imóveis da carteira. Recebe os avisos da carteira por e-mail.' },
  { papel: 'tecnico', texto: 'Consulta imóveis, gera dossiês e põe imóveis na carteira, usando os créditos da equipe.' },
];

/** Equipe do plano Escritório: quem usa a conta, convites e papéis. */
export function Equipe() {
  const { sessao, carregando, atualizarSaldo } = useSessao();
  const navegar = useNavigate();
  const [dados, setDados] = useState<DadosEquipe | null>(null);
  const [maxPlanos, setMaxPlanos] = useState<{ nome: string; pessoas: number } | null>(null);
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<'administrador' | 'tecnico'>('tecnico');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(() => {
    api.equipe
      .ver()
      .then(setDados)
      .catch((e: Error) => setErro(e.message));
  }, []);

  useEffect(() => {
    if (!sessao) return;
    carregar();
    api
      .planos()
      .then((r) => {
        const maior = [...r.planos].sort((a, b) => (b.limiteMembros ?? 1) - (a.limiteMembros ?? 1))[0];
        if (maior && (maior.limiteMembros ?? 1) > 1) setMaxPlanos({ nome: maior.nome, pessoas: maior.limiteMembros! });
      })
      .catch(() => undefined);
  }, [sessao, carregar]);

  if (carregando) return <div className="pagina">Carregando…</div>;
  if (!sessao) return <Navigate to="/entrar?voltar=/equipe" replace />;
  if (!dados) {
    return (
      <div className="pagina">
        {erro ? (
          <p className="alerta alerta-erro" role="alert">
            {erro}
          </p>
        ) : (
          'Carregando…'
        )}
      </div>
    );
  }

  async function acao(fazer: () => Promise<unknown>, sucesso: string) {
    setErro('');
    setAviso('');
    try {
      await fazer();
      setAviso(sucesso);
      carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function convidar(ev: FormEvent) {
    ev.preventDefault();
    setEnviando(true);
    await acao(() => api.equipe.convidar(email, papel), `Convite enviado para ${email}. O link vale por 7 dias.`);
    setEmail('');
    setEnviando(false);
  }

  async function sair() {
    if (!window.confirm(`Sair da equipe de ${dados!.donoNome}? Você volta a usar só a sua conta e seus créditos pessoais.`)) return;
    try {
      await api.equipe.remover(sessao!.usuario.id);
      await atualizarSaldo();
      navegar('/conta', { replace: true });
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const ehResponsavel = dados.papel === 'responsavel';
  const semEquipe = ehResponsavel && dados.limite <= 1 && dados.membros.length === 0;
  const lotada = dados.ocupacao >= dados.limite;

  return (
    <div className="pagina pagina-media pilha">
      <div className="topo-pagina">
        <p className="sobretitulo">Equipe</p>
        <h1 className="titulo-pagina">{ehResponsavel ? 'Sua equipe' : `Equipe de ${dados.donoNome}`}</h1>
        <p className="subtitulo">
          Na equipe, todos consultam e acompanham a carteira com os mesmos créditos. O plano e as compras ficam com o responsável.
        </p>
      </div>

      {erro && (
        <p className="alerta alerta-erro" role="alert">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="alerta alerta-ok" role="status">
          {aviso}
        </p>
      )}

      {semEquipe ? (
        <section className="cartao pilha-p equipe-vazia">
          <span className="l-icone-caixa">
            <Icone nome="camadas" />
          </span>
          <h2 className="secao-titulo">Seu plano não inclui equipe</h2>
          <p className="fonte-suave">
            {maxPlanos
              ? `Com o plano ${maxPlanos.nome}, até ${maxPlanos.pessoas} pessoas do escritório usam os mesmos créditos e a mesma carteira, cada uma com o próprio login.`
              : 'Com um plano de equipe, as pessoas do escritório usam os mesmos créditos e a mesma carteira, cada uma com o próprio login.'}
          </p>
          <div>
            <Link to="/planos" className="botao botao-primario" style={{ width: 'auto' }}>
              Ver planos
            </Link>
          </div>
        </section>
      ) : (
        <>
          <div className="ocupacao" aria-label="Ocupação da equipe">
            <div className="ocupacao-texto">
              <strong>
                {dados.ocupacao} de {dados.limite} pessoas
              </strong>
              <span className="fonte-suave">contando o responsável e os convites em aberto</span>
            </div>
            <div className="ocupacao-barra" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (dados.ocupacao / Math.max(dados.limite, 1)) * 100)}%` }} />
            </div>
          </div>

          <section className="cartao pilha-p">
            <h2 className="secao-titulo">Pessoas</h2>
            <div className="tabela-rolavel">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Nome</th>
                    {dados.podeGerir && <th>E-mail</th>}
                    <th>Papel</th>
                    {dados.podeGerir && <th>Consultas no mês</th>}
                    {dados.podeGerir && <th aria-label="Ações" />}
                  </tr>
                </thead>
                <tbody>
                  {(dados.membros.length
                    ? dados.membros
                    : [{ usuarioId: sessao.usuario.id, nome: sessao.usuario.nome, email: sessao.usuario.email, papel: 'responsavel' as const }]
                  ).map((m) => (
                    <tr key={m.usuarioId}>
                      <td>
                        {m.nome}
                        {m.usuarioId === sessao.usuario.id && <span className="etiqueta">você</span>}
                      </td>
                      {dados.podeGerir && <td>{m.email}</td>}
                      <td>
                        {dados.podeGerir && m.papel !== 'responsavel' ? (
                          <select
                            className="entrada entrada-pequena"
                            value={m.papel}
                            aria-label={`Papel de ${m.nome}`}
                            onChange={(e) =>
                              acao(() => api.equipe.mudarPapel(m.usuarioId, e.target.value as 'administrador' | 'tecnico'), `Papel de ${m.nome} atualizado.`)
                            }
                          >
                            <option value="administrador">Administrador</option>
                            <option value="tecnico">Técnico</option>
                          </select>
                        ) : (
                          NOME_PAPEL[m.papel]
                        )}
                      </td>
                      {dados.podeGerir && <td>{m.consultasNoMes ?? 0}</td>}
                      {dados.podeGerir && (
                        <td>
                          {m.papel !== 'responsavel' && m.usuarioId !== sessao.usuario.id && (
                            <button
                              type="button"
                              className="link-botao link-perigo"
                              onClick={() => {
                                if (window.confirm(`Remover ${m.nome} da equipe? A pessoa volta a usar só a própria conta.`)) {
                                  void acao(() => api.equipe.remover(m.usuarioId), `${m.nome} saiu da equipe.`);
                                }
                              }}
                            >
                              Remover
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {dados.podeGerir && dados.convites.length > 0 && (
            <section className="cartao pilha-p">
              <h2 className="secao-titulo">Convites em aberto</h2>
              <ul className="lista-convites">
                {dados.convites.map((c) => (
                  <li key={c.id}>
                    <div>
                      <strong>{c.email}</strong>
                      <span className="fonte-suave">
                        {NOME_PAPEL[c.papel]} · vence em {dataBr(c.expiraEm)}
                      </span>
                    </div>
                    <button type="button" className="link-botao" onClick={() => acao(() => api.equipe.cancelarConvite(c.id), `Convite para ${c.email} cancelado.`)}>
                      Cancelar
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {dados.podeGerir && (
            <form className="cartao pilha-p" onSubmit={convidar}>
              <h2 className="secao-titulo">Convidar alguém</h2>
              {lotada ? (
                <p className="fonte-suave">
                  A equipe está completa. Remova alguém ou cancele um convite para chamar outra pessoa
                  {ehResponsavel ? ', ou mude para um plano com mais pessoas.' : '.'}
                </p>
              ) : (
                <>
                  <p className="fonte-suave">A pessoa recebe um link por e-mail e entra com o próprio login, usando os créditos da equipe.</p>
                  <div className="linha-convite">
                    <label className="campo">
                      <span className="rotulo">E-mail</span>
                      <input className="entrada" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="nome@escritorio.com.br" />
                    </label>
                    <label className="campo">
                      <span className="rotulo">Papel</span>
                      <select className="entrada" value={papel} onChange={(e) => setPapel(e.target.value as 'administrador' | 'tecnico')}>
                        <option value="tecnico">Técnico</option>
                        <option value="administrador">Administrador</option>
                      </select>
                    </label>
                  </div>
                  <div>
                    <button type="submit" className="botao botao-primario" style={{ width: 'auto' }} disabled={enviando || !email}>
                      {enviando ? 'Enviando…' : 'Enviar convite'}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </>
      )}

      <section className="cartao pilha-p">
        <h2 className="secao-titulo">O que cada papel faz</h2>
        <dl className="papeis">
          {O_QUE_FAZ.map((p) => (
            <div key={p.papel}>
              <dt>{NOME_PAPEL[p.papel]}</dt>
              <dd>{p.texto}</dd>
            </div>
          ))}
        </dl>
      </section>

      {!ehResponsavel && (
        <button type="button" className="link-botao link-perigo" onClick={sair}>
          Sair da equipe
        </button>
      )}
    </div>
  );
}
