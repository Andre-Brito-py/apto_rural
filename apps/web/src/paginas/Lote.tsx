import { formatarCar, type ResultadoConsulta, type Status } from '@apto/regras';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ErroApi, type ConsultaSalva, type GeometriaImovel, type Saude } from '../api';
import { contornosDoArquivo, type ContornosDoArquivo } from '../arquivoImovel';
import { Icone } from '../componentes/Icones';
import { SeloStatus } from '../componentes/SeloStatus';
import { baixar, LIMITE_LOTE, lerPlanilha, montarCsv, MODELO_PLANILHA, textoDaPlanilha, type LeituraPlanilha, type LinhaLote } from '../planilhaLote';
import { useSessao } from '../sessao';
import { contagem, ROTULO_STATUS, VEREDITO } from '../textos';

/** Quantas consultas correm ao mesmo tempo: rápido para o técnico, leve para o servidor. */
const SIMULTANEAS = 3;

type Estado = 'fila' | 'consultando' | 'pronto' | 'erro';
interface Andamento {
  estado: Estado;
  consulta?: ConsultaSalva;
  erro?: string;
}

/** O veredito vira um dos quatro status, para o selo e as cores. */
const STATUS_VEREDITO: Record<ResultadoConsulta['veredito'], Status> = {
  impedimento: 'impedimento',
  atencao: 'atencao',
  incompleto: 'nao_verificado',
  sem_impedimento: 'sem_impedimento',
};

const ORDEM_STATUS: Status[] = ['impedimento', 'atencao', 'nao_verificado', 'sem_impedimento'];
const ROTULO_VEREDITO_CURTO: Record<Status, string> = {
  impedimento: 'Impedimento',
  atencao: 'Atenção',
  nao_verificado: 'Incompleto',
  sem_impedimento: 'Sem impedimento',
};

