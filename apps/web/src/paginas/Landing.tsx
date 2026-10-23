import type { Status } from '@apto/regras';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Produto } from '../api';
import { SeloStatus } from '../componentes/SeloStatus';

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const URL_RES_5303 = 'https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?tipo=Resolu%C3%A7%C3%A3o%20CMN&numero=5303';
const URL_MMA =
  'https://www.gov.br/mma/pt-br/assuntos/controle-ao-desmatamento-queimadas-e-ordenamento-ambiental-territorial/controle-do-desmatamento-1/atendimento-ao-manual-de-credito-rural';

/** Exemplo fictício do semáforo, para mostrar o produto sem precisar de conta. */
const EXEMPLO: { titulo: string; status: Status; texto: string }[] = [
  { titulo: 'Embargos ambientais', status: 'impedimento', texto: 'Embargo de 18 ha na lista do Ibama. Exceção do item 12: área dentro do limite de 20 ha.' },
  { titulo: 'Desmatamento após 31/07/2019', status: 'atencao', texto: 'Consta na lista do MMA. Para este imóvel, a exigência começa em 01/07/2027.' },
  { titulo: 'Cadastro Ambiental Rural', status: 'sem_impedimento', texto: 'CAR ativo.' },
  { titulo: 'Terras indígenas', status: 'sem_impedimento', texto: 'Nenhuma sobreposição.' },
  { titulo: 'Unidades de Conservação', status: 'sem_impedimento', texto: 'Nenhuma sobreposição.' },
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
    p: 'Preciso instalar alguma coisa?',
    r: 'Não. Funciona no navegador do celular ou do computador, mesmo com internet fraca.',
  },
  {
    p: 'O que preciso para consultar?',
    r: 'O código do CAR (está no recibo de inscrição) e, para checar os mapas, o arquivo do contorno do imóvel em KML ou GeoJSON, que você exporta do CAR.',
  },
  {
    p: 'E os dados do meu cliente?',
    r: 'O CPF ou CNPJ do produtor só é consultado com a autorização dele e fica guardado apenas como código irreversível. Dados de cartão nunca passam por nós.',
  },
];

