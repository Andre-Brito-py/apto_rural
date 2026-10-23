import { FONTES, formatarCar, type ResultadoItem } from '@apto/regras';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, type ConsultaSalva } from '../api';
import { CodigoQr } from '../componentes/CodigoQr';
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
    if (!consulta) api.consulta(id).then(setConsulta).catch((e: Error) => setErro(e.message));
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

  const r = consulta.resultado;
  const itens = r.itens.filter((i) => i.dossie && (i.status === 'impedimento' || i.status === 'atencao'));
  const linkConsulta = `${window.location.origin}/consulta/${consulta.id}`;

  return (
    <div className="pagina pilha dossie">
      <div className="botoes nao-imprimir">
        <button type="button" className="botao botao-primario" onClick={() => window.print()}>
          Imprimir ou salvar em PDF
        </button>
        <Link to={`/consulta/${consulta.id}`} className="botao botao-secundario">
          Voltar ao resultado
        </Link>
      </div>

      {consulta.demo && (
        <p className="alerta" style={{ background: '#fef3c7', borderColor: '#f2d27a' }}>
          Dossiê de <strong>demonstração com dados fictícios</strong>.
        </p>
      )}

      <header className="cartao dossie-cabecalho">
        <div className="pilha-p" style={{ flex: 1, minWidth: 0 }}>
          <p className="dossie-sobretitulo">Apto Rural · Dossiê do imóvel</p>
          <h1 className="titulo-pagina">Impedimentos socioambientais do crédito rural</h1>
          <dl className="dados">
            <dt>CAR</dt>
            <dd className="mono">{formatarCar(r.car)}</dd>
            <dt>Consulta</dt>
            <dd>{dataBr(r.dataReferencia)}</dd>
            <dt>Verificação</dt>
            <dd className="mono" style={{ fontSize: '0.8rem' }}>
              {consulta.id}
            </dd>
          </dl>
        </div>
        <div className="dossie-lateral">
          <CodigoQr texto={linkConsulta} />
          <span className="ajuda" style={{ textAlign: 'center', marginTop: 4 }}>
            Confira a consulta original
          </span>
        </div>
      </header>

      {consulta.geometria && (
        <section className="cartao imovel">
          <p>
            Contorno do imóvel usado na consulta. As imagens de satélite antes e depois de 31/07/2019 entram na próxima versão do dossiê.
          </p>
          <MapaImovel geometria={consulta.geometria} />
        </section>
      )}

      {itens.length === 0 ? (
        <p className="cartao">Nenhum item com impedimento ou atenção nesta consulta: não há dossiê a montar.</p>
      ) : (
        itens.map((item, n) => <SecaoDossie key={item.regraId} numero={n + 1} item={item} atualizacoes={r.atualizacoes} />)
      )}

      <section className="cartao pilha-p">
        <h2 className="secao-titulo">Observações do responsável técnico</h2>
        <textarea className="entrada nao-imprimir" rows={4} placeholder="Anotações para a proposta (não ficam salvas)." />
        <div className="so-impressao linhas-escrita" aria-hidden="true" />
        <div className="assinatura">
          <span>Responsável técnico (nome e registro profissional)</span>
          <span>Data e assinatura</span>
        </div>
      </section>

      <section className="avisos pilha-p">
        <p>
          Este dossiê organiza evidências de bases públicas para subsidiar a análise da instituição financeira. Não é laudo técnico, parecer
          jurídico nem garantia de aprovação. O laudo de sensoriamento remoto do MCR 2-9-18 &quot;d&quot; é de responsabilidade da instituição
          financeira.
        </p>
        {r.avisos.map((a) => (
          <p key={a}>{a}</p>
        ))}
      </section>
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
    <section className="cartao pilha-p dossie-secao">
      <div className="item-topo">
        <h2 className="secao-titulo">
          {numero}. {item.titulo} — {TITULO_DOSSIE[item.dossie!]}
        </h2>
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
