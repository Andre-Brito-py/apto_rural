/**
 * Assinatura da marca: o símbolo (o "A" de Apto com o check no lugar do traço)
 * e o nome, "Apto" forte e "Rural" regular. Regras de uso em docs/marca.md.
 */
export function Marca({ tamanho = 30 }: { tamanho?: number }) {
  return (
    <>
      <img src="/icone.svg" alt="" width={tamanho} height={tamanho} />
      <span className="marca-nome">
        <b>Apto</b> Rural
      </span>
    </>
  );
}
