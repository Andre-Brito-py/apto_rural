import { formatarCar } from '@apto/regras';
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, type Aviso, type ImovelCarteira } from '../api';
import { Icone, IconeStatus } from '../componentes/Icones';
import { useSessao } from '../sessao';
import { contagem, dataBr, ROTULO_STATUS, VEREDITO } from '../textos';

const STATUS_DO_VEREDITO = {
  impedimento: 'impedimento',
  atencao: 'atencao',
  sem_impedimento: 'sem_impedimento',
  incompleto: 'nao_verificado',
} as const;

type Filtro = 'todos' | 'impedimento' | 'atencao' | 'sem_impedimento' | 'nao_verificado';

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'impedimento', rotulo: 'Impedimento' },
  { valor: 'atencao', rotulo: 'Atenção' },
  { valor: 'sem_impedimento', rotulo: 'Sem impedimento' },
  { valor: 'nao_verificado', rotulo: 'Incompleto' },
];

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
  const porStatus = (s: Filtro) => lista.filter((im) => s === 'todos' || STATUS_DO_VEREDITO[im.resultado.veredito] === s);
  const termo = busca
    .trim()
    .toLowerCase()
    .replace(/[.\s-]/g, '');
  const visiveis = porStatus(filtro).filter(
    (im) =>
      !termo ||
      (im.apelido ?? '').toLowerCase().includes(busca.trim().toLowerCase()) ||
      im.codCar
        .toLowerCase()
        .replace(/[.\s-]/g, '')
        .includes(termo),
  );
  const ultimaConferencia = lista.reduce<string | null>((m, im) => (!m || im.verificadoEm > m ? im.verificadoEm : m), null);

  async function marcarLidos() {
    await api.marcarAvisosLidos();
    await carregar();
  }

  async function remover(im: ImovelCarteira) {
    if (!window.confirm(`Deixar de acompanhar ${im.apelido ?? 'este imóvel'}?`)) return;
    await api.deixarDeAcompanhar(im.id);
    await carregar();
  }

  return (
    <div className="pagina pagina-media pilha">
      <div className="topo-com-acao">
        <div className="topo-pagina">
          <p className="sobretitulo">Carteira</p>
          <h1 className="titulo-pagina">{sessao?.equipe ? `Carteira da equipe de ${sessao.equipe.donoNome}` : 'Minha carteira'}</h1>
          <p className="subtitulo">
            Reconferimos estes imóveis todos os dias com as bases oficiais. Se algo mudar, avisamos aqui e por e-mail.
          </p>
        </div>
        <Link to="/consultar" className="botao botao-primario botao-auto">
          Consultar e incluir imóvel
        </Link>
      </div>

      {erro && <p className="alerta alerta-erro">{erro}</p>}

      {imoveis && imoveis.length > 0 && (
        <div className="resumo-carteira" aria-label="Resumo da carteira">
          <div className="saldo-bloco">
            <span className="saldo-numero">
              {lista.length}
              <small> / {limite}</small>
            </span>
            <span className="fonte-suave">imóveis acompanhados</span>
            <span className="ocupacao-barra" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (lista.length / Math.max(limite, 1)) * 100)}%` }} />
            </span>
          </div>
          <div className={`saldo-bloco${porStatus('impedimento').length ? ' bloco-alerta' : ''}`}>
            <span className="saldo-numero">{porStatus('impedimento').length}</span>
            <span className="fonte-suave">com impedimento provável</span>
          </div>
          <div className={`saldo-bloco${naoLidos.length ? ' bloco-atencao' : ''}`}>
            <span className="saldo-numero">{naoLidos.length}</span>
            <span className="fonte-suave">{naoLidos.length === 1 ? 'mudança nova' : 'mudanças novas'}</span>
          </div>
          <div className="saldo-bloco">
            <span className="saldo-numero saldo-numero-texto">{ultimaConferencia ? dataBr(ultimaConferencia) : '—'}</span>
            <span className="fonte-suave">última reconferência</span>
          </div>
        </div>
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
                  <span className="fonte-suave">{dataBr(a.criadoEm)}</span>
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

      {imoveis && imoveis.length > 0 && (
        <section className="pilha-p">
          <div className="barra-filtros">
            <div className="exemplos" role="group" aria-label="Filtrar por situação">
              {FILTROS.filter((f) => f.valor === 'todos' || porStatus(f.valor).length > 0).map((f) => (
                <button
                  key={f.valor}
                  type="button"
                  className={`chip${filtro === f.valor ? ' chip-ativo' : ''}`}
                  aria-pressed={filtro === f.valor}
                  onClick={() => setFiltro(f.valor)}
                >
                  {f.rotulo} <span className="chip-num">{porStatus(f.valor).length}</span>
                </button>
              ))}
            </div>
            <input
              className="entrada entrada-busca"
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por apelido ou CAR"
              aria-label="Buscar imóvel"
            />
          </div>

          {visiveis.length === 0 ? (
            <p className="fonte-suave">Nenhum imóvel com esse filtro.</p>
          ) : (
            <ul className="carteira-grade">
              {visiveis.map((im) => {
                const status = STATUS_DO_VEREDITO[im.resultado.veredito];
                return (
                  <li key={im.id} className={`imovel-cartao b-${status}`}>
                    <div className="item-topo">
                      <h3>{im.apelido ?? 'Imóvel sem apelido'}</h3>
                      <span className={`selo s-${status}`}>
                        <IconeStatus status={status} />
                        {VEREDITO[im.resultado.veredito].titulo}
                      </span>
                    </div>
                    <p className="mono imovel-car">{formatarCar(im.codCar)}</p>
                    <p className="item-fonte">
                      Conferido em {dataBr(im.verificadoEm)}
                      {im.avisosNaoLidos > 0 && (
                        <strong className="novo"> · {contagem(im.avisosNaoLidos, 'mudança nova', 'mudanças novas')}</strong>
                      )}
                    </p>
                    <div className="acoes-imovel">
                      {im.ultimaConsultaId && (
                        <Link to={`/consulta/${im.ultimaConsultaId}`} className="l-link">
                          Ver resultado <Icone nome="seta" className="l-icone-p" />
                        </Link>
                      )}
                      {podeRemover && (
                        <button type="button" className="link-botao link-discreto" onClick={() => remover(im)}>
                          Deixar de acompanhar
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
