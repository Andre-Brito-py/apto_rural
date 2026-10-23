import { useEffect, useState } from 'react';
import { api, type CatalogoRegras } from '../api';
import { dataBr } from '../textos';

/** Transparência: cada regra, o ato que a criou e a base pública usada. */
export function Fontes() {
  const [catalogo, setCatalogo] = useState<CatalogoRegras | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api.regras().then(setCatalogo).catch((e: Error) => setErro(e.message));
  }, []);

  return (
    <div className="pagina pilha">
      <div className="pilha-p">
        <h1 className="titulo-pagina">Regras e fontes</h1>
        <p className="subtitulo">
          Cada item segue o Manual de Crédito Rural, Capítulo 2, Seção 9, na redação das Resoluções CMN 5.193/2024, 5.268/2025 e 5.303/2026.
        </p>
      </div>

      {erro && (
        <p className="alerta alerta-erro" role="alert">
          {erro}
        </p>
      )}

      {catalogo && (
        <ul className="itens">
          {catalogo.regras.map((r) => (
            <li key={r.id} className="cartao pilha-p">
              <h2 className="secao-titulo">{r.titulo}</h2>
              <p>{r.pergunta}</p>
              <div className="fonte-linha">
                <span className="fonte-rotulo">Regra</span>
                <span>
                  {r.normas.map((n, i) => (
                    <span key={n.item}>
                      {i > 0 && ' · '}
                      <a href={n.url} target="_blank" rel="noreferrer">
                        {n.item}
                      </a>{' '}
                      <span className="fonte-suave">({n.ato})</span>
                    </span>
                  ))}
                </span>
              </div>
              {r.fontes.map((f) => {
                const fonte = catalogo.fontes[f];
                const data = catalogo.atualizacoes[f];
                return (
                  <div key={f} className="fonte-linha">
                    <span className="fonte-rotulo">Base</span>
                    <span>
                      <a href={fonte.url} target="_blank" rel="noreferrer">
                        {fonte.nome}
                      </a>{' '}
                      — {fonte.orgao}.{' '}
                      <span className="fonte-suave">
                        {f === 'car_demonstrativo' ? 'Informada pelo técnico.' : data ? `Atualizada em ${dataBr(data)}.` : 'Ainda não carregada.'}
                      </span>
                    </span>
                  </div>
                );
              })}
            </li>
          ))}
        </ul>
      )}

      <p className="avisos">
        Segundo o MMA, a sobreposição entre o Prodes e o CAR não configura, por si só, presunção de ilegalidade ou infração ambiental.
        Dados do Prodes podem ser contestados no Inpe, pelo Programa BiomasBR.
      </p>
    </div>
  );
}
