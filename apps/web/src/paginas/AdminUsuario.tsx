import { formatarCar } from '@apto/regras';
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api, type FichaUsuario, type Papel } from '../api';
import { useSessao } from '../sessao';
import { dataBr, VEREDITO } from '../textos';
import { AjusteCreditos, dataHora, descreverDetalhes, NOME_ACAO, reais } from './Admin';

const NOME_PAPEL: Record<Papel, string> = { usuario: 'Cliente', suporte: 'Suporte (só leitura)', admin: 'Administrador' };
const SITUACAO_ASSINATURA = { pendente: 'Aguardando 1º pagamento', ativa: 'Ativa', inadimplente: 'Em atraso', cancelada: 'Cancelada' };

/** Ficha de um usuário: tudo sobre a conta e as ações de suporte e administração. */
export function AdminUsuario() {
  const { id = '' } = useParams();
  const { sessao, carregando } = useSessao();
  const [ficha, setFicha] = useState<FichaUsuario | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ajustando, setAjustando] = useState(false);
  const nivel = sessao?.nivelAdmin;
  const podeAlterar = nivel === 'admin';

  async function carregar() {
    try {
      setFicha(await api.admin.ficha(id));
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  useEffect(() => {
    if (nivel) carregar();
  }, [id, nivel]);

  if (carregando) return <div className="pagina">Carregando…</div>;
  if (!nivel) return <Navigate to="/" replace />;
  if (erro) return <div className="pagina alerta alerta-erro">{erro}</div>;
  if (!ficha) return <div className="pagina">Carregando…</div>;

  const u = ficha.usuario;
  const proprio = u.id === sessao?.usuario.id;

  async function acao(fn: () => Promise<unknown>, sucesso: string) {
    setErro('');
    setAviso('');
    try {
      await fn();
      setAviso(sucesso);
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function entrarComo() {
    if (!window.confirm(`Ver o site como ${u.nome}? Fica registrado na auditoria e é só leitura, por até 1 hora.`)) return;
    try {
      await api.admin.entrarComo(u.id);
      window.location.assign('/');
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  function bloquear() {
    const motivo = window.prompt(`Motivo do bloqueio de ${u.nome}:`);
    if (motivo) acao(() => api.admin.bloquear(u.id, motivo), 'Conta bloqueada e sessões encerradas.');
  }

  return (
    <div className="pagina pagina-larga pilha">
      <nav className="trilha" aria-label="Você está em">
        <Link to="/admin">Painel</Link>
        <span aria-hidden="true">/</span>
        <Link to="/admin?aba=usuarios">Usuários</Link>
        <span aria-hidden="true">/</span>
        <span>{u.nome}</span>
      </nav>

      <section className="cartao pilha-p ficha">
        <div className="ficha-topo">
          <span className="avatar" aria-hidden="true">
            {u.nome
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((p) => p[0]!.toUpperCase())
              .join('')}
          </span>
          <div className="ficha-nome">
            <h1 className="titulo-pagina">{u.nome}</h1>
            <span className="fonte-suave">{u.email}</span>
          </div>
          <span className="ficha-etiquetas">
            {u.papel !== 'usuario' && <span className="etiqueta">{NOME_PAPEL[u.papel]}</span>}
            {u.bloqueadoEm && <span className="etiqueta etiqueta-vermelha">bloqueado</span>}
            {!u.confirmadoEm && <span className="etiqueta etiqueta-vermelha">e-mail não confirmado</span>}
          </span>
        </div>

        <div className="ficha-numeros">
          <div>
            <strong>{ficha.saldo.consulta}</strong>
            <span>consultas no saldo</span>
          </div>
          <div>
            <strong>{ficha.saldo.dossie}</strong>
            <span>dossiês no saldo</span>
          </div>
          <div>
            <strong>{ficha.consultas.length}</strong>
            <span>consultas feitas</span>
          </div>
          <div>
            <strong>{ficha.carteira.length}</strong>
            <span>imóveis na carteira</span>
          </div>
        </div>

        <dl className="dados">
          <dt>E-mail</dt>
          <dd>
            {u.email} {u.confirmadoEm ? `(confirmado em ${dataHora(u.confirmadoEm)})` : '(não confirmado)'}
          </dd>
          {u.whatsapp && (
            <>
              <dt>WhatsApp</dt>
              <dd>{u.whatsapp}</dd>
            </>
          )}
          {u.profissao && (
            <>
              <dt>Profissão</dt>
              <dd>{u.profissao}</dd>
            </>
          )}
          <dt>Desde</dt>
          <dd>{dataHora(u.criadoEm)}</dd>
          {u.bloqueadoEm && (
            <>
              <dt>Bloqueio</dt>
              <dd>
                {dataHora(u.bloqueadoEm)} — {u.bloqueioMotivo}
              </dd>
            </>
          )}
        </dl>

        {aviso && (
          <p className="alerta alerta-ok" role="status">
            {aviso}
          </p>
        )}
        {erro && <p className="alerta alerta-erro">{erro}</p>}

        {!proprio && (
          <div className="acoes-admin">
            <button type="button" className="botao botao-secundario" onClick={entrarComo}>
              Entrar como (ver o que ele vê)
            </button>
            {!u.confirmadoEm && (
              <button
                type="button"
                className="botao botao-secundario"
                onClick={() => acao(() => api.admin.reenviarConfirmacao(u.id), 'Confirmação reenviada.')}
              >
                Reenviar confirmação
              </button>
            )}
            {podeAlterar && (
              <>
                <button type="button" className="botao botao-secundario" onClick={() => setAjustando(true)}>
                  Ajustar créditos
                </button>
                {u.doisFatores && (
                  <button
                    type="button"
                    className="botao botao-secundario"
                    onClick={() => {
                      const motivo = window.prompt(
                        `Desligar a verificação em duas etapas de ${u.nome}? Faça isso só depois de confirmar que é a própria pessoa (por telefone, por exemplo). Ela sai de todos os aparelhos e entra só com a senha.\n\nMotivo:`,
                      );
                      if (motivo) acao(() => api.admin.desativarDoisFatores(u.id, motivo), 'Verificação em duas etapas desligada.');
                    }}
                  >
                    Desligar verificação em duas etapas
                  </button>
                )}
                {u.bloqueadoEm ? (
                  <button
                    type="button"
                    className="botao botao-secundario"
                    onClick={() => acao(() => api.admin.desbloquear(u.id), 'Conta desbloqueada.')}
                  >
                    Desbloquear
                  </button>
                ) : (
                  <button type="button" className="botao botao-perigo" onClick={bloquear}>
                    Bloquear conta
                  </button>
                )}
                <label className="papel">
                  <span className="fonte-suave">Papel</span>
                  <select
                    className="entrada"
                    value={u.papel}
                    onChange={(e) => {
                      const papel = e.target.value as Papel;
                      if (window.confirm(`Mudar o papel de ${u.nome} para "${NOME_PAPEL[papel]}"?`)) {
                        acao(() => api.admin.definirPapel(u.id, papel), 'Papel atualizado.');
                      }
                    }}
                  >
                    {(Object.keys(NOME_PAPEL) as Papel[]).map((p) => (
                      <option key={p} value={p}>
                        {NOME_PAPEL[p]}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
        )}
        {ajustando && (
          <AjusteCreditos
            usuario={u}
            aoFechar={async (mudou) => {
              setAjustando(false);
              if (mudou) await carregar();
            }}
          />
        )}
      </section>

      <Tabela
        titulo="Assinaturas"
        colunas={['Plano', 'Situação', 'Desde', 'Cobranças pagas', '']}
        linhas={ficha.assinaturas.map((s) => [
          s.ciclo === 'anual'
            ? `${s.nomePlano} — ${reais(s.valorMensal)}/ano${s.validaAte ? ` (vale até ${dataBr(s.validaAte)})` : ''}`
            : `${s.nomePlano} — ${reais(s.valorMensal)}/mês`,
          SITUACAO_ASSINATURA[s.status],
          dataHora(s.ativadaEm ?? s.criadaEm),
          String(s.mesesPagos),
          podeAlterar && s.status !== 'cancelada' ? (
            <button
              key={s.id}
              type="button"
              className="link-botao"
              onClick={() => {
                if (window.confirm(`Cancelar a assinatura ${s.nomePlano} de ${u.nome}? As próximas mensalidades deixam de ser cobradas.`)) {
                  acao(() => api.admin.cancelarAssinatura(s.id), 'Assinatura cancelada.');
                }
              }}
            >
              Cancelar
            </button>
          ) : (
            ''
          ),
        ])}
      />
      <Tabela
        titulo={`Consultas (${ficha.consultas.length})`}
        colunas={['Data', 'CAR', 'Resultado']}
        linhas={ficha.consultas.map((c) => [
          dataHora(c.criadaEm),
          <Link key={c.id} to={`/consulta/${c.id}`} className="mono">
            {formatarCar(c.codCar)}
          </Link>,
          VEREDITO[c.veredito as keyof typeof VEREDITO]?.titulo ?? c.veredito,
        ])}
      />
      <Tabela
        titulo={`Carteira (${ficha.carteira.length})`}
        colunas={['Imóvel', 'Resultado', 'Conferido']}
        linhas={ficha.carteira.map((c) => [
          c.ultimaConsultaId ? (
            <Link key={c.id} to={`/consulta/${c.ultimaConsultaId}`}>
              {c.apelido ?? formatarCar(c.codCar)}
            </Link>
          ) : (
            (c.apelido ?? c.codCar)
          ),
          VEREDITO[c.veredito as keyof typeof VEREDITO]?.titulo ?? c.veredito,
          dataHora(c.verificadoEm),
        ])}
      />
      <Tabela
        titulo="Pedidos"
        colunas={['Data', 'Produto', 'Valor', 'Situação']}
        linhas={ficha.pedidos.map((p) => [dataHora(p.criadoEm), p.produto, reais(p.valor), p.status])}
      />
      <Tabela
        titulo="Créditos (livro-razão)"
        colunas={['Data', 'Tipo', 'Quantidade', 'Motivo']}
        linhas={ficha.lancamentos.map((l) => [
          dataHora(l.criadoEm),
          l.tipo,
          l.quantidade > 0 ? `+${l.quantidade}` : String(l.quantidade),
          l.motivo,
        ])}
      />
      <Tabela
        titulo="Auditoria desta conta"
        colunas={['Quando', 'Quem', 'Ação', 'Detalhes']}
        linhas={ficha.auditoria.map((a) => [dataHora(a.quando), a.adminEmail, NOME_ACAO[a.acao] ?? a.acao, descreverDetalhes(a.detalhes)])}
      />
    </div>
  );
}

function Tabela({ titulo, colunas, linhas }: { titulo: string; colunas: string[]; linhas: React.ReactNode[][] }) {
  return (
    <section className="cartao pilha-p">
      <h2 className="secao-titulo">{titulo}</h2>
      {linhas.length === 0 ? (
        <p className="ajuda" style={{ marginTop: 0 }}>
          Nada por aqui.
        </p>
      ) : (
        <div className="tabela-rolavel">
          <table className="tabela">
            <thead>
              <tr>
                {colunas.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i}>
                  {l.map((celula, j) => (
                    <td key={j}>{celula}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
