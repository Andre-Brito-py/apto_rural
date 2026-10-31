import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Assinatura, type Catalogo, type CicloAssinatura, type Plano, type PrecoCupom, type Produto, type Saldo } from '../api';
import { Icone } from '../componentes/Icones';
import { useSessao } from '../sessao';
import { contagem, dataBr } from '../textos';

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "Nas 3 primeiras mensalidades; depois, R$ 199,00/mês." (no anual, "/ano") */
function precoDepois(p: Extract<PrecoCupom, { valido: true }>, cheio: number, ciclo: CicloAssinatura) {
  if (p.meses == null) return `${p.texto}.`;
  return `${p.texto}; depois, ${reais(cheio)}${ciclo === 'anual' ? '/ano' : '/mês'}.`;
}

const POR: Record<CicloAssinatura, string> = { mensal: '/mês', anual: '/ano' };

/** Preços do cupom por item: o plano entra duas vezes (mensal e anual); o avulso, uma. */
const chavePreco = (id: string, ciclo?: CicloAssinatura) => `${id}|${ciclo ?? ''}`;

const SITUACAO: Record<Assinatura['status'], string> = {
  pendente: 'Aguardando o primeiro pagamento',
  ativa: 'Ativa',
  inadimplente: 'Pagamento em atraso',
  cancelada: 'Cancelada',
};

