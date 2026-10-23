import type { Status } from '@apto/regras';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type Plano, type Produto } from '../api';
import { Icone, type NomeIcone } from '../componentes/Icones';
import { SeloStatus } from '../componentes/SeloStatus';

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: v % 1 ? 2 : 0 });

const URL_RES_5303 = 'https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?tipo=Resolu%C3%A7%C3%A3o%20CMN&numero=5303';
const URL_MMA =
  'https://www.gov.br/mma/pt-br/assuntos/controle-ao-desmatamento-queimadas-e-ordenamento-ambiental-territorial/controle-do-desmatamento-1/atendimento-ao-manual-de-credito-rural';

const CRIAR_CONTA = '/entrar?modo=criar';

/** Exemplo fictício do semáforo, para mostrar o produto sem precisar de conta. */
const EXEMPLO: { titulo: string; status: Status; texto: string }[] = [
  { titulo: 'Embargos ambientais', status: 'impedimento', texto: 'Embargo ativo na lista do Ibama. O dossiê mostra as saídas.' },
  { titulo: 'Desmatamento após 31/07/2019', status: 'atencao', texto: 'Consta na lista do MMA. Exigência começa em 01/07/2027.' },
  { titulo: 'Cadastro Ambiental Rural', status: 'sem_impedimento', texto: 'CAR ativo.' },
  { titulo: 'Terras indígenas', status: 'sem_impedimento', texto: 'Nenhuma sobreposição.' },
  { titulo: 'Unidades de Conservação', status: 'sem_impedimento', texto: 'Nenhuma sobreposição.' },
];

/** Órgãos de onde vêm os dados (só os nomes: não usamos marcas de governo). */
const FONTES = ['Banco Central · MCR', 'MMA · Inpe/Prodes', 'Ibama', 'Funai', 'MMA · CNUC', 'Serviço Florestal Brasileiro', 'Ministério do Trabalho'];

const PROBLEMAS: { icone: NomeIcone; titulo: string; texto: string }[] = [
  {
    icone: 'relogio',
    titulo: 'O "não" chega tarde',
    texto: 'O técnico só descobre o embargo ou o CAR suspenso quando o banco nega, depois de juntar documentos e esperar semanas.',
  },
  {
    icone: 'banco',
    titulo: 'As regras ficaram mais duras',
    texto: 'O MCR proíbe crédito para CAR cancelado ou suspenso, embargo do Ibama, sobreposição com terra indígena ou Unidade de Conservação e, em etapas, desmatamento detectado pelo Prodes.',
  },
  {
    icone: 'documento',
    titulo: 'O contrato pode cair depois',
    texto: 'Se a fazenda deixar de cumprir as regras durante o financiamento, a operação pode ser desclassificada (MCR 2-9-19).',
  },
];

const PASSOS: { titulo: string; texto: string }[] = [
  { titulo: 'Informe o CAR', texto: 'Digite o código do recibo e envie o contorno do imóvel (KML ou GeoJSON, exportado do CAR).' },
  { titulo: 'Cruzamos com as bases oficiais', texto: 'Cada item do MCR 2-9 é conferido nos mapas e listas públicas, com a data de cada base.' },
  { titulo: 'Receba o semáforo e o caminho', texto: 'Relatório em PDF com QR de conferência e, se der vermelho, o dossiê com o que fazer.' },
];

const CHECAGENS = [
  'CAR ativo, não cancelado nem suspenso',
  'Embargos do Ibama',
  'Desmatamento após 31/07/2019 (Prodes)',
  'Terras indígenas',
  'Unidades de Conservação',
  'Florestas públicas não destinadas',
  'Territórios quilombolas',
  'Cadastro de trabalho escravo',
];

