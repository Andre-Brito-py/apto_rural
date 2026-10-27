import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { buscar, normalizar, perguntasDaCategoria, relacionadas, sugestoesDaTela } from '../ajuda/busca';
import { CATEGORIAS, PERGUNTAS, type CategoriaId, type Pergunta } from '../ajuda/conteudo';
import { aoAbrirAjuda, iniciarTour } from '../ajuda/eventos';
import { useSessao } from '../sessao';
import { Icone } from './Icones';

/**
 * Central de ajuda com cara de chat, mas com respostas prontas (ajuda/conteudo.ts): não usa
 * IA nem chama a API, então responde na hora e não custa nada. A busca entende a dúvida
 * escrita com as próprias palavras (ajuda/busca.ts). docs/central-de-ajuda.md
 */

type Mensagem =
  | { id: number; de: 'voce'; texto: string }
  | { id: number; de: 'robo'; tipo: 'texto'; texto: string }
  | { id: number; de: 'robo'; tipo: 'resposta'; pergunta: Pergunta }
  | { id: number; de: 'robo'; tipo: 'opcoes'; titulo?: string; perguntas: Pergunta[]; assuntos?: boolean }
  | { id: number; de: 'robo'; tipo: 'assuntos' }
  | { id: number; de: 'robo'; tipo: 'nada' };

type NovaMensagem = Mensagem extends infer M ? (M extends Mensagem ? Omit<M, 'id'> : never) : never;

const ESPERA_MS = 420;
const SAUDACAO = /^(oi+|ola|opa|bom dia|boa tarde|boa noite|e ai|obrigad[oa]|valeu)( .{0,12})?$/;
let proximoId = 1;