/** "2 meses grátis" quando o anual sai por um número inteiro de mensalidades a menos; senão, só "com desconto". */
function vantagemAnual(planos: Plano[]): string {
  const meses = planos.filter((p) => p.valorAnual != null).map((p) => (12 * p.valorMensal - p.valorAnual!) / p.valorMensal);
  if (!meses.length) return '';
  const inteiro = meses.every((m) => m === meses[0] && Number.isInteger(m) && m > 0);
  return inteiro ? `${meses[0]} ${meses[0] === 1 ? 'mês grátis' : 'meses grátis'}` : 'com desconto';
}

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
  // Mensal ou anual: o link de divulgação pode já vir com ?ciclo=anual.
  const [ciclo, setCiclo] = useState<CicloAssinatura>(parametros.get('ciclo') === 'anual' ? 'anual' : 'mensal');
  const temAnual = planos.some((p) => p.valorAnual != null);
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
      setCupom({ codigo: r.codigo, precos: Object.fromEntries(r.itens.map((i) => [chavePreco(i.id, i.ciclo), i])) });
      setCodigo(r.codigo);
      setParametros({ cupom: r.codigo, ...(ciclo === 'anual' ? { ciclo } : {}) }, { replace: true });
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

  /** Preço com o cupom, se ele vale neste plano (no ciclo escolhido) ou produto. */
  const comCupom = (id: string, c?: CicloAssinatura) => {
    const p = cupom?.precos[chavePreco(id, c)];
    return p?.valido ? p : null;
  };
  const cupomDe = (id: string, c?: CicloAssinatura) => (comCupom(id, c) ? cupom!.codigo : undefined);
  const mensagemCupom = (id: string, c?: CicloAssinatura) => (cupom?.precos[chavePreco(id, c)] as { mensagem?: string } | undefined)?.mensagem;

  function escolherCiclo(c: CicloAssinatura) {
    setCiclo(c);
    setEscolhido(null);
    const p = new URLSearchParams(parametros);
    if (c === 'anual') p.set('ciclo', 'anual');
    else p.delete('ciclo');
    setParametros(p, { replace: true });
  }

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

  // Anual já pago: cancelar é não renovar (o plano vale até o fim do ano pago).
  const anualPago = assinatura?.ciclo === 'anual' && assinatura.status === 'ativa' && assinatura.validaAte != null;

  async function cancelar() {
    const pergunta = anualPago
      ? `Cancelar a renovação? O plano continua valendo até ${dataBr(assinatura!.validaAte!)}, e a próxima anuidade não será cobrada. Os créditos que você já tem continuam seus.`
      : 'Cancelar a assinatura? As próximas cobranças não serão feitas e os créditos que você já tem continuam seus.';
    if (!window.confirm(pergunta)) return;
    try {
      const r = await api.cancelarAssinatura();
      if (r.validaAte) {
        setAssinatura({ ...assinatura!, renovacaoCanceladaEm: new Date().toISOString() });
        setSucesso(`Renovação cancelada. Seu plano continua valendo até ${dataBr(r.validaAte)}.`);
      } else setAssinatura(null);
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
        <p className="subtitulo">
          Assine por mês ou por ano e receba créditos, com a carteira de fazendas inclusa. Pix, cartão ou boleto.
        </p>
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
                Plano <strong>{assinatura.nomePlano}</strong> — {reais(assinatura.valorMensal)}
                {POR[assinatura.ciclo ?? 'mensal']}
                {assinatura.desconto && (
                  <span className="fonte-suave">
                    {' '}
                    (cupom {assinatura.desconto.cupom}
                    {assinatura.desconto.mesesRestantes == null
                      ? ''
                      : assinatura.desconto.mesesRestantes === 0
                        ? `; a próxima já vem com o valor cheio, ${reais(assinatura.desconto.valorCheio)}${POR[assinatura.ciclo ?? 'mensal']}`
                        : assinatura.ciclo === 'anual'
                          ? `; desconto na primeira anuidade, depois ${reais(assinatura.desconto.valorCheio)}/ano`
                          : `; ainda ${assinatura.desconto.mesesRestantes === 1 ? 'mais 1 mensalidade' : `mais ${assinatura.desconto.mesesRestantes} mensalidades`} com desconto, depois ${reais(assinatura.desconto.valorCheio)}/mês`}
                    )
                  </span>
                )}{' '}
                ·{' '}
                <span className={assinatura.status === 'ativa' ? 'verificacao sim' : 'verificacao nao'}>{SITUACAO[assinatura.status]}</span>
                {assinatura.ativadaEm && <span className="fonte-suave"> · desde {dataBr(assinatura.ativadaEm)}</span>}
                {anualPago && (
                  <span className="fonte-suave">
                    {' '}
                    · {assinatura.renovacaoCanceladaEm ? 'renovação cancelada: vale até' : 'renova em'} {dataBr(assinatura.validaAte!)}
                  </span>
                )}
              </p>
              {podePagar && (
                <div className="acoes-imovel">
                  {assinatura.status !== 'ativa' && assinatura.link && (
                    <a href={assinatura.link} className="botao botao-primario">
                      {assinatura.ciclo === 'anual' ? 'Pagar anuidade' : 'Pagar mensalidade'}
                    </a>
                  )}
                  {!assinatura.renovacaoCanceladaEm && (
                    <button type="button" className="link-botao" onClick={cancelar}>
                      {anualPago ? 'Cancelar renovação' : 'Cancelar assinatura'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <section className="pilha-p">
        <h2 className="secao-titulo topo-centro">Assinatura</h2>
        {temAnual && (
          <div className="ciclo-escolha" role="radiogroup" aria-label="Forma de pagamento da assinatura">
            {(['mensal', 'anual'] as const).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={ciclo === c} className={`ciclo-opcao${ciclo === c ? ' ciclo-ativo' : ''}`} onClick={() => escolherCiclo(c)}>
                {c === 'mensal' ? 'Mensal' : 'Anual'}
                {c === 'anual' && vantagemAnual(planos) && <span className="ciclo-selo">{vantagemAnual(planos)}</span>}
              </button>
            ))}
          </div>
        )}
        <ul className="l-planos">
          {planos.map((p) => {
            const anual = ciclo === 'anual';
            const semAnual = anual && p.valorAnual == null;
            const cheio = anual ? (p.valorAnual ?? 0) : p.valorMensal;
            const preco = comCupom(p.id, ciclo);
            const chave = `plano:${p.id}:${ciclo}`;
            const seu = assinatura?.planoId === p.id && (assinatura.ciclo ?? 'mensal') === ciclo;
            const economia = anual && p.valorAnual != null ? 12 * p.valorMensal - p.valorAnual : 0;
            return (
              <li key={p.id} className={`l-plano${p.destaque ? ' l-plano-destaque' : ''}`}>
                {p.destaque && <span className="l-plano-selo">Recomendado</span>}
                <h3>{p.nome}</h3>
                {semAnual ? (
                  <p className="fonte-suave">Este plano não tem opção anual. Veja o mensal.</p>
                ) : preco ? (
                  <>
                    <p className="l-plano-preco">
                      <s className="preco-antigo">{reais(cheio)}</s> {reais(preco.por)}
                      <span>{POR[ciclo]}</span>
                    </p>
                    <p className="cupom-texto">{precoDepois(preco, cheio, ciclo)}</p>
                  </>
                ) : (
                  <p className="l-plano-preco">
                    {reais(cheio)}
                    <span>{POR[ciclo]}</span>
                  </p>
                )}
                {anual && !semAnual && (
                  <p className="plano-anual-conta">
                    Equivale a {reais(cheio / 12)}/mês{economia > 0 ? ` · economia de ${reais(economia)} no ano` : ''}
                  </p>
                )}
                {cupom && !semAnual && !preco && <p className="cupom-nao-vale">{mensagemCupom(p.id, ciclo) ?? 'O cupom não vale neste plano.'}</p>}
                <ul>
                  {(anual
                    ? [
                        `${contagem(p.creditosMensais.consulta * 12, 'consulta', 'consultas')} por ano`,
                        `${contagem(p.creditosMensais.dossie * 12, 'dossiê', 'dossiês')} por ano`,
                        'Todos os créditos do ano liberados no pagamento: use na safra',
                      ]
                    : [
                        `${contagem(p.creditosMensais.consulta, 'consulta', 'consultas')} por mês`,
                        `${contagem(p.creditosMensais.dossie, 'dossiê', 'dossiês')} por mês`,
                      ]
                  )
                    .concat(
                      `Carteira com até ${p.limiteCarteira} fazendas, reconferidas todo dia`,
                      ...((p.limiteMembros ?? 1) > 1 ? [`Equipe de até ${p.limiteMembros} pessoas, cada uma com o próprio login`] : []),
                      anual ? 'Créditos que sobram continuam seus' : 'Créditos que sobram passam para o mês seguinte',
                    )
                    .map((t) => (
                      <li key={t}>
                        <Icone nome="check" className="l-icone-p" /> {t}
                      </li>
                    ))}
                </ul>
                {campoDocumento(chave)}
                <button
                  type="button"
                  className={`l-botao ${p.destaque ? 'l-botao-marca' : 'l-botao-claro'}`}
                  style={{ marginTop: 'auto' }}
                  disabled={enviando || semAnual || !podePagar || !catalogo?.pagamentoDisponivel || (assinatura != null && !seu)}
                  onClick={() => seguir(chave, () => api.assinar(p.id, documento || undefined, cupomDe(p.id, ciclo), ciclo))}
                >
                  {seu
                    ? podePagar
                      ? 'Seu plano'
                      : 'Plano da equipe'
                    : !podePagar
                      ? 'Só o responsável assina'
                      : assinatura
                        ? assinatura.renovacaoCanceladaEm && assinatura.validaAte
                          ? `Disponível depois de ${dataBr(assinatura.validaAte)}`
                          : 'Cancele o atual para trocar'
                        : escolhido === chave || !exigeDocumento
                          ? 'Ir para o pagamento'
                          : anual
                            ? 'Assinar por um ano'
                            : 'Assinar'}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="ajuda topo-centro">
          {ciclo === 'anual'
            ? 'No anual, você paga uma vez por ano e recebe os créditos do ano inteiro na hora. Cancelar é não renovar: o plano vale até o fim do ano pago, e os créditos continuam seus.'
            : 'Cancele quando quiser: as próximas mensalidades deixam de ser cobradas e os créditos que você já tem continuam seus.'}
        </p>
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
              {cupom && !comCupom(p.id) && <p className="cupom-nao-vale">{mensagemCupom(p.id) ?? 'O cupom não vale neste produto.'}</p>}
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