export function Landing() {
  const [produtos, setProdutos] = useState<Produto[]>([]);

  useEffect(() => {
    api
      .produtos()
      .then((c) => setProdutos(c.produtos))
      .catch(() => undefined);
  }, []);

  return (
    <div className="landing">
      <section className="hero">
        <div className="pagina pilha">
          <p className="hero-selo">Para técnicos agrícolas e projetistas de crédito rural</p>
          <h1 className="hero-titulo">Saiba se a fazenda passa no crédito rural antes de montar a proposta</h1>
          <p className="hero-texto">
            Em segundos, o Apto Rural checa os impedimentos socioambientais do Manual de Crédito Rural nas mesmas bases oficiais que o banco usa,
            e mostra o caminho de saída quando dá vermelho.
          </p>
          <div className="botoes">
            <Link to="/entrar?modo=criar" className="botao botao-primario">
              Criar conta e consultar grátis
            </Link>
            <a href="#exemplo" className="botao botao-claro">
              Ver um exemplo
            </a>
          </div>
          <p className="hero-nota">A primeira consulta de um imóvel real é por nossa conta. Sem cartão.</p>
        </div>
      </section>

      <section className="pagina pilha secao-landing">
        <h2 className="landing-h2">O problema</h2>
        <div className="grade-3">
          <div className="cartao pilha-p">
            <strong>O "não" chega tarde</strong>
            <p>Hoje o técnico só descobre o embargo ou o CAR suspenso quando o banco nega, depois de juntar documentos e esperar semanas.</p>
          </div>
          <div className="cartao pilha-p">
            <strong>As regras ficaram mais duras</strong>
            <p>
              O MCR proíbe crédito para imóvel com CAR cancelado ou suspenso, embargo do Ibama, sobreposição com terra indígena ou Unidade de
              Conservação e, em etapas, desmatamento detectado pelo Prodes.
            </p>
          </div>
          <div className="cartao pilha-p">
            <strong>O contrato pode cair depois</strong>
            <p>Se a fazenda deixar de cumprir as regras durante o financiamento, a operação pode ser desclassificada (MCR 2-9-19).</p>
          </div>
        </div>
      </section>

      <section className="faixa-datas">
        <div className="pagina pilha-p">
          <h2 className="landing-h2">A checagem do Prodes chega em etapas</h2>
          <div className="datas">
            <div>
              <strong>04/01/2027</strong>
              <span>imóveis acima de 15 módulos fiscais</span>
            </div>
            <div>
              <strong>01/07/2027</strong>
              <span>de 4 a 15 módulos fiscais</span>
            </div>
            <div>
              <strong>03/01/2028</strong>
              <span>até 4 módulos fiscais</span>
            </div>
          </div>
          <p className="ajuda">
            Fonte:{' '}
            <a href={URL_RES_5303} target="_blank" rel="noreferrer">
              Resolução CMN 5.303/2026
            </a>
            . A lista oficial do MMA de 21/09/2026 já tem 106.024 imóveis acima de 4 módulos fiscais com supressão acima do limite do bioma (
            <a href={URL_MMA} target="_blank" rel="noreferrer">
              MMA
            </a>
            ).
          </p>
        </div>
      </section>

      <section className="pagina pilha secao-landing">
        <h2 className="landing-h2">Como funciona</h2>
        <ol className="passos">
          <li>
            <strong>Digite o código do CAR</strong> e envie o contorno do imóvel.
          </li>
          <li>
            <strong>Cruzamos com as bases oficiais</strong>, item por item do MCR.
          </li>
          <li>
            <strong>Receba o semáforo</strong>, o relatório em PDF e, se der vermelho, o dossiê com o que fazer.
          </li>
        </ol>

        <div id="exemplo" className="cartao pilha-p exemplo">
          <div className="item-topo">
            <strong>Exemplo de resultado</strong>
            <span className="fonte-suave">dados fictícios</span>
          </div>
          <ul className="lista-exemplo">
            {EXEMPLO.map((e) => (
              <li key={e.titulo}>
                <div className="item-topo">
                  <span>{e.titulo}</span>
                  <SeloStatus status={e.status} />
                </div>
                <p className="ajuda" style={{ marginTop: 2 }}>
                  {e.texto}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="pagina pilha secao-landing">
        <h2 className="landing-h2">O que checamos</h2>
        <ul className="checagens">
          {CHECAGENS.map((c) => (
            <li key={c}>✓ {c}</li>
          ))}
        </ul>
        <p className="ajuda">
          Cada item cita a norma e a base usada. <Link to="/fontes">Veja as regras e as fontes</Link>.
        </p>
      </section>

      <section className="pagina pilha secao-landing">
        <h2 className="landing-h2">Mais que um semáforo</h2>
        <div className="grade-3">
          <div className="cartao pilha-p">
            <strong>Do vermelho ao verde</strong>
            <p>O dossiê mostra as saídas que a própria norma admite e a lista de documentos para levar ao banco.</p>
          </div>
          <div className="cartao pilha-p">
            <strong>Carteira com avisos</strong>
            <p>Acompanhe as fazendas que você atende: reconferimos todo dia e avisamos por e-mail se algo mudar.</p>
          </div>
          <div className="cartao pilha-p">
            <strong>Relatório verificável</strong>
            <p>O código QR do relatório abre a consulta original, para o gerente do banco conferir.</p>
          </div>
        </div>
      </section>

      {produtos.length > 0 && (
        <section className="pagina pilha secao-landing">
          <h2 className="landing-h2">Preços</h2>
          <div className="grade-precos">
            {produtos.map((p) => (
              <div key={p.id} className={`cartao pilha-p${p.destaque ? ' plano-destaque' : ''}`}>
                <strong>{p.nome}</strong>
                <span className="plano-preco">{reais(p.valor)}</span>
                <span className="ajuda" style={{ marginTop: 0 }}>
                  {p.descricao}
                </span>
              </div>
            ))}
          </div>
          <p className="ajuda">Pix, cartão ou boleto. Os créditos não vencem.</p>
        </section>
      )}

      <section className="pagina pilha secao-landing">
        <h2 className="landing-h2">Perguntas frequentes</h2>
        <div className="perguntas">
          {PERGUNTAS.map((q) => (
            <details key={q.p} className="cartao">
              <summary>
                <strong>{q.p}</strong>
              </summary>
              <p style={{ marginTop: 8 }}>{q.r}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="hero hero-final">
        <div className="pagina pilha">
          <h2 className="hero-titulo" style={{ fontSize: '1.5rem' }}>
            Teste com uma fazenda real da sua carteira
          </h2>
          <div className="botoes">
            <Link to="/entrar?modo=criar" className="botao botao-primario">
              Criar conta grátis
            </Link>
            <Link to="/entrar" className="botao botao-claro">
              Já tenho conta
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
