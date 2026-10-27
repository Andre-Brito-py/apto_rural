import { normalizarCar, type SituacaoCar } from '@apto/regras';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ErroApi, type GeometriaImovel, type Saude } from '../api';
import { lerArquivoImovel, type ImovelLido } from '../arquivoImovel';
import { MapaImovel } from '../componentes/MapaImovel';
import { numeroBr } from '../textos';
import { Icone } from '../componentes/Icones';
import { useSessao } from '../sessao';

const SITUACOES: { valor: SituacaoCar | 'nao_sei'; rotulo: string }[] = [
  { valor: 'ativo', rotulo: 'Ativo' },
  { valor: 'pendente', rotulo: 'Pendente' },
  { valor: 'suspenso', rotulo: 'Suspenso' },
  { valor: 'cancelado', rotulo: 'Cancelado' },
  { valor: 'nao_sei', rotulo: 'Não sei' },
];

const EXEMPLOS: Record<string, string> = {
  embargoEProdes: 'Embargo + Prodes',
  limpo: 'Sem impedimento',
  bordaTerraIndigena: 'Borda de terra indígena',
};

interface Erro {
  mensagem: string;
  campo?: string;
  status?: number;
}

export function Consulta({ saude }: { saude: Saude | null }) {
  const navegar = useNavigate();
  const id = useId();
  const { sessao, atualizarSaldo } = useSessao();
  const [car, setCar] = useState('');
  const [situacao, setSituacao] = useState<SituacaoCar | 'nao_sei'>('nao_sei');
  const [modulos, setModulos] = useState('');
  const [usoColetivo, setUsoColetivo] = useState(false);
  const [lido, setLido] = useState<ImovelLido>();
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [lendo, setLendo] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const geometria: GeometriaImovel | undefined = lido?.geometria;
  const [documento, setDocumento] = useState('');
  const [consentimento, setConsentimento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<Erro | null>(null);
  const [mfMunicipio, setMfMunicipio] = useState<{ chave: string; municipio: string; ha: number } | null>(null);

  // Módulo fiscal do município (tabela do Incra), pelo código do município que está no CAR.
  const codigoCar = normalizarCar(car);
  const chaveMunicipio = codigoCar?.slice(0, 10) ?? '';
  useEffect(() => {
    if (!codigoCar || mfMunicipio?.chave === chaveMunicipio) return;
    let vivo = true;
    api
      .moduloFiscal(codigoCar)
      .then(
        (r) =>
          vivo && setMfMunicipio(r.municipio && r.moduloFiscalHa ? { chave: chaveMunicipio, municipio: r.municipio, ha: r.moduloFiscalHa } : null),
      )
      .catch(() => vivo && setMfMunicipio(null));
    return () => {
      vivo = false;
    };
  }, [codigoCar, chaveMunicipio, mfMunicipio?.chave]);
  const mfDoMunicipio = mfMunicipio?.chave === chaveMunicipio ? mfMunicipio : null;
  const estimativaMf = mfDoMunicipio && lido ? lido.areaHa / mfDoMunicipio.ha : undefined;

  async function escolherArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setLendo(true);
    try {
      setLido(await lerArquivoImovel(arquivo));
      setNomeArquivo(arquivo.name);
    } catch (e) {
      setLido(undefined);
      setNomeArquivo('');
      setErro({ mensagem: (e as Error).message, campo: 'geometria' });
    } finally {
      setLendo(false);
    }
  }

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    const codigo = normalizarCar(car);
    if (!codigo) {
      setErro({ campo: 'car', mensagem: 'Confira o código: ele tem a UF, o código do município e 32 letras e números.' });
      return;
    }
    const mf = modulos.trim() ? Number(modulos.replace(',', '.')) : undefined;
    if (mf !== undefined && !(mf > 0)) {
      setErro({ campo: 'modulosFiscais', mensagem: 'Informe um número maior que zero.' });
      return;
    }
    if (documento.trim() && !consentimento) {
      setErro({ campo: 'consentimentoDocumento', mensagem: 'Marque a autorização do produtor para consultar o CPF/CNPJ.' });
      return;
    }
    setEnviando(true);
    try {
      const salva = await api.consultar({
        car: codigo,
        situacaoCar: situacao === 'nao_sei' ? undefined : situacao,
        modulosFiscais: mf,
        usoColetivo: usoColetivo || undefined,
        geometria,
        documento: documento.trim() || undefined,
        consentimentoDocumento: documento.trim() ? consentimento : undefined,
      });
      if (!salva.demo) await atualizarSaldo();
      navegar(`/consulta/${salva.id}`, { state: salva });
    } catch (e) {
      const err = e as ErroApi;
      setErro({ mensagem: err.message, campo: err.campo, status: err.status });
      setEnviando(false);
    }
  }

  const erroDe = (campo: string) =>
    erro?.campo === campo ? (
      <span className="erro-campo" id={`${id}-${campo}-erro`}>
        {erro.mensagem}
      </span>
    ) : null;
  const invalido = (campo: string) =>
    erro?.campo === campo ? { 'aria-invalid': true, 'aria-describedby': `${id}-${campo}-erro` } : {};

  return (
    <div className="pagina pilha">
      <div className="topo-pagina">
        <p className="sobretitulo">Nova consulta</p>
        <h1 className="titulo-pagina">O imóvel passa no crédito rural?</h1>
        <p className="subtitulo">
          Checamos os impedimentos socioambientais do Manual de Crédito Rural (MCR 2-9) nas mesmas bases públicas que o banco usa.
        </p>
        <Link to="/lote" className="l-link consulta-lote-link">
          <Icone nome="camadas" className="l-icone-p" /> Muitos imóveis? Consulte em lote, com uma planilha
        </Link>
      </div>

      {saude?.demo && (
        <div className="exemplos nao-imprimir">
          <span className="fonte-suave">Testar com um exemplo fictício:</span>
          {Object.entries(saude.demo).map(([chave, codigo]) => (
            <button key={chave} type="button" className={`chip${car === codigo ? ' chip-ativo' : ''}`} onClick={() => setCar(codigo)}>
              {EXEMPLOS[chave] ?? chave}
            </button>
          ))}
        </div>
      )}

      <form className="cartao" onSubmit={enviar} noValidate>
        <h2 className="form-secao">
          <span>1</span> Dados do imóvel
        </h2>
        <label className="campo">
          <span className="rotulo">Código do CAR</span>
          <input
            className="entrada entrada-car"
            value={car}
            onChange={(e) => setCar(e.target.value)}
            placeholder="MT-5107925-1A2B.3C4D.…"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            {...invalido('car')}
          />
          <span className="ajuda">Está no recibo de inscrição do CAR. Pode colar com ou sem os pontos.</span>
          {erroDe('car')}
        </label>

        <fieldset className="campo" style={{ border: 0, padding: 0, margin: '20px 0 0' }}>
          <legend className="rotulo">Situação do CAR no demonstrativo</legend>
          <div className="opcoes" role="radiogroup">
            {SITUACOES.map((s) => (
              <label key={s.valor} className="opcao">
                <input type="radio" name="situacao" value={s.valor} checked={situacao === s.valor} onChange={() => setSituacao(s.valor)} />
                <span>{s.rotulo}</span>
              </label>
            ))}
          </div>
          <span className="ajuda">Consulte o demonstrativo em consultapublica.car.gov.br.</span>
        </fieldset>

        <label className="campo">
          <span className="rotulo">Módulos fiscais do imóvel</span>
          <input
            className="entrada"
            inputMode="decimal"
            value={modulos}
            onChange={(e) => setModulos(e.target.value)}
            placeholder={estimativaMf != null ? `Estimativa: ${numeroBr(estimativaMf, 2)}` : 'Ex.: 8,5'}
            style={{ maxWidth: 220 }}
            {...invalido('modulosFiscais')}
          />
          <span className="ajuda">Define a data em que a checagem do Prodes passa a valer para este imóvel.</span>
          {mfDoMunicipio && (
            <span className="estimativa-mf" aria-live="polite">
              <Icone nome="camadas" className="l-icone-p" />
              {estimativaMf != null ? (
                <span>
                  <strong>Estimativa: {numeroBr(estimativaMf, 2)} módulos fiscais</strong> ({numeroBr(lido!.areaHa, 0)} ha do contorno ÷{' '}
                  {numeroBr(mfDoMunicipio.ha, 0)} ha, o módulo fiscal de {mfDoMunicipio.municipio} na tabela do Incra). Deixe em branco para
                  usar a estimativa, ou digite o número que está no CAR.
                </span>
              ) : (
                <span>
                  Módulo fiscal de {mfDoMunicipio.municipio}: <strong>{numeroBr(mfDoMunicipio.ha, 0)} ha</strong> (Incra). Com o arquivo do
                  imóvel, calculamos os módulos fiscais sozinhos.
                </span>
              )}
            </span>
          )}
          {erroDe('modulosFiscais')}
        </label>

        <h2 className="form-secao">
          <span>2</span> Mapa do imóvel
        </h2>
        <div className="campo">
          <span className="rotulo" id={`${id}-arq`}>
            Contorno do imóvel
          </span>
          {lido ? (
            // Prévia do que foi lido: o técnico confere o desenho e a área antes de gastar a consulta.
            <div className="arquivo-lido">
              <div className="arquivo-lido-mapa">
                <MapaImovel geometria={lido.geometria} />
              </div>
              <div className="arquivo-lido-info">
                <span className="arquivo-lido-titulo">
                  <Icone nome="check" className="l-icone-p" /> Contorno lido
                </span>
                <strong className="arquivo-lido-nome" title={nomeArquivo}>
                  {nomeArquivo}
                </strong>
                <dl className="arquivo-lido-dados">
                  <div>
                    <dt>Área aproximada</dt>
                    <dd>{numeroBr(lido.areaHa, lido.areaHa < 100 ? 1 : 0)} ha</dd>
                  </div>
                  <div>
                    <dt>Formato</dt>
                    <dd>
                      {lido.formato}
                      {lido.camada ? ` · ${lido.camada}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Polígonos</dt>
                    <dd>{lido.poligonos}</dd>
                  </div>
                </dl>
                <span className="ajuda" style={{ marginTop: 0 }}>
                  A área é uma conta do navegador, só para conferir o arquivo; a oficial é a do CAR.
                </span>
                <label className="botao botao-secundario botao-pequeno arquivo-trocar">
                  <input type="file" accept=".zip,.kml,.geojson,.json" onChange={(e) => escolherArquivo(e.target.files?.[0])} />
                  Trocar arquivo
                </label>
              </div>
            </div>
          ) : (
            <label
              className={`arquivo${arrastando ? ' arquivo-arrastando' : ''}`}
              aria-labelledby={`${id}-arq`}
              onDragOver={(e) => {
                e.preventDefault();
                setArrastando(true);
              }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastando(false);
                void escolherArquivo(e.dataTransfer.files?.[0]);
              }}
            >
              <input type="file" accept=".zip,.kml,.geojson,.json" onChange={(e) => escolherArquivo(e.target.files?.[0])} disabled={lendo} />
              <span className="arquivo-icone" aria-hidden="true">
                <Icone nome="mapa" />
              </span>
              <span>
                <strong>{lendo ? 'Lendo o arquivo…' : 'Escolher ou arrastar o arquivo do imóvel'}</strong>
                <br />
                <span className="ajuda" style={{ marginTop: 0 }}>
                  Shapefile (.zip), KML ou GeoJSON, como sai do CAR. Sem o arquivo, checamos só a lista do MMA.
                </span>
              </span>
            </label>
          )}
          {erroDe('geometria')}
        </div>

        <h2 className="form-secao">
          <span>3</span> Opcional
        </h2>
        <label className="marcar campo">
          <input type="checkbox" checked={usoColetivo} onChange={(e) => setUsoColetivo(e.target.checked)} />
          <span>CAR de perímetro coletivo (assentamento ou comunidade tradicional)</span>
        </label>

        <details className="extra campo">
          <summary>Checar o produtor no cadastro do Ministério do Trabalho</summary>
          <label className="campo">
            <span className="rotulo">CPF ou CNPJ do produtor</span>
            <input
              className="entrada"
              inputMode="numeric"
              autoComplete="off"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              style={{ maxWidth: 260 }}
              {...invalido('documento')}
            />
            {erroDe('documento')}
          </label>
          <label className="marcar">
            <input type="checkbox" checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} {...invalido('consentimentoDocumento')} />
            <span>O produtor autorizou esta consulta. O número não fica salvo: guardamos só um código irreversível.</span>
          </label>
          {erroDe('consentimentoDocumento')}
        </details>

        {erro && !['car', 'modulosFiscais', 'geometria', 'documento', 'consentimentoDocumento'].includes(erro.campo ?? '') && (
          <p className="alerta alerta-erro" role="alert" style={{ marginTop: 20 }}>
            {erro.mensagem}{' '}
            {erro.status === 401 && <Link to="/entrar?modo=criar">Criar conta grátis</Link>}
            {erro.status === 402 && <Link to="/planos">Ver planos</Link>}
          </p>
        )}

        <p className="ajuda credito-aviso" style={{ marginTop: 24 }}>
          {!sessao
            ? 'Para consultar um imóvel real, crie sua conta: a primeira consulta é grátis.'
            : !sessao.usuario.emailConfirmado && sessao.saldo.consulta === 0
              ? 'Confirme seu e-mail para liberar a consulta grátis (veja o link que enviamos).'
              : `Esta consulta usa 1 crédito. Você tem ${sessao.saldo.consulta}.`}
        </p>

        <div style={{ marginTop: 12 }}>
          <button className="botao botao-primario" type="submit" disabled={enviando}>
            {enviando ? 'Consultando as bases…' : 'Consultar imóvel'}
          </button>
        </div>
      </form>
    </div>
  );
}
