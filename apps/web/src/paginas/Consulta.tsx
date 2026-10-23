import { normalizarCar, type SituacaoCar } from '@apto/regras';
import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ErroApi, type GeometriaImovel, type Saude } from '../api';
import { lerArquivoImovel } from '../arquivoImovel';
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
  const [geometria, setGeometria] = useState<GeometriaImovel>();
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [documento, setDocumento] = useState('');
  const [consentimento, setConsentimento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<Erro | null>(null);

  async function escolherArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    try {
      setGeometria(await lerArquivoImovel(arquivo));
      setNomeArquivo(arquivo.name);
    } catch (e) {
      setGeometria(undefined);
      setNomeArquivo('');
      setErro({ mensagem: (e as Error).message, campo: 'geometria' });
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
      <div className="pilha-p">
        <h1 className="titulo-pagina">O imóvel passa no crédito rural?</h1>
        <p className="subtitulo">
          Checamos os impedimentos socioambientais do Manual de Crédito Rural (MCR 2-9) nas mesmas bases públicas que o banco usa.
        </p>
      </div>

      {saude?.demo && (
        <div className="cartao pilha-p nao-imprimir">
          <strong>Testar com um exemplo fictício</strong>
          <div className="botoes">
            {Object.entries(saude.demo).map(([chave, codigo]) => (
              <button key={chave} type="button" className="botao botao-secundario" onClick={() => setCar(codigo)}>
                {EXEMPLOS[chave] ?? chave}
              </button>
            ))}
          </div>
        </div>
      )}

      <form className="cartao" onSubmit={enviar} noValidate>
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
            placeholder="Ex.: 8,5"
            style={{ maxWidth: 200 }}
            {...invalido('modulosFiscais')}
          />
          <span className="ajuda">Define a data em que a checagem do Prodes passa a valer para este imóvel.</span>
          {erroDe('modulosFiscais')}
        </label>

        <div className="campo">
          <span className="rotulo" id={`${id}-arq`}>
            Contorno do imóvel
          </span>
          <label className={`arquivo${geometria ? ' arquivo-ok' : ''}`} aria-labelledby={`${id}-arq`}>
            <input type="file" accept=".kml,.geojson,.json" onChange={(e) => escolherArquivo(e.target.files?.[0])} />
            <span aria-hidden="true" style={{ fontSize: 28 }}>
              {geometria ? '✓' : '⇪'}
            </span>
            <span>
              <strong>{geometria ? nomeArquivo : 'Escolher arquivo KML ou GeoJSON'}</strong>
              <br />
              <span className="ajuda" style={{ marginTop: 0 }}>
                {geometria ? 'Toque para trocar.' : 'Sem o arquivo, checamos só a lista do MMA.'}
              </span>
            </span>
          </label>
          {erroDe('geometria')}
        </div>

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

        <p className="ajuda" style={{ marginTop: 20 }}>
          {sessao
            ? `Esta consulta usa 1 crédito. Você tem ${sessao.saldo.consulta}.`
            : 'Para consultar um imóvel real, crie sua conta: a primeira consulta é grátis.'}
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
