import { formatarCar, type Status } from '@apto/regras';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, type Aviso, type ImovelCarteira } from '../api';
import { Icone } from '../componentes/Icones';
import { SeloStatus } from '../componentes/SeloStatus';
import { useSessao } from '../sessao';
import { dataBr, PESO_STATUS, ROTULO_STATUS } from '../textos';

const STATUS_DO_VEREDITO = {
  impedimento: 'impedimento',
  atencao: 'atencao',
  sem_impedimento: 'sem_impedimento',
  incompleto: 'nao_verificado',
} as const satisfies Record<string, Status>;

type Filtro = 'todos' | Status;
type Ordem = 'situacao' | 'nome' | 'recentes';

/** As quatro situações, na ordem da barra de distribuição (do mais grave ao OK). */
const SITUACOES: { status: Status; rotulo: string }[] = [
  { status: 'impedimento', rotulo: 'Impedimento' },
  { status: 'atencao', rotulo: 'Atenção' },
  { status: 'nao_verificado', rotulo: 'Incompleto' },
  { status: 'sem_impedimento', rotulo: 'Sem impedimento' },
];

const statusDe = (im: ImovelCarteira): Status => STATUS_DO_VEREDITO[im.resultado.veredito];

/** Data e hora no fuso de Brasília: "hoje, 06:02", "ontem, 18:40" ou "21/10/2026". */
function quando(iso: string): string {
  const fuso = { timeZone: 'America/Sao_Paulo' } as const;
  const dia = (d: Date) => d.toLocaleDateString('en-CA', fuso);
  const data = new Date(iso);
  const hora = data.toLocaleTimeString('pt-BR', { ...fuso, hour: '2-digit', minute: '2-digit' });
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86_400_000);
  if (dia(data) === dia(hoje)) return `hoje, ${hora}`;
  if (dia(data) === dia(ontem)) return `ontem, ${hora}`;
  return dataBr(dia(data));
}

/** O que pesa no imóvel: os itens com impedimento ou atenção, do mais grave ao mais leve. */
function pontosDoImovel(im: ImovelCarteira): string {
  const itens = [...(im.resultado.itens ?? [])]
    .filter((i) => i.status === 'impedimento' || i.status === 'atencao')
    .sort((a, b) => PESO_STATUS[a.status] - PESO_STATUS[b.status]);
  if (itens.length === 0) return statusDe(im) === 'nao_verificado' ? 'Alguma base não foi consultada' : 'Nada encontrado nas bases';
  return itens.map((i) => i.titulo).join(' · ');
}

/** Menu "⋯" das ações secundárias de uma linha. Fecha ao clicar fora ou ao apertar Esc. */
function MenuAcoes({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const fechar = (e: Event) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current) ref.current.open = false;
    };
    document.addEventListener('click', fechar);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('click', fechar);
      document.removeEventListener('keydown', esc);
    };
  }, []);
  return (
    <details className="menu-acoes" ref={ref}>
      <summary aria-label={rotulo} title={rotulo}>
        <span aria-hidden="true">⋯</span>
      </summary>
      <div className="menu-acoes-lista" role="menu">
        {children}
      </div>
    </details>
  );
}