export function CentralAjuda() {
  const { sessao } = useSessao();
  const { pathname } = useLocation();
  const [aberta, setAberta] = useState(false);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [digitando, setDigitando] = useState(false);
  const [texto, setTexto] = useState('');
  const botao = useRef<HTMLButtonElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const espera = useRef<number>();

  const nome = sessao?.usuario.nome.split(' ')[0];

  const inicio = useCallback(
    (): Mensagem[] => [
      { id: proximoId++, de: 'robo', tipo: 'texto', texto: `Oi${nome ? `, ${nome}` : ''}! Sou a ajuda do Apto Rural. Escolha uma dúvida ou escreva com as suas palavras.` },
      { id: proximoId++, de: 'robo', tipo: 'opcoes', titulo: 'Dúvidas comuns nesta tela', perguntas: sugestoesDaTela(pathname), assuntos: true },
    ],
    [nome, pathname],
  );

  const adicionar = useCallback((...novas: NovaMensagem[]) => {
    setMensagens((m) => [...m, ...novas.map((n) => ({ ...n, id: proximoId++ }) as Mensagem)]);
  }, []);

  /** A resposta chega depois de um instante, como num chat. */
  const responder = useCallback(
    (...novas: NovaMensagem[]) => {
      window.clearTimeout(espera.current);
      setDigitando(true);
      espera.current = window.setTimeout(() => {
        setDigitando(false);
        adicionar(...novas);
      }, ESPERA_MS);
    },
    [adicionar],
  );

  const escolherPergunta = useCallback(
    (p: Pergunta) => {
      adicionar({ de: 'voce', texto: p.pergunta });
      const outras = relacionadas(p);
      responder({ de: 'robo', tipo: 'resposta', pergunta: p }, { de: 'robo', tipo: 'opcoes', titulo: 'Também perguntam', perguntas: outras, assuntos: true });
    },
    [adicionar, responder],
  );

  function escolherAssunto(id: CategoriaId) {
    const c = CATEGORIAS.find((x) => x.id === id)!;
    adicionar({ de: 'voce', texto: c.nome });
    responder({ de: 'robo', tipo: 'opcoes', titulo: c.resumo, perguntas: perguntasDaCategoria(id), assuntos: true });
  }

  function verAssuntos() {
    adicionar({ de: 'voce', texto: 'Ver todos os assuntos' });
    responder({ de: 'robo', tipo: 'assuntos' });
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    const duvida = texto.trim();
    if (!duvida) return;
    setTexto('');
    adicionar({ de: 'voce', texto: duvida });
    if (SAUDACAO.test(normalizar(duvida))) {
      responder({ de: 'robo', tipo: 'texto', texto: 'Olá! Escreva a sua dúvida (por exemplo: "como envio o shapefile?") ou escolha um assunto.' }, { de: 'robo', tipo: 'assuntos' });
      return;
    }
    const [melhor, ...outros] = buscar(duvida);
    if (!melhor) {
      responder({ de: 'robo', tipo: 'nada' });
      return;
    }
    responder(
      { de: 'robo', tipo: 'resposta', pergunta: melhor.pergunta },
      outros.length
        ? { de: 'robo', tipo: 'opcoes', titulo: 'Não era isso? Talvez seja:', perguntas: outros.map((o) => o.pergunta), assuntos: true }
        : { de: 'robo', tipo: 'opcoes', perguntas: relacionadas(melhor.pergunta), titulo: 'Também perguntam', assuntos: true },
    );
  }

  function abrir(perguntaId?: string) {
    setAberta(true);
    setMensagens((m) => (m.length ? m : inicio()));
    const p = perguntaId && PERGUNTAS.find((x) => x.id === perguntaId);
    if (p) window.setTimeout(() => escolherPergunta(p), 0);
  }

  function fechar() {
    setAberta(false);
    botao.current?.focus();
  }

  function recomecar() {
    window.clearTimeout(espera.current);
    setDigitando(false);
    setMensagens(inicio());
  }

  // Outras telas abrem o chat (ex.: o link "Ajuda" do menu ou uma pergunta da página de ajuda).
  const abrirRef = useRef(abrir);
  abrirRef.current = abrir;
  useEffect(() => aoAbrirAjuda((id) => abrirRef.current(id)), []);

  useEffect(() => {
    if (!aberta) return;
    entrada.current?.focus({ preventScroll: true });
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberta]);

  // A conversa sempre mostra a última mensagem.
  useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensagens, digitando, aberta]);

  useEffect(() => () => window.clearTimeout(espera.current), []);

  // No dossiê (documento para imprimir) o botão sai do caminho.
  if (pathname.endsWith('/dossie')) return null;

  return (
    <div className="ajuda-chat nao-imprimir">
      {aberta && (
        <section className="ajuda-painel" role="dialog" aria-modal="false" aria-labelledby="ajuda-titulo">
          <header className="ajuda-topo">
            <span className="ajuda-avatar" aria-hidden="true">
              <Icone nome="conversa" />
            </span>
            <div className="ajuda-topo-texto">
              <h2 id="ajuda-titulo">Central de ajuda</h2>
              <p>Respostas na hora</p>
            </div>
            <button type="button" className="ajuda-topo-botao" onClick={recomecar} title="Recomeçar a conversa">
              Recomeçar
            </button>
            <button type="button" className="ajuda-fechar" onClick={fechar} aria-label="Fechar a ajuda">
              <Icone nome="fechar" />
            </button>
          </header>

          <div className="ajuda-conversa" ref={lista} aria-live="polite" aria-relevant="additions">
            {mensagens.map((m) =>
              m.de === 'voce' ? (
                <p key={m.id} className="ajuda-balao ajuda-voce">
                  {m.texto}
                </p>
              ) : (
                <BalaoRobo
                  key={m.id}
                  m={m}
                  escolherPergunta={escolherPergunta}
                  escolherAssunto={escolherAssunto}
                  verAssuntos={verAssuntos}
                  fechar={() => setAberta(false)}
                />
              ),
            )}
            {digitando && (
              <p className="ajuda-balao ajuda-robo ajuda-digitando" aria-label="Escrevendo a resposta">
                <span />
                <span />
                <span />
              </p>
            )}
          </div>

          <form className="ajuda-escrever" onSubmit={enviar}>
            <label htmlFor="ajuda-duvida" className="so-leitor">
              Escreva sua dúvida
            </label>
            <input
              id="ajuda-duvida"
              ref={entrada}
              className="entrada"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escreva sua dúvida…"
              autoComplete="off"
              enterKeyHint="send"
              maxLength={200}
            />
            <button type="submit" className="ajuda-enviar" aria-label="Enviar a dúvida" disabled={!texto.trim()}>
              <Icone nome="enviar" />
            </button>
          </form>
          <p className="ajuda-rodape">
            <Link to="/ajuda" onClick={() => setAberta(false)}>
              Todas as perguntas
            </Link>
            {sessao && (
              <button
                type="button"
                className="link-botao"
                onClick={() => {
                  setAberta(false);
                  iniciarTour();
                }}
              >
                Ver o tour do sistema
              </button>
            )}
          </p>
        </section>
      )}

      <button
        ref={botao}
        type="button"
        className={`ajuda-botao${aberta ? ' ajuda-botao-aberto' : ''}`}
        onClick={() => (aberta ? fechar() : abrir())}
        aria-expanded={aberta}
        aria-label={aberta ? 'Fechar a ajuda' : 'Abrir a central de ajuda'}
        data-tour="ajuda"
      >
        <Icone nome={aberta ? 'fechar' : 'conversa'} />
        {!aberta && <span className="ajuda-botao-texto">Dúvidas?</span>}
      </button>
    </div>
  );
}

