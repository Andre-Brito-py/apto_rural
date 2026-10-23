import { Link } from 'react-router-dom';

/**
 * RASCUNHO. Os textos definitivos dependem de revisão jurídica (ver
 * docs/conformidade-legal.md). Não lançar com estes textos.
 */
function AvisoRascunho() {
  return (
    <p className="alerta" style={{ background: '#fef3c7', borderColor: '#f2d27a' }}>
      <strong>Rascunho em revisão jurídica.</strong> Este texto ainda não é a versão final.
    </p>
  );
}

export function Termos() {
  return (
    <div className="pagina pilha">
      <AvisoRascunho />
      <h1 className="titulo-pagina">Termos de uso</h1>
      <section className="cartao pilha-p">
        <h2 className="secao-titulo">O que o Apto Rural faz</h2>
        <p>
          Uma pré-checagem dos impedimentos socioambientais do Manual de Crédito Rural (Capítulo 2, Seção 9), feita com bases públicas
          oficiais. Cada resultado mostra a norma, a base usada e a data de atualização da base.
        </p>
        <h2 className="secao-titulo">O que não faz</h2>
        <p>
          Não aprova crédito, não substitui a análise da instituição financeira e não é laudo técnico, parecer jurídico nem certificado de
          regularidade ambiental. Bases públicas podem conter erros ou estar desatualizadas.
        </p>
        <h2 className="secao-titulo">Créditos e pagamentos</h2>
        <p>
          Cada consulta de imóvel real usa 1 crédito de consulta; cada dossiê usa 1 crédito de dossiê. Os créditos entram após a confirmação do
          pagamento pelo meio de pagamento e não vencem. Regras de reembolso: a definir.
        </p>
      </section>
      <Link to="/privacidade">Política de privacidade</Link>
    </div>
  );
}

export function Privacidade() {
  return (
    <div className="pagina pilha">
      <AvisoRascunho />
      <h1 className="titulo-pagina">Política de privacidade</h1>
      <section className="cartao pilha-p">
        <h2 className="secao-titulo">Dados da sua conta</h2>
        <p>Nome, e-mail, WhatsApp (opcional) e profissão, para operar a conta e falar com você. A senha é guardada só como hash.</p>
        <h2 className="secao-titulo">Pagamentos</h2>
        <p>
          O CPF/CNPJ de cobrança vai direto ao meio de pagamento (Asaas) e não é guardado pelo Apto Rural. Não recebemos dados de cartão.
        </p>
        <h2 className="secao-titulo">CPF/CNPJ do produtor</h2>
        <p>
          Só é consultado no cadastro de empregadores do Ministério do Trabalho quando você declara que o produtor autorizou. Guardamos apenas
          um código irreversível (hash com chave), nunca o número.
        </p>
        <h2 className="secao-titulo">Imóveis consultados</h2>
        <p>
          O código do CAR, o contorno enviado e o resultado ficam guardados para que o relatório possa ser conferido depois pelo código QR.
        </p>
        <h2 className="secao-titulo">Base legal, prazos de guarda e contato do encarregado</h2>
        <p>A definir com assessoria jurídica.</p>
      </section>
    </div>
  );
}
