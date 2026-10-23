import { formatarCar } from '@apto/regras';
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, type Aviso, type ImovelCarteira } from '../api';
import { IconeStatus } from '../componentes/Icones';
import { useSessao } from '../sessao';
import { contagem, dataBr, ROTULO_STATUS, VEREDITO } from '../textos';

const STATUS_DO_VEREDITO = {
  impedimento: 'impedimento',
  atencao: 'atencao',
  sem_impedimento: 'sem_impedimento',
  incompleto: 'nao_verificado',
} as const;

/** Imóveis que o técnico acompanha. O sistema reconfere todos os dias. */
export function Carteira() {
  const { sessao, carregando } = useSessao();
  const [imoveis, setImoveis] = useState<ImovelCarteira[] | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [limite, setLimite] = useState(50);
  const [erro, setErro] = useState('');

  async function carregar() {
    try {
      const [c, a] = await Promise.all([api.carteira(), api.avisos()]);
      setImoveis(c.imoveis);
      setLimite(c.limite);
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
    <div className="pagina pilha">
      <div className="pilha-p">
        <h1 className="titulo-pagina">Minha carteira</h1>
        <p className="subtitulo">
          Reconferimos estes imóveis todos os dias com as bases oficiais. Se algo mudar, avisamos aqui e por e-mail.
        </p>
      </div>

      {erro && <p className="alerta alerta-erro">{erro}</p>}

      {naoLidos.length > 0 && (
        <section className="cartao pilha-p avisos-novos" aria-labelledby="titulo-avisos">
          <div className="item-topo">
            <h2 id="titulo-avisos" className="secao-titulo">
              {naoLidos.length === 1 ? '1 mudança nova' : `${naoLidos.length} mudanças novas`}
            </h2>
            <button type="button" className="link-botao" onClick={marcarLidos}>
              Marcar como vistas
            </button>
          </div>
          <ul className="lista-avisos">
            {naoLidos.map((a) => (
              <li key={a.id}>
                <strong>{a.apelido ?? formatarCar(a.codCar)}</strong> — {dataBr(a.criadoEm)}
                <ul className="lista-simples">
                  {a.alteracoes.map((x) => (
                    <li key={x.regraId} className={x.piorou ? 'piorou' : 'melhorou'}>
                      {x.titulo}: {ROTULO_STATUS[x.de]} → <strong>{ROTULO_STATUS[x.para]}</strong>
                    </li>
                  ))}
                </ul>
                {a.consultaId && <Link to={`/consulta/${a.consultaId}`}>Ver o resultado atualizado</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {imoveis && imoveis.length === 0 && (
        <div className="cartao pilha-p">
          <p>Sua carteira está vazia.</p>
          <p className="ajuda">
            Faça uma consulta e toque em <strong>Acompanhar este imóvel</strong> no resultado.
          </p>
          <Link to="/" className="botao botao-primario">
            Consultar um imóvel
          </Link>
        </div>
      )}

      {imoveis && imoveis.length > 0 && (
        <>
          <p className="ajuda">
            {imoveis.length} de {limite} imóveis acompanhados.
          </p>
          <ul className="itens">
            {imoveis.map((im) => {
              const status = STATUS_DO_VEREDITO[im.resultado.veredito];
              return (
                <li key={im.id} className={`item b-${status}`}>
                  <div className="item-topo">
                    <h3>{im.apelido ?? 'Imóvel sem apelido'}</h3>
                    <span className={`selo s-${status}`}>
                      <IconeStatus status={status} />
                      {VEREDITO[im.resultado.veredito].titulo}
                    </span>
                  </div>
                  <p className="mono" style={{ marginTop: 4 }}>
                    {formatarCar(im.codCar)}
                  </p>
                  <p className="item-fonte">
                    Conferido em {dataBr(im.verificadoEm)}
                    {im.avisosNaoLidos > 0 && <strong> · {contagem(im.avisosNaoLidos, 'mudança nova', 'mudanças novas')}</strong>}
                  </p>
                  <div className="acoes-imovel">
                    {im.ultimaConsultaId && <Link to={`/consulta/${im.ultimaConsultaId}`}>Ver resultado</Link>}
                    <button type="button" className="link-botao" onClick={() => remover(im)}>
                      Deixar de acompanhar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