const DIFERENCIAIS: { icone: NomeIcone; titulo: string; texto: string }[] = [
  {
    icone: 'caminho',
    titulo: 'Do vermelho ao verde',
    texto: 'Quando dá impedimento, o dossiê mostra as saídas que a própria norma admite e a lista de documentos para levar ao banco.',
  },
  {
    icone: 'sino',
    titulo: 'Carteira com avisos',
    texto: 'Acompanhe as fazendas que você atende. Reconferimos todo dia e avisamos por e-mail se algo mudar.',
  },
  {
    icone: 'qr',
    titulo: 'Relatório verificável',
    texto: 'O QR do relatório abre a consulta original, para o gerente do banco conferir que nada foi alterado.',
  },
];

const PERGUNTAS: { p: string; r: string }[] = [
  {
    p: 'O Apto Rural aprova o crédito?',
    r: 'Não. Ele antecipa o que a checagem do banco vai encontrar nas mesmas bases públicas. A decisão continua sendo da instituição financeira.',
  },
  {
    p: 'De onde vêm os dados?',
    r: 'De fontes oficiais: lista do Ministério do Meio Ambiente (Prodes/Inpe), embargos do Ibama, Funai, cadastro de Unidades de Conservação, Serviço Florestal Brasileiro e Ministério do Trabalho. Cada resultado mostra a base e a data de atualização.',
  },
  {
    p: 'O que preciso para consultar?',
    r: 'O código do CAR (está no recibo de inscrição) e, para checar os mapas, o arquivo do contorno do imóvel em KML ou GeoJSON, que você exporta do CAR.',
  },
  {
    p: 'Preciso instalar alguma coisa?',
    r: 'Não. Funciona no navegador do celular ou do computador, mesmo com internet fraca.',
  },
  {
    p: 'E os dados do meu cliente?',
    r: 'O CPF ou CNPJ do produtor só é consultado com a autorização dele e fica guardado apenas como código irreversível. Dados de cartão nunca passam por nós.',
  },
  {
    p: 'Posso cancelar a assinatura?',
    r: 'Sim, quando quiser, pela sua conta. Os créditos que você já recebeu continuam valendo.',
  },
];

function Vitrine() {
  return (
    <div className="l-vitrine" aria-label="Exemplo de resultado com dados fictícios">
      <div className="l-vitrine-barra">
        <span className="l-pontos" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>Resultado da consulta</span>
      </div>
      <div className="l-vitrine-corpo">
        <div className="l-vitrine-imovel">
          <span className="l-rotulo">Imóvel</span>
          <span className="mono">MT-5107925-8F3A…C21D</span>
          <span className="l-rotulo">Sorriso/MT · 9,4 módulos fiscais</span>
        </div>
        <div className="l-veredito">
          <SeloStatus status="impedimento" />
          <span>1 impedimento, 1 ponto de atenção</span>
        </div>
        <ul className="l-vitrine-itens">
          {EXEMPLO.map((e) => (
            <li key={e.titulo}>
              <div>
                <strong>{e.titulo}</strong>
                <span>{e.texto}</span>
              </div>
              <SeloStatus status={e.status} />
            </li>
          ))}
        </ul>
        <p className="l-vitrine-nota">Exemplo com dados fictícios</p>
      </div>
    </div>
  );
}

