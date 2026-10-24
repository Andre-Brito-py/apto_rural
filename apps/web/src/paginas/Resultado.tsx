import { formatarCar, type Status } from '@apto/regras';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, type ConsultaSalva } from '../api';
import { IconeStatus } from '../componentes/Icones';
import { ItemResultado } from '../componentes/ItemResultado';
import { MapaEntorno } from '../componentes/MapaEntorno';
import { MapaImovel } from '../componentes/MapaImovel';
import { dataBr, PESO_STATUS, ROTULO_STATUS, VEREDITO } from '../textos';

const ICONE_VEREDITO: Record<string, Status> = {
  impedimento: 'impedimento',
  atencao: 'atencao',
  sem_impedimento: 'sem_impedimento',
  incompleto: 'nao_verificado',
};

function textoWhatsapp(c: ConsultaSalva): string {
  const r = c.resultado;
  const linhas = [
    `*Apto Rural* — pré-checagem do crédito rural`,
    `CAR ${formatarCar(r.car)}`,
    `Resultado: *${VEREDITO[r.veredito].titulo}*`,
    '',
    ...[...r.itens]
      .sort((a, b) => PESO_STATUS[a.status] - PESO_STATUS[b.status])
      .map((i) => `• ${i.titulo}: ${ROTULO_STATUS[i.status]}`),
    '',
    `Consulta de ${dataBr(r.dataReferencia)}: ${window.location.href}`,
    'Pré-checagem com bases públicas; não substitui a análise do banco.',
  ];
  return linhas.join('\n');
}

/** Coloca o imóvel na carteira, para ser reconferido todo dia. */
function Acompanhar({ consultaId }: { consultaId: string }) {
  const [apelido, setApelido] = useState('');
  const [estado, setEstado] = useState<'parado' | 'enviando' | 'ok'>('parado');
  const [erro, setErro] = useState('');

  async function acompanhar(ev: FormEvent) {
    ev.preventDefault();
    setEstado('enviando');
    setErro('');
    try {
      await api.acompanhar(consultaId, apelido || undefined);
      setEstado('ok');
    } catch (e) {
      setErro((e as Error).message);
      setEstado('parado');
    }
  }

  if (estado === 'ok') {
    return (
      <p className="cartao verificacao sim nao-imprimir">
        ✓ Imóvel na sua carteira. Vamos reconferir todo dia e avisar se algo mudar. <Link to="/carteira">Ver carteira</Link>
      </p>
    );
  }

  return (
    <form className="cartao pilha-p nao-imprimir" onSubmit={acompanhar}>
      <strong>Acompanhar este imóvel</strong>
      <p className="ajuda" style={{ marginTop: 0 }}>
        Reconferimos todo dia com as bases oficiais e avisamos por e-mail se surgir um embargo, mudar a situação do CAR ou chegar a data
        do Prodes.
      </p>
      <div className="linha-acompanhar">
        <input
          className="entrada"
          value={apelido}
          onChange={(e) => setApelido(e.target.value)}
          placeholder="Apelido (ex.: Fazenda Boa Vista)"
          maxLength={80}
          aria-label="Apelido do imóvel"
        />
        <button type="submit" className="botao botao-secundario" disabled={estado === 'enviando'}>
          {estado === 'enviando' ? 'Salvando…' : 'Acompanhar'}
        </button>
      </div>
      {erro && <p className="alerta alerta-erro">{erro}</p>}
    </form>
  );
}