const pesa = (r: ResultadoConsulta, s: Status) =>
  r.itens
    .filter((i) => i.status === s)
    .map((i) => i.titulo)
    .join(', ');

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Lote({ saude }: { saude: Saude | null }) {
  const { sessao, atualizarSaldo } = useSessao();
  const [planilha, setPlanilha] = useState<{ nome: string; leitura: LeituraPlanilha }>();
  const [arquivos, setArquivos] = useState<ContornosDoArquivo[]>([]);
  const [lendo, setLendo] = useState<'' | 'planilha' | 'arquivos'>('');
  const [arrastando, setArrastando] = useState<'' | 'planilha' | 'arquivos'>('');
  const [erroPlanilha, setErroPlanilha] = useState('');
  const [andamento, setAndamento] = useState<Record<string, Andamento>>({});
  const [fase, setFase] = useState<'montando' | 'rodando' | 'parado' | 'fim'>('montando');
  const [aviso, setAviso] = useState<{ texto: string; status?: number } | null>(null);
  const [carteira, setCarteira] = useState<{ estado: 'parado' | 'enviando' | 'ok'; feitos: number; erro?: string }>({ estado: 'parado', feitos: 0 });
  const parar = useRef(false);

  // Sair da página com o lote rodando perderia só o que falta (o que já foi consultado fica salvo).
  useEffect(() => {
    if (fase !== 'rodando') return;
    const segurar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', segurar);
    return () => window.removeEventListener('beforeunload', segurar);
  }, [fase]);

  /** Contorno de cada CAR (o primeiro arquivo que trouxer aquele código). */
  const contornos = useMemo(() => {
    const mapa = new Map<string, { geometria: GeometriaImovel; arquivo: string }>();
    for (const a of arquivos) for (const [car, geometria] of a.porCar) if (!mapa.has(car)) mapa.set(car, { geometria, arquivo: a.nome });
    return mapa;
  }, [arquivos]);

  /** A lista final: as linhas da planilha e, depois, os imóveis que só vieram nos arquivos. */
  const linhas = useMemo<(LinhaLote & { soArquivo?: boolean })[]>(() => {
    const daPlanilha = planilha?.leitura.linhas ?? [];
    const naPlanilha = new Set(daPlanilha.map((l) => l.car));
    const extras = [...contornos.keys()].filter((car) => !naPlanilha.has(car)).map((car) => ({ linha: 0, car, soArquivo: true }));
    return [...daPlanilha, ...extras].slice(0, LIMITE_LOTE);
  }, [planilha, contornos]);

  const demo = new Set(Object.values(saude?.demo ?? {}));
  const reais = linhas.filter((l) => !demo.has(l.car)).length;
  const comContorno = linhas.filter((l) => contornos.has(l.car)).length;
  const saldo = sessao?.saldo.consulta ?? 0;
  const pendentes = linhas.filter((l) => andamento[l.car]?.estado !== 'pronto');
  const prontos = linhas.filter((l) => andamento[l.car]?.estado === 'pronto');
  const custo = pendentes.filter((l) => !demo.has(l.car)).length;
  const faltaConta = !sessao && reais > 0;
  const faltaCredito = !!sessao && custo > saldo;

  async function escolherPlanilha(arquivo: File | undefined) {
    if (!arquivo) return;
    setErroPlanilha('');
    setLendo('planilha');
    try {
      if (/\.xlsx?$/i.test(arquivo.name)) throw new Error('Planilha do Excel (.xlsx): salve como CSV antes (Arquivo › Salvar como › CSV).');
      const leitura = lerPlanilha(await textoDaPlanilha(arquivo));
      if (leitura.linhas.length === 0) throw new Error('Não achamos nenhum código do CAR válido na planilha.');
      setPlanilha({ nome: arquivo.name, leitura });
      setAndamento({});
      setFase('montando');
    } catch (e) {
      setErroPlanilha((e as Error).message);
    } finally {
      setLendo('');
    }
  }

  async function escolherArquivos(lista: FileList | null | undefined) {
    if (!lista?.length) return;
    setLendo('arquivos');
    const lidos: ContornosDoArquivo[] = [];
    for (const arquivo of Array.from(lista)) lidos.push(await contornosDoArquivo(arquivo));
    setArquivos((antes) => [...antes, ...lidos]);
    setLendo('');
  }

  function atualizar(car: string, a: Andamento) {
    setAndamento((antes) => ({ ...antes, [car]: a }));
  }

  /** Uma consulta, com nova tentativa se o servidor pedir para ir mais devagar (429). */
  async function consultarUm(l: LinhaLote): Promise<'ok' | 'sem_credito' | 'erro'> {
    atualizar(l.car, { estado: 'consultando' });
    for (let tentativa = 0; ; tentativa++) {
      try {
        const consulta = await api.consultar({
          car: l.car,
          situacaoCar: l.situacaoCar,
          modulosFiscais: l.modulosFiscais,
          geometria: contornos.get(l.car)?.geometria,
        });
        atualizar(l.car, { estado: 'pronto', consulta });
        return 'ok';
      } catch (e) {
        const err = e as ErroApi;
        if (err.status === 429 && tentativa < 5) {
          await espera(4000 * (tentativa + 1));
          continue;
        }
        if (err.status === 402) {
          atualizar(l.car, { estado: 'fila' });
          setAviso({ texto: err.message, status: 402 });
          return 'sem_credito';
        }
        atualizar(l.car, { estado: 'erro', erro: err.message });
        return 'erro';
      }
    }
  }

  async function rodar() {
    parar.current = false;
    setAviso(null);
    setFase('rodando');
    const fila = [...pendentes];
    for (const l of fila) atualizar(l.car, { estado: 'fila' });
    let semCredito = false;
    const trabalhador = async () => {
      while (!parar.current && !semCredito) {
        const l = fila.shift();
        if (!l) return;
        if ((await consultarUm(l)) === 'sem_credito') semCredito = true;
      }
    };
    await Promise.all(Array.from({ length: SIMULTANEAS }, trabalhador));
    if (sessao) await atualizarSaldo();
    setFase(fila.length > 0 || semCredito || parar.current ? 'parado' : 'fim');
  }

  async function acompanharTodos() {
    setCarteira({ estado: 'enviando', feitos: 0 });
    let feitos = 0;
    for (const l of prontos) {
      const c = andamento[l.car]!.consulta!;
      if (c.demo) continue;
      try {
        await api.acompanhar(c.id, l.apelido);
        feitos++;
        setCarteira({ estado: 'enviando', feitos });
      } catch (e) {
        setCarteira({ estado: 'parado', feitos, erro: (e as Error).message });
        return;
      }
    }
    setCarteira({ estado: 'ok', feitos });
  }

  function baixarResultado() {
    const cabecalho = ['CAR', 'Apelido', 'Resultado', 'Impedimentos', 'Atenção', 'Não verificado', 'Contorno', 'Link da consulta'];
    const corpo = linhas.map((l) => {
      const a = andamento[l.car];
      const r = a?.consulta?.resultado;
      return [
        formatarCar(l.car),
        l.apelido,
        r ? VEREDITO[r.veredito].titulo : a?.estado === 'erro' ? `Erro: ${a.erro}` : 'Não consultado',
        r ? pesa(r, 'impedimento') : '',
        r ? pesa(r, 'atencao') : '',
        r ? pesa(r, 'nao_verificado') : '',
        contornos.has(l.car) ? 'Sim' : 'Não',
        a?.consulta ? `${window.location.origin}/consulta/${a.consulta.id}` : '',
      ];
    });
    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    baixar(montarCsv([cabecalho, ...corpo]), `apto-rural-lote-${hoje}.csv`);
  }

  const contar = (s: Status) => prontos.filter((l) => STATUS_VEREDITO[andamento[l.car]!.consulta!.resultado.veredito] === s).length;
  const carsNosArquivos = [...contornos.keys()];
  const semLinha = carsNosArquivos.filter((car) => !planilha?.leitura.linhas.some((l) => l.car === car)).length;
  const errosArquivos = arquivos.filter((a) => a.erro);
  const travado = fase === 'rodando';

  const arrastar = (alvo: 'planilha' | 'arquivos') => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setArrastando(alvo);
    },
    onDragLeave: () => setArrastando(''),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setArrastando('');
      if (alvo === 'planilha') void escolherPlanilha(e.dataTransfer.files?.[0]);
      else void escolherArquivos(e.dataTransfer.files);
    },
  });

  return (
    <div className="pagina pagina-media pilha">
      <div className="topo-pagina">
        <p className="sobretitulo">Consulta em lote</p>
        <h1 className="titulo-pagina">Vários imóveis de uma vez</h1>
        <p className="subtitulo">
          Envie a planilha com os códigos do CAR e, se tiver, os arquivos dos contornos. Cada imóvel vira uma consulta completa, com
          resultado, mapa e código QR, como na consulta individual.
        </p>
      </div>

      <section className="cartao">
        <h2 className="form-secao">
          <span>1</span> Planilha com os imóveis
        </h2>
        <label className={`arquivo${arrastando === 'planilha' ? ' arquivo-arrastando' : ''}${planilha ? ' arquivo-ok' : ''}`} {...arrastar('planilha')}>
          <input type="file" accept=".csv,.txt,.xlsx,.xls" disabled={travado} onChange={(e) => escolherPlanilha(e.target.files?.[0])} />
          <span className="arquivo-icone" aria-hidden="true">
            <Icone nome={planilha ? 'check' : 'documento'} />
          </span>
          <span>
            <strong>
              {lendo === 'planilha'
                ? 'Lendo a planilha…'
                : planilha
                  ? `${planilha.nome}: ${contagem(planilha.leitura.linhas.length, 'imóvel', 'imóveis')}`
                  : 'Escolher ou arrastar a planilha (CSV)'}
            </strong>
            <br />
            <span className="ajuda" style={{ marginTop: 0 }}>
              {planilha ? 'Toque para trocar a planilha.' : `Uma linha por imóvel, até ${LIMITE_LOTE}. No Excel: Arquivo › Salvar como › CSV.`}
            </span>
          </span>
        </label>
        {erroPlanilha && <p className="erro-campo">{erroPlanilha}</p>}
        <div className="lote-ajuda">
          <p>
            <strong>Colunas:</strong> <code>car</code> (obrigatória) e, se quiser, <code>apelido</code>, <code>situacao_car</code> (ativo,
            pendente, suspenso ou cancelado, como no demonstrativo) e <code>modulos_fiscais</code>. Os nomes podem variar: &quot;Código do
            CAR&quot;, &quot;Nome da fazenda&quot;…
          </p>
          <button type="button" className="link-botao" onClick={() => baixar(new Blob(['﻿' + MODELO_PLANILHA], { type: 'text/csv' }), 'modelo-lote-apto-rural.csv')}>
            <Icone nome="documento" className="l-icone-p" /> Baixar planilha-modelo
          </button>
        </div>
        {planilha && planilha.leitura.problemas.length > 0 && (
          <details className="lote-problemas">
            <summary>{contagem(planilha.leitura.problemas.length, 'linha precisa de atenção', 'linhas precisam de atenção')}</summary>
            <ul>
              {planilha.leitura.problemas.map((p, i) => (
                <li key={i}>
                  <span className="mono">Linha {p.linha}</span> {p.texto}
                </li>
              ))}
            </ul>
          </details>
        )}

        <h2 className="form-secao">
          <span>2</span> Contornos dos imóveis <small className="fonte-suave">(opcional)</small>
        </h2>
        <label className={`arquivo${arrastando === 'arquivos' ? ' arquivo-arrastando' : ''}`} {...arrastar('arquivos')}>
          <input type="file" multiple accept=".zip,.kml,.geojson,.json" disabled={travado} onChange={(e) => escolherArquivos(e.target.files)} />
          <span className="arquivo-icone" aria-hidden="true">
            <Icone nome="mapa" />
          </span>
          <span>
            <strong>{lendo === 'arquivos' ? 'Lendo os arquivos…' : arquivos.length ? 'Adicionar mais arquivos' : 'Escolher ou arrastar os arquivos dos contornos'}</strong>
            <br />
            <span className="ajuda" style={{ marginTop: 0 }}>
              Shapefile (.zip), KML ou GeoJSON, vários de uma vez. Achamos o imóvel pelo código do CAR no nome do arquivo ou na tabela de
              atributos (como no .zip do Sicar). Sem contorno, a consulta checa só a lista do MMA.
            </span>
          </span>
        </label>
        {arquivos.length > 0 && (
          <div className="lote-arquivos">
            <p>
              <Icone nome="check" className="l-icone-p" /> {contagem(arquivos.length, 'arquivo lido', 'arquivos lidos')}:{' '}
              {contagem(carsNosArquivos.length, 'contorno encontrado', 'contornos encontrados')}
              {planilha && semLinha > 0 && `, ${contagem(semLinha, 'imóvel que não está', 'imóveis que não estão')} na planilha (incluídos na lista)`}.
            </p>
            {errosArquivos.length > 0 && (
              <ul className="lote-erros">
                {errosArquivos.map((a, i) => (
                  <li key={i}>
                    <strong>{a.nome}:</strong> {a.erro}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="link-botao" disabled={travado} onClick={() => setArquivos([])}>
              Tirar os arquivos
            </button>
          </div>
        )}
      </section>

      {linhas.length > 0 && (
        <section className="pilha-p" aria-labelledby="titulo-lista">
          <div className="lote-topo">
            <div>
              <h2 id="titulo-lista" className="secao-titulo">
                <span className="form-secao-num">3</span> Conferir e consultar
              </h2>
              <p className="fonte-suave lote-resumo">
                {contagem(linhas.length, 'imóvel', 'imóveis')} · {contagem(comContorno, 'com contorno', 'com contorno')}
                {linhas.length - comContorno > 0 && ` · ${linhas.length - comContorno} só pela lista do MMA`}
              </p>
            </div>
            {fase !== 'rodando' && pendentes.length > 0 && (
              <div className="lote-acao">
                <button type="button" className="botao botao-primario botao-auto" disabled={faltaConta || faltaCredito} onClick={rodar}>
                  {prontos.length ? `Continuar: ${contagem(pendentes.length, 'imóvel', 'imóveis')}` : `Consultar ${contagem(pendentes.length, 'imóvel', 'imóveis')}`}
                </button>
                <span className="fonte-suave lote-custo">
                  {custo === 0
                    ? 'Exemplos fictícios: grátis.'
                    : sessao
                      ? `Usa ${contagem(custo, 'crédito', 'créditos')} de consulta. ${sessao.equipe ? 'A equipe tem' : 'Você tem'} ${saldo}.`
                      : `Usa ${contagem(custo, 'crédito', 'créditos')} de consulta.`}
                </span>
              </div>
            )}
            {fase === 'rodando' && (
              <button type="button" className="botao botao-secundario botao-auto" onClick={() => (parar.current = true)}>
                Parar depois dos que estão em andamento
              </button>
            )}
          </div>

          {faltaConta && (
            <p className="alerta">
              Para consultar imóveis reais, <Link to="/entrar?modo=criar">crie sua conta</Link> ou <Link to="/entrar">entre</Link>.
            </p>
          )}
          {faltaCredito && fase !== 'rodando' && (
            <p className="alerta alerta-erro">
              Faltam {custo - saldo} créditos para este lote. <Link to="/planos">Ver planos</Link> ou tire algumas linhas da planilha.
            </p>
          )}
          {aviso && (
            <p className="alerta alerta-erro" role="alert">
              {aviso.texto} {aviso.status === 402 && <Link to="/planos">Ver planos</Link>}
            </p>
          )}

          {fase !== 'montando' && (
            <div className="cartao lote-progresso" aria-live="polite">
              <div className="lote-progresso-topo">
                <strong>
                  {fase === 'rodando'
                    ? `Consultando… ${prontos.length} de ${linhas.length}`
                    : fase === 'fim'
                      ? `Pronto: ${contagem(prontos.length, 'imóvel consultado', 'imóveis consultados')}`
                      : `Parado: ${prontos.length} de ${linhas.length} consultados`}
                </strong>
                {fase === 'rodando' && <span className="fonte-suave">Deixe esta página aberta até terminar. O que já foi consultado fica salvo.</span>}
              </div>
              <div className="distribuicao lote-barra" role="img" aria-label={ORDEM_STATUS.map((s) => `${contar(s)} ${ROTULO_VEREDITO_CURTO[s]}`).join(', ')}>
                {ORDEM_STATUS.filter((s) => contar(s) > 0).map((s) => (
                  <span key={s} className={`dist-${s}`} style={{ flexGrow: contar(s) }} />
                ))}
                {linhas.length > prontos.length && <span className="lote-barra-resto" style={{ flexGrow: linhas.length - prontos.length }} />}
              </div>
              <div className="legenda">
                {ORDEM_STATUS.map((s) => (
                  <span key={s} className="legenda-item" style={{ cursor: 'default' } as CSSProperties}>
                    <i className={`dist-${s}`} aria-hidden="true" />
                    <strong>{contar(s)}</strong> {ROTULO_VEREDITO_CURTO[s]}
                  </span>
                ))}
              </div>
              {prontos.length > 0 && fase !== 'rodando' && (
                <div className="lote-depois">
                  <button type="button" className="botao botao-secundario botao-auto" onClick={baixarResultado}>
                    <Icone nome="documento" className="l-icone-p" /> Baixar resultado (planilha)
                  </button>
                  {sessao && prontos.some((l) => !andamento[l.car]!.consulta!.demo) && (
                    <button
                      type="button"
                      className="botao botao-secundario botao-auto"
                      disabled={carteira.estado !== 'parado'}
                      onClick={acompanharTodos}
                    >
                      <Icone nome="sino" className="l-icone-p" />
                      {carteira.estado === 'ok'
                        ? `${contagem(carteira.feitos, 'imóvel', 'imóveis')} na carteira`
                        : carteira.estado === 'enviando'
                          ? `Incluindo… ${carteira.feitos}`
                          : 'Acompanhar todos na carteira'}
                    </button>
                  )}
                  {carteira.estado === 'ok' && <Link to="/carteira">Ver carteira</Link>}
                </div>
              )}
              {carteira.erro && <p className="alerta alerta-erro">{carteira.erro}</p>}
            </div>
          )}

          <div className="tabela-carteira" role="table" aria-label="Imóveis do lote">
            <div className="linha-carteira linha-lote linha-cabecalho" role="row">
              <span role="columnheader">Imóvel</span>
              <span role="columnheader">Contorno</span>
              <span role="columnheader">Resultado</span>
              <span role="columnheader">O que pesa</span>
              <span role="columnheader" aria-label="Ações" />
            </div>
            {linhas.map((l) => {
              const a = andamento[l.car];
              const r = a?.consulta?.resultado;
              const status = r ? STATUS_VEREDITO[r.veredito] : undefined;
              const contorno = contornos.get(l.car);
              return (
                <div key={l.car} className={`linha-carteira linha-lote${status ? ` b-${status}` : ''}`} role="row">
                  <span role="cell" className="col-imovel">
                    <span className="imovel-nome">
                      {l.apelido ?? (l.soArquivo ? 'Imóvel do arquivo' : `Linha ${l.linha}`)}
                      {demo.has(l.car) && <span className="etiqueta etiqueta-novo">exemplo</span>}
                    </span>
                    <span className="imovel-car mono" title={formatarCar(l.car)}>
                      <span className="uf">{l.car.slice(0, 2)}</span> {formatarCar(l.car)}
                    </span>
                  </span>
                  <span role="cell" className="col-contorno" title={contorno?.arquivo}>
                    {contorno ? (
                      <span className="lote-contorno-sim">
                        <Icone nome="check" className="l-icone-p" /> Contorno
                      </span>
                    ) : (
                      <span className="fonte-suave">Só lista do MMA</span>
                    )}
                  </span>
                  <span role="cell" className="col-situacao">
                    {status ? (
                      <SeloStatus status={status} />
                    ) : (
                      <span className={`lote-estado lote-${a?.estado ?? 'montando'}`}>
                        {a?.estado === 'consultando' ? 'Consultando…' : a?.estado === 'erro' ? 'Erro' : a?.estado === 'fila' ? 'Na fila' : '—'}
                      </span>
                    )}
                  </span>
                  <span role="cell" className="col-pontos" title={r ? pesa(r, 'impedimento') || pesa(r, 'atencao') : a?.erro}>
                    {r
                      ? pesa(r, 'impedimento') || pesa(r, 'atencao') || (status === 'nao_verificado' ? `${ROTULO_STATUS.nao_verificado}: ${pesa(r, 'nao_verificado')}` : 'Nada encontrado')
                      : (a?.erro ?? '')}
                  </span>
                  <span role="cell" className="col-acoes">
                    {a?.consulta && (
                      // Nova aba: o lote continua nesta página.
                      <a href={`/consulta/${a.consulta.id}`} target="_blank" rel="noreferrer" className="botao botao-secundario botao-pequeno">
                        Ver
                      </a>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