export function Landing() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [busca] = useSearchParams();

  useEffect(() => {
    api
      .produtos()
      .then((c) => setProdutos(c.produtos))
      .catch(() => undefined);
    api
      .planos()
      .then((r) => setPlanos(r.planos))
      .catch(() => undefined);
  }, []);

  return (
    <div className="landing">
      {busca.get('conta') === 'excluida' && (
        <div className="aviso-excluida" role="status">
          <div className="l-container">Sua conta foi excluída. Enviamos um comprovante para o seu e-mail.</div>
        </div>
      )}
      <section className="l-hero">
        <div className="l-container l-hero-grade">
          <div className="l-hero-texto">
            <p className="l-selo">Para técnicos agrícolas e projetistas de crédito rural</p>
            <h1>
              Saiba se a fazenda passa no <em>crédito rural</em> antes de montar a proposta
            </h1>
            <p className="l-lead">
              O Apto Rural confere os impedimentos socioambientais do Manual de Crédito Rural nas mesmas bases oficiais que o banco consulta e,
              quando dá vermelho, mostra o caminho de saída.
            </p>
            <div className="l-acoes">
              <Link to={CRIAR_CONTA} className="l-botao l-botao-primario">
                Consultar uma fazenda grátis
                <Icone nome="seta" className="l-icone-p" />
              </Link>
              <a href="#como-funciona" className="l-botao l-botao-contorno">
                Como funciona
              </a>
            </div>
            <ul className="l-garantias">
              <li>
                <Icone nome="check" className="l-icone-p" /> 1ª consulta grátis, sem cartão
              </li>
              <li>
                <Icone nome="check" className="l-icone-p" /> Só bases oficiais
              </li>
              <li>
                <Icone nome="check" className="l-icone-p" /> Resultado em segundos
              </li>
            </ul>
          </div>
          <Vitrine />
        </div>
      </section>

      <section className="l-fontes" aria-label="Fontes dos dados">
        <div className="l-container">
          <p>Cruzamos os dados públicos de</p>
          <ul>
            {FONTES.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="l-secao">
        <div className="l-container">
          <header className="l-cabeca">
            <p className="l-sobretitulo">O problema</p>
            <h2>O banco descobre o impedimento. Você perde a proposta.</h2>
          </header>
          <div className="l-grade-3">
            {PROBLEMAS.map((p) => (
              <article key={p.titulo} className="l-cartao">
                <span className="l-icone-caixa">
                  <Icone nome={p.icone} />
                </span>
                <h3>{p.titulo}</h3>
                <p>{p.texto}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="l-secao l-secao-alerta">
        <div className="l-container l-prazos">
          <div>
            <p className="l-sobretitulo l-sobretitulo-alerta">Prazos do Prodes</p>
            <h2>A checagem de desmatamento chega em etapas</h2>
            <p className="l-texto-suave">
              A lista oficial do MMA de 21/09/2026 já tem 106.024 imóveis acima de 4 módulos fiscais com supressão acima do limite do bioma.
            </p>
            <p className="l-fonte">
              Fontes:{' '}
              <a href={URL_RES_5303} target="_blank" rel="noreferrer">
                Resolução CMN 5.303/2026
              </a>{' '}
              ·{' '}
              <a href={URL_MMA} target="_blank" rel="noreferrer">
                MMA
              </a>
            </p>
          </div>
          <ol className="l-linha-tempo">
            <li>
              <strong>04/01/2027</strong>
              <span>Imóveis acima de 15 módulos fiscais</span>
            </li>
            <li>
              <strong>01/07/2027</strong>
              <span>De 4 a 15 módulos fiscais</span>
            </li>
            <li>
              <strong>03/01/2028</strong>
              <span>Até 4 módulos fiscais</span>
            </li>
          </ol>
        </div>
      </section>

      <section className="l-secao" id="como-funciona">
        <div className="l-container">
          <header className="l-cabeca">
            <p className="l-sobretitulo">Como funciona</p>
            <h2>Três passos, menos de um minuto</h2>
          </header>
          <ol className="l-passos">
            {PASSOS.map((p, i) => (
              <li key={p.titulo} className="l-cartao">
                <span className="l-numero">{i + 1}</span>
                <h3>{p.titulo}</h3>
                <p>{p.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="l-secao l-secao-clara">
        <div className="l-container l-dupla">
          <div>
            <p className="l-sobretitulo">O que checamos</p>
            <h2>Os itens do MCR 2-9, um por um</h2>
            <p className="l-texto-suave">
              Cada item mostra a norma, a base consultada e a data de atualização. Se uma base não puder ser consultada, o item aparece como
              "não verificado", nunca como verde.
            </p>
            <Link to="/fontes" className="l-link">
              Ver as regras e as fontes <Icone nome="seta" className="l-icone-p" />
            </Link>
          </div>
          <ul className="l-checagens">
            {CHECAGENS.map((c) => (
              <li key={c}>
                <span className="l-check">
                  <Icone nome="check" />
                </span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="l-secao">
        <div className="l-container">
          <header className="l-cabeca">
            <p className="l-sobretitulo">Mais que um semáforo</p>
            <h2>Feito para quem atende o produtor</h2>
          </header>
          <div className="l-grade-3">
            {DIFERENCIAIS.map((d, i) => (
              <article key={d.titulo} className={`l-cartao${i === 0 ? ' l-cartao-destaque' : ''}`}>
                <span className="l-icone-caixa">
                  <Icone nome={d.icone} />
                </span>
                <h3>{d.titulo}</h3>
                <p>{d.texto}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {(planos.length > 0 || produtos.length > 0) && (
        <section className="l-secao l-secao-clara" id="precos">
          <div className="l-container">
            <header className="l-cabeca">
              <p className="l-sobretitulo">Preços</p>
              <h2>Comece grátis. Assine quando fizer sentido.</h2>
              <p className="l-texto-suave">Pix, cartão ou boleto. Cancele quando quiser; os créditos não vencem.</p>
            </header>
            <div className="l-planos">
              {planos.map((p) => (
                <article key={p.id} className={`l-plano${p.destaque ? ' l-plano-destaque' : ''}`}>
                  {p.destaque && <span className="l-plano-selo">Recomendado</span>}
                  <h3>{p.nome}</h3>
                  <p className="l-plano-preco">
                    {reais(p.valorMensal)}
                    <span>/mês</span>
                  </p>
                  <ul>
                    <li>
                      <Icone nome="check" className="l-icone-p" /> {p.creditosMensais.consulta} consultas por mês
                    </li>
                    <li>
                      <Icone nome="check" className="l-icone-p" /> {p.creditosMensais.dossie} dossiês por mês
                    </li>
                    <li>
                      <Icone nome="check" className="l-icone-p" /> Carteira com até {p.limiteCarteira} imóveis e avisos diários
                    </li>
                    {(p.limiteMembros ?? 1) > 1 && (
                      <li>
                        <Icone nome="check" className="l-icone-p" /> Equipe de até {p.limiteMembros} pessoas, cada uma com o próprio login
                      </li>
                    )}
                    <li>
                      <Icone nome="check" className="l-icone-p" /> Créditos que sobram passam para o mês seguinte
                    </li>
                  </ul>
                  <Link to={`${CRIAR_CONTA}&voltar=/planos`} className={`l-botao ${p.destaque ? 'l-botao-marca' : 'l-botao-claro'}`}>
                    Começar com o {p.nome}
                  </Link>
                </article>
              ))}
            </div>
            {produtos.length > 0 && (
              <div className="l-avulsos">
                <strong>Prefere sem assinatura?</strong>
                <ul>
                  {produtos.map((p) => (
                    <li key={p.id}>
                      {p.nome} <b>{reais(p.valor)}</b>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="l-secao">
        <div className="l-container l-estreito">
          <header className="l-cabeca">
            <p className="l-sobretitulo">Perguntas frequentes</p>
            <h2>Antes de começar</h2>
          </header>
          <div className="l-perguntas">
            {PERGUNTAS.map((q) => (
              <details key={q.p}>
                <summary>{q.p}</summary>
                <p>{q.r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="l-final">
        <div className="l-container l-final-dentro">
          <div>
            <h2>Teste com uma fazenda real da sua carteira</h2>
            <p>A primeira consulta é por nossa conta. Sem cartão.</p>
          </div>
          <div className="l-acoes">
            <Link to={CRIAR_CONTA} className="l-botao l-botao-primario">
              Criar conta grátis
            </Link>
            <Link to="/entrar" className="l-botao l-botao-contorno">
              Já tenho conta
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