export function Resultado() {
  const { id = '' } = useParams();
  const local = useLocation();
  const inicial = (local.state as ConsultaSalva | null)?.id === id ? (local.state as ConsultaSalva) : null;
  const [consulta, setConsulta] = useState<ConsultaSalva | null>(inicial);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (consulta) return;
    api.consulta(id).then(setConsulta).catch((e: Error) => setErro(e.message));
  }, [id, consulta]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  // Na impressão (PDF), todos os detalhes saem abertos.
  useEffect(() => {
    const abrir = () => document.querySelectorAll('details').forEach((d) => (d.open = true));
    window.addEventListener('beforeprint', abrir);
    return () => window.removeEventListener('beforeprint', abrir);
  }, []);

  const itens = useMemo(
    () => (consulta ? [...consulta.resultado.itens].sort((a, b) => PESO_STATUS[a.status] - PESO_STATUS[b.status]) : []),
    [consulta],
  );

  if (erro) {
    return (
      <div className="pagina pilha">
        <p className="alerta alerta-erro" role="alert">
          {erro}
        </p>
        <Link to="/">Fazer nova consulta</Link>
      </div>
    );
  }
  if (!consulta) {
    return (
      <div className="pagina" aria-busy="true">
        Carregando resultado…
      </div>
    );
  }

  const r = consulta.resultado;
  const v = VEREDITO[r.veredito];
  const contagem = (s: Status) => r.itens.filter((i) => i.status === s).length;
  const temDossie = r.itens.some((i) => i.dossie && i.status !== 'sem_impedimento');

  return (
    <div className="pagina pilha">
      <div className="topo-pagina nao-imprimir">
        <p className="sobretitulo">Resultado da consulta</p>
      </div>
      {consulta.demo && (
        <p className="alerta" style={{ background: '#fef3c7', borderColor: '#f2d27a' }}>
          Resultado de <strong>demonstração com dados fictícios</strong>.
        </p>
      )}

      <section className={`veredito v-${r.veredito}`} aria-live="polite">
        <IconeStatus status={ICONE_VEREDITO[r.veredito]!} className="veredito-icone" />
        <div className="pilha-p">
          <h1>{v.titulo}</h1>
          <p>{v.texto}</p>
          <p className="contagem">
            {(['impedimento', 'atencao', 'nao_verificado', 'sem_impedimento'] as Status[])
              .filter((s) => contagem(s) > 0)
              .map((s) => (
                <span key={s}>
                  {contagem(s)} {ROTULO_STATUS[s].toLowerCase()}
                </span>
              ))}
          </p>
        </div>
      </section>

      <section className="cartao imovel" aria-label="Imóvel consultado">
        <dl className="dados">
          <dt>CAR</dt>
          <dd style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '0.88rem' }}>{formatarCar(r.car)}</dd>
          <dt>Consulta</dt>
          <dd>{dataBr(r.dataReferencia)}</dd>
          <dt>Código</dt>
          <dd style={{ fontSize: '0.85rem' }}>{consulta.id}</dd>
        </dl>
        {consulta.geometria && !consulta.mapa && <MapaImovel geometria={consulta.geometria} />}
      </section>

      <div className="acoes-resultado nao-imprimir">
        <a
          className="botao botao-whatsapp"
          href={`https://wa.me/?text=${encodeURIComponent(textoWhatsapp(consulta))}`}
          target="_blank"
          rel="noreferrer"
        >
          Enviar no WhatsApp
        </a>
        <button type="button" className="botao botao-secundario" onClick={() => window.print()}>
          Salvar relatório em PDF
        </button>
        {temDossie && (consulta.dossieLiberado || consulta.minha) && (
          <Link to={`/consulta/${consulta.id}/dossie`} state={consulta} className="botao botao-secundario">
            {consulta.dossieLiberado ? 'Abrir dossiê do imóvel' : 'Gerar dossiê do imóvel'}
          </Link>
        )}
      </div>

      {consulta.minha && !consulta.demo && <Acompanhar consultaId={consulta.id} />}

      {consulta.geometria && consulta.mapa && (
        <section className="cartao" aria-label="Mapa do imóvel e do entorno">
          <MapaEntorno mapa={consulta.mapa} geometria={consulta.geometria} data={r.dataReferencia} />
        </section>
      )}

      <section className="pilha-p secao-itens" aria-labelledby="titulo-itens">
        <h2 id="titulo-itens" className="secao-titulo">
          Item por item do MCR 2-9
        </h2>
        <ul className="itens">
          {itens.map((i) => (
            <ItemResultado key={i.regraId} item={i} atualizacoes={r.atualizacoes} />
          ))}
        </ul>
      </section>

      <section className="avisos pilha-p">
        {r.avisos.map((a) => (
          <p key={a}>{a}</p>
        ))}
      </section>

      <p className="nao-imprimir">
        <Link to="/" className="botao botao-secundario" style={{ width: '100%' }}>
          Consultar outro imóvel
        </Link>
      </p>
    </div>
  );
}
