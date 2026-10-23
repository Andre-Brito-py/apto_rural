import { FONTES, type FonteId, type ResultadoItem } from '@apto/regras';
import { dataBr } from '../textos';
import { SeloStatus } from './SeloStatus';

interface Props {
  item: ResultadoItem;
  atualizacoes: Partial<Record<FonteId, string>>;
}

export function ItemResultado({ item, atualizacoes }: Props) {
  const temMais = item.detalhes.length > 0 || item.caminhos.length > 0;
  const abrir = item.status === 'impedimento' || item.status === 'atencao';

  return (
    <li className={`item b-${item.status}`}>
      <div className="item-topo">
        <h3>{item.titulo}</h3>
        <SeloStatus status={item.status} />
      </div>
      <p className="item-resumo">{item.resumo}</p>

      {temMais && (
        <details open={abrir}>
          <summary>{item.caminhos.length > 0 ? 'Detalhes e caminhos de saída' : 'Detalhes'}</summary>
          {item.detalhes.length > 0 && (
            <ul className="lista-simples">
              {item.detalhes.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          {item.caminhos.length > 0 && (
            <>
              <p style={{ marginTop: 12, fontWeight: 650 }}>O que as regras permitem fazer</p>
              <ul className="caminhos">
                {item.caminhos.map((c) => (
                  <li key={c.titulo} className="caminho">
                    <strong>{c.titulo}</strong>
                    <span>{c.descricao}</span>
                    {c.requisitos && (
                      <ul className="lista-simples">
                        {c.requisitos.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    )}
                    {c.verificacao && (
                      <p className={`verificacao ${c.verificacao.atende === true ? 'sim' : c.verificacao.atende === false ? 'nao' : 'talvez'}`}>
                        {c.verificacao.atende === true ? '✓ ' : c.verificacao.atende === false ? '✕ ' : '? '}
                        {c.verificacao.texto}
                      </p>
                    )}
                    {c.norma && (
                      <a className="norma" href={c.norma.url} target="_blank" rel="noreferrer">
                        {c.norma.item} · {c.norma.ato}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}

      <p className="item-fonte">
        {item.fontes.map((f) => (
          <span key={f}>
            Fonte: {FONTES[f].orgao}
            {atualizacoes[f] ? `, atualizada em ${dataBr(atualizacoes[f])}` : ''}.{' '}
          </span>
        ))}
        Regra:{' '}
        {item.normas.map((n, i) => (
          <span key={n.item}>
            {i > 0 && ', '}
            <a href={n.url} target="_blank" rel="noreferrer">
              {n.item}
            </a>
          </span>
        ))}
        .
      </p>
    </li>
  );
}
