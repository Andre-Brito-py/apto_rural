import { FONTES, formatarCar, type ResultadoItem } from '@apto/regras';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, ErroApi, type ConsultaSalva } from '../api';
import { useSessao } from '../sessao';
import { CodigoQr } from '../componentes/CodigoQr';
import { Icone } from '../componentes/Icones';
import { MapaImovel } from '../componentes/MapaImovel';
import { SeloStatus } from '../componentes/SeloStatus';
import { dataBr } from '../textos';

const TITULO_DOSSIE = {
  contestacao: 'Dossiê de contestação',
  plano_de_saida: 'Plano de saída',
} as const;

/**
 * Dossiê para o técnico levar ao banco: o que foi encontrado, a regra, as saídas
 * que a norma admite e o checklist de documentos. Organiza evidências; não é
 * laudo nem promessa de aprovação.
 */
export function Dossie() {
  const { id = '' } = useParams();
  const local = useLocation();
  const inicial = (local.state as ConsultaSalva | null)?.id === id ? (local.state as ConsultaSalva) : null;
  const [consulta, setConsulta] = useState<ConsultaSalva | null>(inicial);
  const [erro, setErro] = useState('');

  useEffect(() => {
    window.scrollTo(0, 0);
    if (!consulta)
      api
        .consulta(id)
        .then(setConsulta)
        .catch((e: Error) => setErro(e.message));
  }, [id, consulta]);

  if (erro) {
    return (
      <div className="pagina">
        <p className="alerta alerta-erro" role="alert">
          {erro}
        </p>
      </div>
    );
  }
  if (!consulta) return <div className="pagina">Carregando dossiê…</div>;
  if (!consulta.dossieLiberado)
    return <LiberarDossie consulta={consulta} aoLiberar={() => setConsulta({ ...consulta, dossieLiberado: true })} />;

  const r = consulta.resultado;
  const itens = r.itens.filter((i) => i.dossie && (i.status === 'impedimento' || i.status === 'atencao'));
  const linkConsulta = `${window.location.origin}/consulta/${consulta.id}`;

  return (
    <div className="dossie-pagina">
      <div className="dossie-barra nao-imprimir">
        <div className="dossie-barra-dentro">
          <Link to={`/consulta/${consulta.id}`} className="l-link">
            ← Voltar ao resultado
          </Link>
          <span className="fonte-suave dossie-barra-car mono">{formatarCar(r.car)}</span>
          <button type="button" className="botao botao-primario botao-auto" onClick={() => window.print()}>
            <Icone nome="documento" className="l-icone-p" />
            <span className="texto-largo">Imprimir ou salvar em PDF</span>
            <span className="texto-curto">Salvar PDF</span>
          </button>
        </div>
      </div>

      <div className="pagina dossie-moldura">
        {consulta.demo && (
          <p className="alerta nao-imprimir" style={{ background: '#fef3c7', borderColor: '#f2d27a' }}>
            Dossiê de <strong>demonstração com dados fictícios</strong>.
          </p>
        )}

        <article className="dossie-folha">
          <header className="dossie-cabecalho">
            <div className="dossie-marca">
              <img src="/icone.svg" alt="" />
              <span>Apto Rural</span>
              <span className="dossie-tipo">Dossiê do imóvel</span>
            </div>
            <div className="dossie-cabecalho-corpo">
              <div className="dossie-identificacao">
                <h1>Impedimentos socioambientais do crédito rural</h1>
                <p className="fonte-suave">Manual de Crédito Rural, Capítulo 2, Seção 9 (MCR 2-9)</p>
                <dl className="dossie-dados">
                  <div>
                    <dt>CAR</dt>
                    <dd className="mono">{formatarCar(r.car)}</dd>
                  </div>
                  <div>
                    <dt>Data da consulta</dt>
                    <dd>{dataBr(r.dataReferencia)}</dd>
                  </div>
                  <div>
                    <dt>Código de verificação</dt>
                    <dd className="mono">{consulta.id}</dd>
                  </div>
                </dl>
              </div>
              <div className="dossie-lateral">
                <CodigoQr texto={linkConsulta} />
                <span>Aponte a câmera para conferir a consulta original</span>
              </div>
            </div>
          </header>

          {(consulta.geometria || itens.length > 0) && (
            <section className="dossie-resumo">
              <div>
                <h2 className="dossie-h2">Resumo</h2>
                {itens.length === 0 ? (
                  <p>Nenhum item com impedimento ou atenção nesta consulta: não há dossiê a montar.</p>
                ) : (
                  <ol className="dossie-sumario">
                    {itens.map((item, n) => (
                      <li key={item.regraId}>
                        <span className="dossie-num">{n + 1}</span>
                        <span>
                          {item.titulo} <span className="fonte-suave">· {TITULO_DOSSIE[item.dossie!]}</span>
                        </span>
                        <SeloStatus status={item.status} />
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              {consulta.geometria && (
                <figure className="dossie-mapa">
                  <MapaImovel geometria={consulta.geometria} />
                  <figcaption>Contorno do imóvel usado na consulta.</figcaption>
                </figure>
              )}
            </section>
          )}

          {itens.map((item, n) => (
            <SecaoDossie key={item.regraId} numero={n + 1} item={item} atualizacoes={r.atualizacoes} />
          ))}

          <section className="dossie-secao dossie-assinatura-secao">
            <h2 className="dossie-h2">Observações do responsável técnico</h2>
            <textarea className="entrada nao-imprimir" rows={4} placeholder="Anotações para a proposta (não ficam salvas)." />
            <div className="so-impressao linhas-escrita" aria-hidden="true" />
            <div className="assinatura">
              <span>Responsável técnico (nome e registro profissional)</span>
              <span>Data e assinatura</span>
            </div>
          </section>

          <footer className="dossie-rodape">
            <p>
              Este dossiê organiza evidências de bases públicas para subsidiar a análise da instituição financeira. Não é laudo técnico,
              parecer jurídico nem garantia de aprovação. O laudo de sensoriamento remoto do MCR 2-9-18 &quot;d&quot; é de responsabilidade
              da instituição financeira.
            </p>
            {r.avisos.map((a) => (
              <p key={a}>{a}</p>
            ))}
          </footer>
        </article>
      </div>
    </div>
  );
}

function LiberarDossie({ consulta, aoLiberar }: { consulta: ConsultaSalva; aoLiberar: () => void }) {
  const { sessao, atualizarSaldo } = useSessao();
  const [erro, setErro] = useState<{ mensagem: string; status?: number } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function liberar() {
    setEnviando(true);
    setErro(null);
    try {
      const r = await api.liberarDossie(consulta.id);
      await atualizarSaldo(r.saldo);
      aoLiberar();
    } catch (e) {
      setErro({ mensagem: (e as ErroApi).message, status: (e as ErroApi).status });
      setEnviando(false);
    }
  }

  return (
    <div className="pagina pilha" style={{ maxWidth: 620 }}>
      <div className="topo-pagina">
        <p className="sobretitulo">Do vermelho ao verde</p>
        <h1 className="titulo-pagina">Dossiê do imóvel</h1>
        <p className="mono fonte-suave">{formatarCar(consulta.resultado.car)}</p>
      </div>
      <div className="cartao pilha-p">
        {consulta.minha ? (
          <>
            <p>O dossiê é o documento para levar ao banco quando a consulta dá impedimento ou atenção. Ele reúne:</p>
            <ul className="dossie-inclui">
              <li>
                <span className="l-icone-caixa">
                  <Icone nome="busca" />
                </span>
                <span>
                  <strong>O que foi encontrado</strong>, com a base oficial, a data e a norma de cada item.
                </span>
              </li>
              <li>
                <span className="l-icone-caixa">
                  <Icone nome="caminho" />
                </span>
                <span>
                  <strong>As saídas que a própria norma admite</strong>, com o que já conferimos para este imóvel.
                </span>
              </li>
              <li>
                <span className="l-icone-caixa">
                  <Icone nome="documento" />
                </span>
                <span>
                  <strong>O checklist de documentos</strong> e o código QR para o gerente conferir a consulta original.
                </span>
              </li>
            </ul>
            <p className="credito-aviso">
              Gerar o dossiê usa <strong>1 crédito de dossiê</strong>
              {sessao ? `; ${sessao.equipe ? 'a equipe tem' : 'você tem'} ${sessao.saldo.dossie}.` : '.'}
            </p>
            {erro && (
              <p className="alerta alerta-erro" role="alert">
                {erro.mensagem} {erro.status === 402 && <Link to="/planos">Ver planos</Link>}
              </p>
            )}
            <button type="button" className="botao botao-primario" onClick={liberar} disabled={enviando}>
              {enviando ? 'Gerando…' : 'Gerar dossiê (1 crédito)'}
            </button>
          </>
        ) : (
          <p>Só quem fez a consulta (ou a equipe dessa pessoa) pode gerar o dossiê deste imóvel.</p>
        )}
        <Link to={`/consulta/${consulta.id}`} className="l-link">
          ← Voltar ao resultado
        </Link>
      </div>
    </div>
  );
}

function SecaoDossie({
  numero,
  item,
  atualizacoes,
}: {
  numero: number;
  item: ResultadoItem;
  atualizacoes: ConsultaSalva['resultado']['atualizacoes'];
}) {
  return (
    <section className="dossie-secao">
      <div className="dossie-secao-topo">
        <span className="dossie-num dossie-num-grande">{numero}</span>
        <div>
          <h2 className="dossie-h2">{item.titulo}</h2>
          <span className="fonte-suave">{TITULO_DOSSIE[item.dossie!]}</span>
        </div>
        <SeloStatus status={item.status} />
      </div>

      <h3 className="dossie-sub">O que foi encontrado</h3>
      <p>{item.resumo}</p>
      {item.detalhes.length > 0 && (
        <ul className="lista-simples">
          {item.detalhes.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
      <p className="item-fonte">
        Base:{' '}
        {item.fontes
          .map((f) => `${FONTES[f].nome} (${FONTES[f].orgao}${atualizacoes[f] ? `, atualizada em ${dataBr(atualizacoes[f])}` : ''})`)
          .join('; ')}
        . Norma: {item.normas.map((n) => `${n.item} (${n.ato})`).join('; ')}.
      </p>

      {item.caminhos.length > 0 && (
        <>
          <h3 className="dossie-sub">Saídas que a norma admite e o que juntar</h3>
          <ol className="caminhos-dossie">
            {item.caminhos.map((c) => (
              <li key={c.titulo}>
                {(c.requisitos ?? []).length > 0 ? (
                  <strong>{c.titulo}</strong>
                ) : (
                  <label className="marcar" style={{ display: 'inline-flex', minHeight: 0, paddingTop: 0 }}>
                    <input type="checkbox" />
                    <strong>{c.titulo}</strong>
                  </label>
                )}
                {c.norma && <span className="fonte-suave"> — {c.norma.item}</span>}
                <p>{c.descricao}</p>
                {c.verificacao && (
                  <p className={`verificacao ${c.verificacao.atende === true ? 'sim' : c.verificacao.atende === false ? 'nao' : 'talvez'}`}>
                    {c.verificacao.texto}
                  </p>
                )}
                {(c.requisitos ?? []).length > 0 && (
                  <ul className="checklist">
                    {c.requisitos!.map((req) => (
                      <li key={req}>
                        <label className="marcar">
                          <input type="checkbox" />
                          <span>{req}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
