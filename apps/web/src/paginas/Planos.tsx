import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Assinatura, type Catalogo, type Plano, type PrecoCupom, type Produto, type Saldo } from '../api';
import { Icone } from '../componentes/Icones';
import { useSessao } from '../sessao';
import { contagem, dataBr } from '../textos';

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "Nas 3 primeiras mensalidades; depois, R$ 199,00/mês." */
function precoDepois(p: Extract<PrecoCupom, { valido: true }>, cheio: number) {
  if (p.meses == null) return `${p.texto}.`;
  return `${p.texto}; depois, ${reais(cheio)}/mês.`;
}

const SITUACAO: Record<Assinatura['status'], string> = {
  pendente: 'Aguardando o primeiro pagamento',
  ativa: 'Ativa',
  inadimplente: 'Mensalidade em atraso',
  cancelada: 'Cancelada',
};

/** Escolha do que comprar: assinatura mensal (principal) ou compra avulsa. */
export function Planos() {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [documento, setDocumento] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Na equipe, só o responsável compra e assina; os outros só veem.
  const [podePagar, setPodePagar] = useState(true);
  const { sessao, atualizarSaldo } = useSessao();
  const navegar = useNavigate();
  // Cupom: digitado aqui ou vindo no link de divulgação (/planos?cupom=BEMVINDO).
  const [parametros, setParametros] = useSearchParams();
  const [codigo, setCodigo] = useState(parametros.get('cupom') ?? '');
  const [cupom, setCupom] = useState<{ codigo: string; precos: Record<string, PrecoCupom> } | null>(null);
  const [erroCupom, setErroCupom] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [sucesso, setSucesso] = useState('');
  // O que já foi conferido (código + conta): evita conferir de novo só porque o endereço mudou.
  const conferido = useRef('');

  useEffect(() => {
    api.planos().then((r) => setPlanos(r.planos)).catch(() => undefined);
    api.produtos().then(setCatalogo).catch((e: Error) => setErro(e.message));
  }, []);

  async function aplicarCupom(texto: string) {
    setErroCupom('');
    setCupom(null);
    if (!texto.trim()) return;
    setAplicando(true);
    try {
      const r = await api.validarCupom(texto);
      conferido.current = `${r.codigo}|${sessao?.usuario.id ?? ''}`;
      setCupom({ codigo: r.codigo, precos: Object.fromEntries(r.itens.map((i) => [i.id, i])) });
      setCodigo(r.codigo);
      setParametros({ cupom: r.codigo }, { replace: true });
    } catch (e) {
      setErroCupom((e as Error).message);
    } finally {
      setAplicando(false);
    }
  }

  // O link já traz o cupom: confere assim que a página abre (e de novo depois de entrar na conta).
  const doLink = parametros.get('cupom');
  useEffect(() => {
    if (doLink && conferido.current !== `${doLink.toUpperCase()}|${sessao?.usuario.id ?? ''}`) void aplicarCupom(doLink);
  }, [doLink, sessao?.usuario.id]);

  function tirarCupom() {
    setCupom(null);
    setCodigo('');
    setErroCupom('');
    setParametros({}, { replace: true });
  }

  /** Preço com o cupom, se ele vale neste plano ou produto. */
  const comCupom = (id: string) => {
    const p = cupom?.precos[id];
    return p?.valido ? p : null;
  };
  const cupomDe = (id: string) => (comCupom(id) ? cupom!.codigo : undefined);

  useEffect(() => {
    if (sessao)
      api
        .assinatura()
        .then((r) => {
          setAssinatura(r.assinatura);
          setPodePagar(r.podePagar);
        })
        .catch(() => undefined);
  }, [sessao]);

  const exigeDocumento = catalogo?.exigeDocumento ?? false;

  /** Primeiro toque escolhe (e pede CPF/CNPJ, se preciso); o segundo vai ao pagamento. */
  async function seguir(chave: string, acao: () => Promise<{ link?: string; gratis?: boolean; saldo?: Saldo }>, gratis = false) {
    if (!sessao) {
      // Volta para os planos com o cupom já aplicado.
      navegar(`/entrar?modo=criar&voltar=${encodeURIComponent(cupom ? `/planos?cupom=${cupom.codigo}` : '/planos')}`);
      return;
    }
    // Compra que o cupom deixa de graça não tem cobrança: não precisa de CPF/CNPJ.
    if (exigeDocumento && !gratis && escolhido !== chave) {
      setEscolhido(chave);
      return;
    }
    setErro('');
    setSucesso('');
    setEnviando(true);
    try {
      const r = await acao();
      if (r.gratis) {
        if (r.saldo) await atualizarSaldo(r.saldo);
        setSucesso(`Pronto! Com o cupom ${cupom?.codigo ?? ''}, a compra saiu de graça e os créditos já estão na sua conta.`);
        setEnviando(false);
        // Confere o cupom de novo: se era de um uso só, a página já mostra que foi usado.
        if (cupom) void aplicarCupom(cupom.codigo);
        return;
      }
      window.location.assign(r.link!);
    } catch (e) {
      setErro((e as Error).message);
      setEnviando(false);
    }
  }

  async function cancelar() {
    if (!window.confirm('Cancelar a assinatura? As próximas mensalidades não serão cobradas e os créditos que você já tem continuam seus.')) return;
    try {
      await api.cancelarAssinatura();
      setAssinatura(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const campoDocumento = (chave: string) =>
    escolhido === chave && exigeDocumento ? (
      <label className="campo" style={{ marginTop: 12 }}>
        <span className="rotulo">CPF ou CNPJ para a cobrança</span>
        <input className="entrada" inputMode="numeric" value={documento} onChange={(e) => setDocumento(e.target.value)} />
        <span className="ajuda">Vai direto para o meio de pagamento; não guardamos este número.</span>
      </label>
    ) : null;

  return (
    <div className="pagina pagina-media pilha">
      <div className="topo-pagina topo-centro">
        <p className="sobretitulo">Planos</p>
        <h1 className="titulo-pagina">Escolha como quer usar o Apto Rural</h1>
        <p className="subtitulo">Assine e receba créditos todo mês, com a carteira de fazendas inclusa. Pix, cartão ou boleto.</p>
      </div>

      {catalogo?.simulado && (
        <p className="alerta" style={{ background: '#fef3c7', borderColor: '#f2d27a' }}>
          Pagamento <strong>simulado</strong> (desenvolvimento): nenhuma cobrança real é feita.
        </p>
      )}
      {erro && (
        <p className="alerta alerta-erro" role="alert">
          {erro}
        </p>
      )}
      {sucesso && (
        <p className="alerta alerta-ok" role="status">
          {sucesso}
        </p>
      )}

      <form className="cartao cupom-caixa" onSubmit={(ev: FormEvent) => (ev.preventDefault(), void aplicarCupom(codigo))}>
        {cupom ? (
          <p className="cupom-aplicado">
            <Icone nome="check" className="l-icone-p" /> Cupom <strong className="mono">{cupom.codigo}</strong> aplicado: os preços abaixo já
            estão com o desconto.{' '}
            <button type="button" className="link-botao" onClick={tirarCupom}>
              Tirar o cupom
            </button>
          </p>
        ) : (
          <label className="campo">
            <span className="rotulo">Tem um cupom de desconto?</span>
            <span className="linha-acompanhar">
              <input
                className="entrada entrada-cupom"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="Ex.: BEMVINDO"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={30}
                aria-invalid={erroCupom ? true : undefined}
              />
              <button type="submit" className="botao botao-secundario botao-auto" disabled={aplicando || !codigo.trim()}>
                {aplicando ? 'Conferindo…' : 'Aplicar'}
              </button>
            </span>
            {erroCupom && (
              <span className="ajuda cupom-erro" role="alert">
                {erroCupom}
              </span>
            )}
          </label>
        )}
      </form>

      {!podePagar && sessao?.equipe && (
        <p className="alerta" role="note">
          Você está na equipe de <strong>{sessao.equipe.donoNome}</strong>: os créditos e o plano são da equipe, e só o responsável compra ou
          assina. Avise quando os créditos estiverem acabando.
        </p>
      )}

      {sessao && (
        <div className="cartao pilha-p saldo-planos">
          <p>
            {sessao.equipe ? 'Saldo da equipe' : 'Seu saldo'}: <strong>{contagem(sessao.saldo.consulta, 'consulta', 'consultas')}</strong> e{' '}
            <strong>{contagem(sessao.saldo.dossie, 'dossiê', 'dossiês')}</strong>.
          </p>
          {assinatura && (
            <div className="assinatura-atual pilha-p">
              <p>
                Plano <strong>{assinatura.nomePlano}</strong> — {reais(assinatura.valorMensal)}/mês
                {assinatura.desconto && (
                  <span className="fonte-suave">
                    {' '}
                    (cupom {assinatura.desconto.cupom}
                    {assinatura.desconto.mesesRestantes == null
                      ? ''
                      : assinatura.desconto.mesesRestantes === 0
                        ? `; a próxima já vem com o valor cheio, ${reais(assinatura.desconto.valorCheio)}/mês`
                        : `; ainda ${assinatura.desconto.mesesRestantes === 1 ? 'mais 1 mensalidade' : `mais ${assinatura.desconto.mesesRestantes} mensalidades`} com desconto, depois ${reais(assinatura.desconto.valorCheio)}/mês`}
                    )
                  </span>
                )}{' '}
                ·{' '}
                <span className={assinatura.status === 'ativa' ? 'verificacao sim' : 'verificacao nao'}>{SITUACAO[assinatura.status]}</span>
                {assinatura.ativadaEm && <span className="fonte-suave"> · desde {dataBr(assinatura.ativadaEm)}</span>}
              </p>
              {podePagar && (
                <div className="acoes-imovel">
                  {assinatura.status !== 'ativa' && assinatura.link && (
                    <a href={assinatura.link} className="botao botao-primario">
                      Pagar mensalidade
                    </a>
                  )}
                  <button type="button" className="link-botao" onClick={cancelar}>
                    Cancelar assinatura
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <section className="pilha-p">
        <h2 className="secao-titulo topo-centro">Assinatura mensal</h2>
        <ul className="l-planos">
          {planos.map((p) => (
            <li key={p.id} className={`l-plano${p.destaque ? ' l-plano-destaque' : ''}`}>
              {p.destaque && <span className="l-plano-selo">Recomendado</span>}
              <h3>{p.nome}</h3>
              {comCupom(p.id) ? (
                <>
                  <p className="l-plano-preco">
                    <s className="preco-antigo">{reais(p.valorMensal)}</s> {reais(comCupom(p.id)!.por)}
                    <span>/mês</span>
                  </p>
                  <p className="cupom-texto">{precoDepois(comCupom(p.id)!, p.valorMensal)}</p>
                </>
              ) : (
                <p className="l-plano-preco">
                  {reais(p.valorMensal)}
                  <span>/mês</span>
                </p>
              )}
              {cupom && !comCupom(p.id) && <p className="cupom-nao-vale">{(cupom.precos[p.id] as { mensagem?: string })?.mensagem ?? 'O cupom não vale neste plano.'}</p>}
              <ul>
                {[
                  `${contagem(p.creditosMensais.consulta, 'consulta', 'consultas')} por mês`,
                  `${contagem(p.creditosMensais.dossie, 'dossiê', 'dossiês')} por mês`,
                  `Carteira com até ${p.limiteCarteira} fazendas, reconferidas todo dia`,
                  ...((p.limiteMembros ?? 1) > 1 ? [`Equipe de até ${p.limiteMembros} pessoas, cada uma com o próprio login`] : []),
                  'Créditos que sobram passam para o mês seguinte',
                ].map((t) => (
                  <li key={t}>
                    <Icone nome="check" className="l-icone-p" /> {t}
                  </li>
                ))}
              </ul>
              {campoDocumento(`plano:${p.id}`)}
              <button
                type="button"
                className={`l-botao ${p.destaque ? 'l-botao-marca' : 'l-botao-claro'}`}
                style={{ marginTop: 'auto' }}
                disabled={enviando || !podePagar || !catalogo?.pagamentoDisponivel || (assinatura != null && assinatura.planoId !== p.id)}
                onClick={() => seguir(`plano:${p.id}`, () => api.assinar(p.id, documento || undefined, cupomDe(p.id)))}
              >
                {assinatura?.planoId === p.id
                  ? podePagar
                    ? 'Seu plano'
                    : 'Plano da equipe'
                  : !podePagar
                    ? 'Só o responsável assina'
                  : assinatura
                    ? 'Cancele o atual para trocar'
                    : escolhido === `plano:${p.id}` || !exigeDocumento
                      ? 'Ir para o pagamento'
                      : 'Assinar'}
              </button>
            </li>
          ))}
        </ul>
        <p className="ajuda topo-centro">Cancele quando quiser: as próximas mensalidades deixam de ser cobradas e os créditos que você já tem continuam seus.</p>
      </section>

      <section className="pilha-p">
        <h2 className="secao-titulo topo-centro">Prefere sem assinatura?</h2>
        <ul className="avulsos-grade">
          {catalogo?.produtos.map((p: Produto) => (
            <li key={p.id} className="cartao avulso">
              <div className="avulso-topo">
                <h3 className="secao-titulo">{p.nome}</h3>
                <p className="avulso-preco">
                  {comCupom(p.id) ? (
                    <>
                      <s className="preco-antigo">{reais(p.valor)}</s> {comCupom(p.id)!.por === 0 ? 'Grátis' : reais(comCupom(p.id)!.por)}
                    </>
                  ) : (
                    reais(p.valor)
                  )}
                </p>
              </div>
              <p className="fonte-suave">{p.descricao}</p>
              {cupom && !comCupom(p.id) && <p className="cupom-nao-vale">{(cupom.precos[p.id] as { mensagem?: string })?.mensagem ?? 'O cupom não vale neste produto.'}</p>}
              {campoDocumento(`produto:${p.id}`)}
              <button
                type="button"
                className="l-botao l-botao-claro"
                style={{ marginTop: 'auto' }}
                disabled={enviando || !podePagar || !catalogo.pagamentoDisponivel}
                onClick={() =>
                  seguir(`produto:${p.id}`, () => api.comprar(p.id, documento || undefined, cupomDe(p.id)), comCupom(p.id)?.por === 0)
                }
              >
                {comCupom(p.id)?.por === 0
                  ? 'Resgatar grátis'
                  : escolhido === `produto:${p.id}` || !exigeDocumento
                    ? 'Ir para o pagamento'
                    : 'Comprar'}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p className="avisos topo-centro">
        Preços em reais. Dúvidas sobre cobrança: veja os <Link to="/termos">termos de uso</Link>.
      </p>
    </div>
  );
}