/** Imóveis que o técnico acompanha. O sistema reconfere todos os dias. */
export function Carteira() {
  const { sessao, carregando } = useSessao();
  const [imoveis, setImoveis] = useState<ImovelCarteira[] | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [limite, setLimite] = useState(50);
  // Técnico da equipe inclui imóveis, mas só o responsável e os administradores tiram.
  const [podeRemover, setPodeRemover] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('situacao');

  async function carregar() {
    try {
      const [c, a] = await Promise.all([api.carteira(), api.avisos()]);
      setImoveis(c.imoveis);
      setLimite(c.limite);
      setPodeRemover(c.podeRemover);
      setAvisos(a.avisos);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  useEffect(() => {
    if (sessao) carregar();
  }, [sessao]);

  if (carregando) return <div className="pagina">Carregando…</div>;
  if (!sessao) return <Navigate to="/entrar?voltar=/carteira" replace />;

  const naoLidos = avisos.filter((a) => !a.lido);
  const lista = imoveis ?? [];
  const contar = (s: Status) => lista.filter((im) => statusDe(im) === s).length;
  const termo = busca.trim().toLowerCase();
  const termoCar = termo.replace(/[.\s-]/g, '');
  const visiveis = lista
    .filter((im) => filtro === 'todos' || statusDe(im) === filtro)
    .filter(
      (im) =>
        !termo || (im.apelido ?? '').toLowerCase().includes(termo) || (termoCar && im.codCar.toLowerCase().replace(/[.\s-]/g, '').includes(termoCar)),
    )
    .sort((a, b) => {
      if (ordem === 'nome') return (a.apelido ?? a.codCar).localeCompare(b.apelido ?? b.codCar, 'pt-BR');
      if (ordem === 'recentes') return b.criadoEm.localeCompare(a.criadoEm);
      return PESO_STATUS[statusDe(a)] - PESO_STATUS[statusDe(b)] || (a.apelido ?? '').localeCompare(b.apelido ?? '', 'pt-BR');
    });
  const ultimaConferencia = lista.reduce<string | null>((m, im) => (!m || im.verificadoEm > m ? im.verificadoEm : m), null);
  const titulo = !sessao.equipe
    ? 'Minha carteira'
    : sessao.equipe.papel === 'responsavel'
      ? 'Carteira da equipe'
      : `Carteira da equipe de ${sessao.equipe.donoNome}`;

  async function marcarLidos() {
    await api.marcarAvisosLidos();
    await carregar();
  }

  async function remover(im: ImovelCarteira) {
    if (!window.confirm(`Deixar de acompanhar ${im.apelido ?? 'este imóvel'}? Ele sai da carteira e deixa de ser reconferido.`)) return;
    await api.deixarDeAcompanhar(im.id);
    await carregar();
  }

  return (
    <div className="pagina pagina-media pilha">
      <div className="topo-com-acao">
        <div className="topo-pagina">
          <p className="sobretitulo">Carteira</p>
          <h1 className="titulo-pagina">{titulo}</h1>
          <p className="subtitulo">Reconferimos estes imóveis todos os dias com as bases oficiais. Se algo mudar, avisamos aqui e por e-mail.</p>
        </div>
        <Link to="/consultar" className="botao botao-primario botao-auto">
          <span aria-hidden="true">+</span> Incluir imóvel
        </Link>
      </div>

      {erro && <p className="alerta alerta-erro">{erro}</p>}

      {lista.length > 0 && (
        <section className="painel-carteira" aria-label="Resumo da carteira">
          <div className="painel-bloco">
            <span className="painel-rotulo">Imóveis acompanhados</span>
            <span className="painel-valor">
              {lista.length} <small>de {limite}</small>
            </span>
            <span className="ocupacao-barra" aria-hidden="true">
              <span style={{ width: `${Math.max(2, Math.min(100, (lista.length / Math.max(limite, 1)) * 100))}%` }} />
            </span>
          </div>

          <div className="painel-bloco painel-distribuicao">
            <span className="painel-rotulo">Situação hoje</span>
            <div className="distribuicao" role="img" aria-label={SITUACOES.map((s) => `${contar(s.status)} ${s.rotulo}`).join(', ')}>
              {SITUACOES.filter((s) => contar(s.status) > 0).map((s) => (
                <span key={s.status} className={`dist-${s.status}`} style={{ flexGrow: contar(s.status) }} />
              ))}
            </div>
            <div className="legenda" role="group" aria-label="Filtrar pela situação">
              {SITUACOES.map((s) => (
                <button
                  key={s.status}
                  type="button"
                  className={`legenda-item${filtro === s.status ? ' ativa' : ''}`}
                  aria-pressed={filtro === s.status}
                  disabled={contar(s.status) === 0}
                  onClick={() => setFiltro(filtro === s.status ? 'todos' : s.status)}
                >
                  <i className={`dist-${s.status}`} aria-hidden="true" />
                  <strong>{contar(s.status)}</strong> {s.rotulo}
                </button>
              ))}
            </div>
          </div>

          <div className="painel-bloco">
            <span className="painel-rotulo">Última reconferência</span>
            <span className="painel-valor painel-valor-texto">{ultimaConferencia ? quando(ultimaConferencia) : '—'}</span>
            <span className="fonte-suave painel-nota">
              {naoLidos.length ? `${naoLidos.length} ${naoLidos.length === 1 ? 'mudança nova' : 'mudanças novas'}` : 'Nenhuma mudança nova'}
            </span>
          </div>
        </section>
      )}

      {naoLidos.length > 0 && (
        <section className="cartao pilha-p avisos-novos" aria-labelledby="titulo-avisos">
          <div className="item-topo">
            <h2 id="titulo-avisos" className="secao-titulo">
              <Icone nome="sino" className="l-icone-p" /> {naoLidos.length === 1 ? '1 mudança nova' : `${naoLidos.length} mudanças novas`}
            </h2>
            <button type="button" className="link-botao" onClick={marcarLidos}>
              Marcar como vistas
            </button>
          </div>
          <ul className="lista-avisos">
            {naoLidos.map((a) => (
              <li key={a.id}>
                <div className="aviso-topo">
                  <strong>{a.apelido ?? formatarCar(a.codCar)}</strong>
                  <span className="fonte-suave">{quando(a.criadoEm)}</span>
                </div>
                <ul className="lista-mudancas">
                  {a.alteracoes.map((x) => (
                    <li key={x.regraId} className={x.piorou ? 'piorou' : 'melhorou'}>
                      <span>{x.titulo}</span>
                      <span className="mudanca">
                        {ROTULO_STATUS[x.de]} → <strong>{ROTULO_STATUS[x.para]}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
                {a.consultaId && (
                  <Link to={`/consulta/${a.consultaId}`} className="l-link">
                    Ver o resultado atualizado <Icone nome="seta" className="l-icone-p" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {imoveis && imoveis.length === 0 && (
        <div className="cartao estado-vazio">
          <span className="l-icone-caixa">
            <Icone nome="mapa" />
          </span>
          <h2 className="secao-titulo">Nenhum imóvel na carteira ainda</h2>
          <p className="fonte-suave">
            Faça uma consulta e toque em <strong>Acompanhar este imóvel</strong> no resultado. A partir daí, reconferimos todo dia e
            avisamos se surgir um embargo, mudar a situação do CAR ou chegar a data do Prodes.
          </p>
          <Link to="/consultar" className="botao botao-primario botao-auto">
            Consultar um imóvel
          </Link>
        </div>
      )}

      {lista.length > 0 && (
        <section className="lista-carteira" aria-label="Imóveis">
          <div className="lista-ferramentas">
            <div className="abas-filtro" role="group" aria-label="Filtrar">
              {(['todos', ...SITUACOES.map((s) => s.status)] as Filtro[])
                .filter((f) => f === 'todos' || contar(f) > 0)
                .map((f) => (
                  <button key={f} type="button" className={filtro === f ? 'ativa' : ''} aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
                    {f === 'todos' ? 'Todos' : SITUACOES.find((s) => s.status === f)!.rotulo}
                    <span className="abas-filtro-num">{f === 'todos' ? lista.length : contar(f)}</span>
                  </button>
                ))}
            </div>
            <div className="lista-busca">
              <label className="campo-busca">
                <Icone nome="busca" className="l-icone-p" />
                <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por apelido ou CAR" aria-label="Buscar imóvel" />
              </label>
              <select className="entrada entrada-ordem" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar">
                <option value="situacao">Mais graves primeiro</option>
                <option value="nome">Nome (A–Z)</option>
                <option value="recentes">Incluídos por último</option>
              </select>
            </div>
          </div>

          <div className="tabela-carteira" role="table" aria-label="Imóveis da carteira">
            <div className="linha-carteira linha-cabecalho" role="row">
              <span role="columnheader">Imóvel</span>
              <span role="columnheader">Situação</span>
              <span role="columnheader">O que pesa</span>
              <span role="columnheader">Conferido</span>
              <span role="columnheader" aria-label="Ações" />
            </div>
            {visiveis.length === 0 ? (
              <p className="lista-vazia">Nenhum imóvel com esse filtro ou busca.</p>
            ) : (
              visiveis.map((im) => {
                const status = statusDe(im);
                return (
                  <div key={im.id} className={`linha-carteira b-${status}`} role="row">
                    <span role="cell" className="col-imovel">
                      <span className="imovel-nome">
                        {im.apelido ?? 'Imóvel sem apelido'}
                        {im.avisosNaoLidos > 0 && <span className="etiqueta etiqueta-novo">mudou</span>}
                      </span>
                      <span className="imovel-car mono" title={formatarCar(im.codCar)}>
                        <span className="uf">{im.codCar.slice(0, 2)}</span> {formatarCar(im.codCar)}
                      </span>
                    </span>
                    <span role="cell" className="col-situacao">
                      <SeloStatus status={status} />
                    </span>
                    <span role="cell" className="col-pontos" title={pontosDoImovel(im)}>
                      {pontosDoImovel(im)}
                    </span>
                    <span role="cell" className="col-conferido">
                      {quando(im.verificadoEm)}
                    </span>
                    <span role="cell" className="col-acoes">
                      {im.ultimaConsultaId && (
                        <Link to={`/consulta/${im.ultimaConsultaId}`} className="botao botao-secundario botao-pequeno">
                          Ver resultado
                        </Link>
                      )}
                      {podeRemover && (
                        <MenuAcoes rotulo={`Mais ações para ${im.apelido ?? 'este imóvel'}`}>
                          <button type="button" role="menuitem" className="item-perigo" onClick={() => remover(im)}>
                            Deixar de acompanhar
                          </button>
                        </MenuAcoes>
                      )}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}
    </div>
  );
}
