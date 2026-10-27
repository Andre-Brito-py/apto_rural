import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { buscar } from '../ajuda/busca';
import { CATEGORIAS, PERGUNTAS, type CategoriaId, type Pergunta } from '../ajuda/conteudo';
import { abrirAjuda, iniciarTour } from '../ajuda/eventos';
import { Icone, type NomeIcone } from '../componentes/Icones';
import { useSessao } from '../sessao';

/** Página de ajuda: as mesmas respostas do chat, todas à vista e com busca. */

const ICONES: Record<CategoriaId, NomeIcone> = {
  comecar: 'seta',
  consulta: 'busca',
  arquivo: 'mapa',
  resultado: 'check',
  mapa: 'camadas',
  dossie: 'documento',
  explicacao: 'conversa',
  carteira: 'sino',
  lote: 'camadas',
  creditos: 'banco',
  equipe: 'pessoas',
  conta: 'chave',
  bases: 'escudo',
};

export function Ajuda() {
  const { sessao } = useSessao();
  const { hash } = useLocation();
  const [busca, setBusca] = useState('');

  // /ajuda#id-da-pergunta abre aquela resposta (e sai da busca, para a lista completa aparecer).
  useEffect(() => {
    if (hash) setBusca('');
  }, [hash]);

  const achados = useMemo(() => (busca.trim() ? buscar(busca, 8).map((a) => a.pergunta) : null), [busca]);

  useEffect(() => {
    if (!hash || achados) return;
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (el instanceof HTMLDetailsElement) el.open = true;
    el?.scrollIntoView({ block: 'start' });
  }, [hash, achados]);

  return (
    <div className="pagina pagina-media pilha ajuda-pagina">
      <div className="topo-pagina ajuda-capa">
        <p className="sobretitulo">Central de ajuda</p>
        <h1 className="titulo-pagina">Como podemos ajudar?</h1>
        <p className="subtitulo">Respostas para as dúvidas mais comuns sobre consultas, arquivos, resultado, créditos e conta.</p>
        <label className="ajuda-busca">
          <Icone nome="busca" className="ajuda-busca-icone" />
          <span className="so-leitor">Buscar na ajuda</span>
          <input
            className="entrada"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Ex.: shapefile, embargo, créditos, senha"
            autoComplete="off"
          />
        </label>
        <div className="ajuda-acoes">
          <button type="button" className="botao botao-primario botao-pequeno" onClick={() => abrirAjuda()}>
            <Icone nome="conversa" className="l-icone-p" /> Perguntar no chat
          </button>
          {sessao && (
            <button type="button" className="botao botao-secundario botao-pequeno" onClick={iniciarTour}>
              <Icone nome="olho" className="l-icone-p" /> Ver o tour de novo
            </button>
          )}
        </div>
      </div>

      {achados ? (
        <section aria-live="polite" className="pilha-p">
          <h2 className="secao-titulo">{achados.length ? `Resultados para "${busca.trim()}"` : 'Nada encontrado'}</h2>
          {achados.length ? (
            <div className="ajuda-lista">{achados.map((p) => <ItemPergunta key={p.id} p={p} />)}</div>
          ) : (
            <p className="fonte-suave">
              Tente outras palavras, como "embargo", "shapefile" ou "créditos", ou{' '}
              <button type="button" className="link-botao" onClick={() => abrirAjuda()}>
                pergunte no chat
              </button>
              .
            </p>
          )}
        </section>
      ) : (
        <>
          <nav className="ajuda-assuntos-grade" aria-label="Assuntos">
            {CATEGORIAS.map((c) => (
              <a key={c.id} href={`#assunto-${c.id}`} className="ajuda-assunto">
                <span className="ajuda-assunto-icone" aria-hidden="true">
                  <Icone nome={ICONES[c.id]} />
                </span>
                <span>
                  <strong>{c.nome}</strong>
                  <small>{c.resumo}</small>
                </span>
              </a>
            ))}
          </nav>

          {CATEGORIAS.map((c) => (
            <section key={c.id} id={`assunto-${c.id}`} className="pilha-p ajuda-grupo">
              <h2 className="secao-titulo">{c.nome}</h2>
              <div className="ajuda-lista">
                {PERGUNTAS.filter((p) => p.categoria === c.id).map((p) => (
                  <ItemPergunta key={p.id} p={p} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      <div className="cartao ajuda-fim">
        <strong>Não achou o que precisava?</strong>
        <p className="fonte-suave">
          Veja as <Link to="/fontes">regras e fontes</Link> que o sistema usa, ou escreva sua dúvida no chat com as suas palavras.
        </p>
      </div>
    </div>
  );
}

function ItemPergunta({ p }: { p: Pergunta }) {
  return (
    <details className="ajuda-item" id={p.id}>
      <summary>{p.pergunta}</summary>
      <div className="ajuda-item-resposta">
        {p.resposta.map((r, i) => (
          <p key={i}>{r}</p>
        ))}
        {p.links && (
          <div className="ajuda-links">
            {p.links.map((l) => (
              <Link key={l.para} to={l.para} className="ajuda-link">
                {l.rotulo} <Icone nome="seta" className="l-icone-p" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