function BalaoRobo({
  m,
  escolherPergunta,
  escolherAssunto,
  verAssuntos,
  fechar,
}: {
  m: Exclude<Mensagem, { de: 'voce' }>;
  escolherPergunta: (p: Pergunta) => void;
  escolherAssunto: (c: CategoriaId) => void;
  verAssuntos: () => void;
  fechar: () => void;
}) {
  switch (m.tipo) {
    case 'texto':
      return <p className="ajuda-balao ajuda-robo">{m.texto}</p>;
    case 'resposta':
      return (
        <div className="ajuda-balao ajuda-robo ajuda-resposta">
          <strong>{m.pergunta.pergunta}</strong>
          {m.pergunta.resposta.map((r, i) => (
            <p key={i}>{r}</p>
          ))}
          {m.pergunta.links && (
            <div className="ajuda-links">
              {m.pergunta.links.map((l) => (
                <Link key={l.para} to={l.para} onClick={fechar} className="ajuda-link">
                  {l.rotulo} <Icone nome="seta" className="l-icone-p" />
                </Link>
              ))}
            </div>
          )}
        </div>
      );
    case 'opcoes':
      return (
        <div className="ajuda-opcoes">
          {m.titulo && <p className="ajuda-opcoes-titulo">{m.titulo}</p>}
          {m.perguntas.map((p) => (
            <button key={p.id} type="button" className="ajuda-chip" onClick={() => escolherPergunta(p)}>
              {p.pergunta}
            </button>
          ))}
          {m.assuntos && (
            <button type="button" className="ajuda-chip ajuda-chip-assuntos" onClick={verAssuntos}>
              <Icone nome="camadas" className="l-icone-p" /> Ver todos os assuntos
            </button>
          )}
        </div>
      );
    case 'assuntos':
      return (
        <div className="ajuda-opcoes">
          <p className="ajuda-opcoes-titulo">Sobre o que é a sua dúvida?</p>
          <div className="ajuda-assuntos">
            {CATEGORIAS.map((c) => (
              <button key={c.id} type="button" className="ajuda-chip" onClick={() => escolherAssunto(c.id)}>
                {c.nome}
              </button>
            ))}
          </div>
        </div>
      );
    case 'nada':
      return (
        <div className="ajuda-balao ajuda-robo">
          <p>Não achei uma resposta pronta para isso. Tente com outras palavras (por exemplo: "embargo", "shapefile", "créditos") ou escolha um assunto.</p>
          <div className="ajuda-links">
            <button type="button" className="ajuda-link link-botao" onClick={verAssuntos}>
              Ver os assuntos <Icone nome="seta" className="l-icone-p" />
            </button>
            <Link to="/ajuda" onClick={fechar} className="ajuda-link">
              Todas as perguntas <Icone nome="seta" className="l-icone-p" />
            </Link>
          </div>
        </div>
      );
  }
}
