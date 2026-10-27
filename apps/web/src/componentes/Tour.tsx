import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { aoIniciarTour } from '../ajuda/eventos';
import { api } from '../api';
import { useSessao } from '../sessao';
import { Icone, type NomeIcone } from './Icones';

/**
 * Tour de boas-vindas: na primeira entrada, destaca as partes principais da tela de
 * consulta, uma por vez. Pular ou terminar marca como visto na conta (POST /v1/conta/tour),
 * então não volta em outro aparelho. Dá para ver de novo pela Central de ajuda.
 * Cada passo aponta para um elemento com data-tour="…"; se ele não estiver na tela,
 * o passo aparece no meio, sem destaque.
 */

interface Passo {
  alvo?: string;
  icone: NomeIcone;
  titulo: string;
  texto: string;
}

const PASSOS: Passo[] = [
  {
    icone: 'escudo',
    titulo: 'Boas-vindas ao Apto Rural',
    texto: 'Em menos de 1 minuto, mostramos o essencial para checar se um imóvel passa no crédito rural, com as bases oficiais que o banco usa.',
  },
  {
    alvo: 'car',
    icone: 'documento',
    titulo: 'Comece pelo código do CAR',
    texto: 'Cole o código do recibo do CAR, com ou sem os pontos. Depois, marque a situação que aparece no demonstrativo.',
  },
  {
    alvo: 'arquivo',
    icone: 'mapa',
    titulo: 'Envie o contorno do imóvel',
    texto: 'O shapefile (.zip) que sai do Sicar, KML ou GeoJSON. Com ele, cruzamos o imóvel com embargos, terras indígenas, UCs e florestas públicas.',
  },
  {
    alvo: 'consultar',
    icone: 'check',
    titulo: 'Veja o resultado item por item',
    texto: 'Em segundos: o semáforo de cada item do MCR, o mapa do entorno, as saídas que a norma admite e o dossiê para levar ao banco.',
  },
  {
    alvo: 'lote',
    icone: 'camadas',
    titulo: 'Muitos imóveis? Use o lote',
    texto: 'Envie uma planilha com até 200 códigos do CAR e os arquivos, todos de uma vez. No fim, baixe o resultado em planilha.',
  },
  {
    alvo: 'carteira',
    icone: 'sino',
    titulo: 'Acompanhe na carteira',
    texto: 'Guarde os imóveis dos clientes: reconferimos todo dia e avisamos por e-mail se surgir um embargo ou mudar o CAR. O menu leva a todas as telas.',
  },
  {
    alvo: 'saldo',
    icone: 'chave',
    titulo: 'Seus créditos e sua conta',
    texto: 'Aqui está o saldo de consultas. Clique para ver a conta, as compras e os seus dados. Planos e preços ficam em "Planos".',
  },
  {
    alvo: 'ajuda',
    icone: 'conversa',
    titulo: 'Ficou com dúvida? É só clicar',
    texto: 'A Central de ajuda responde na hora as dúvidas mais comuns, de qualquer tela. Por ela, você também pode ver este tour de novo.',
  },
];

const MARGEM = 8;

/** O primeiro elemento visível com aquele data-tour (o menu do celular e o do computador têm o mesmo). */
function acharAlvo(alvo?: string): HTMLElement | null {
  if (!alvo) return null;
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${alvo}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el;
  }
  return null;
}

export function Tour() {
  const { sessao, definir } = useSessao();
  const { pathname } = useLocation();
  const navegar = useNavigate();
  const [passo, setPasso] = useState<number | null>(null);
  const [caixa, setCaixa] = useState<DOMRect | null>(null);
  const [, redesenhar] = useState(0);
  const proximo = useRef<HTMLButtonElement>(null);
  const jaComecou = useRef(false);

  const naConsulta = pathname === '/' || pathname === '/consultar';

  const comecar = useCallback(() => {
    if (!naConsulta) navegar('/consultar');
    // Espera a tela de consulta desenhar antes do primeiro destaque.
    window.setTimeout(() => setPasso(0), naConsulta ? 0 : 250);
  }, [naConsulta, navegar]);

  // Primeira entrada: começa sozinho (nunca no modo "entrar como" do suporte).
  useEffect(() => {
    if (jaComecou.current || !sessao || sessao.usuario.tourVisto || sessao.personificadoPor || !naConsulta) return;
    jaComecou.current = true;
    const t = window.setTimeout(() => setPasso(0), 700);
    return () => window.clearTimeout(t);
  }, [sessao, naConsulta]);

  const comecarRef = useRef(comecar);
  comecarRef.current = comecar;
  useEffect(() => aoIniciarTour(() => comecarRef.current()), []);

  const encerrar = useCallback(() => {
    setPasso(null);
    setCaixa(null);
    if (sessao && !sessao.usuario.tourVisto && !sessao.personificadoPor) {
      api.marcarTour().catch(() => undefined);
      definir({ ...sessao, usuario: { ...sessao.usuario, tourVisto: true } });
    }
  }, [sessao, definir]);

  // Saiu da tela de consulta no meio do tour: encerra.
  useEffect(() => {
    if (passo != null && !naConsulta) encerrar();
  }, [naConsulta, passo, encerrar]);

  const atual = passo != null ? PASSOS[passo] : undefined;

  // Leva o alvo para o meio da tela e mede onde ele ficou.
  useLayoutEffect(() => {
    if (!atual) return;
    const el = acharAlvo(atual.alvo);
    if (!el) {
      setCaixa(null);
      return;
    }
    const fixo = getComputedStyle(el).position === 'fixed' || el.closest('.cabecalho, .ajuda-chat');
    if (!fixo) el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    setCaixa(el.getBoundingClientRect());
    // Mede de novo quando a rolagem termina (alguns navegadores rolam suave mesmo pedindo 'instant').
    const t = window.setTimeout(() => setCaixa(el.getBoundingClientRect()), 400);
    return () => window.clearTimeout(t);
  }, [atual]);

  // Acompanha rolagem e mudança de tamanho da janela.
  useEffect(() => {
    if (!atual) return;
    const medir = () => {
      const el = acharAlvo(atual.alvo);
      setCaixa(el ? el.getBoundingClientRect() : null);
      redesenhar((n) => n + 1);
    };
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, { passive: true });
    return () => {
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir);
    };
  }, [atual]);

  useEffect(() => {
    if (passo == null) return;
    proximo.current?.focus({ preventScroll: true });
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') encerrar();
      else if (e.key === 'ArrowRight') setPasso((p) => (p != null && p < PASSOS.length - 1 ? p + 1 : p));
      else if (e.key === 'ArrowLeft') setPasso((p) => (p ? p - 1 : p));
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [passo, encerrar]);

  if (passo == null || !atual) return null;

  const ultimo = passo === PASSOS.length - 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const largura = Math.min(360, vw - 24);

  let estiloCartao: CSSProperties;
  if (!caixa) {
    estiloCartao = { width: largura, left: (vw - largura) / 2, top: Math.max(24, vh / 2 - 150) };
  } else {
    const esquerda = Math.min(Math.max(12, caixa.left + caixa.width / 2 - largura / 2), vw - largura - 12);
    const embaixo = vh - caixa.bottom;
    if (embaixo >= 240) estiloCartao = { width: largura, left: esquerda, top: caixa.bottom + MARGEM + 10 };
    else if (caixa.top >= 260) estiloCartao = { width: largura, left: esquerda, bottom: vh - caixa.top + MARGEM + 10 };
    else estiloCartao = { width: largura, left: esquerda, bottom: 12 };
  }

  return (
    <div className="tour nao-imprimir">
      <div className="tour-bloqueio" onClick={(e) => e.stopPropagation()} />
      {caixa ? (
        <div
          className="tour-destaque"
          style={{ top: caixa.top - MARGEM, left: caixa.left - MARGEM, width: caixa.width + MARGEM * 2, height: caixa.height + MARGEM * 2 }}
        />
      ) : (
        <div className="tour-fundo" />
      )}
      <section className="tour-cartao" style={estiloCartao} role="dialog" aria-modal="true" aria-labelledby="tour-titulo" aria-describedby="tour-texto">
        <div className="tour-cartao-topo">
          <span className="tour-icone" aria-hidden="true">
            <Icone nome={atual.icone} />
          </span>
          <span className="tour-contagem">
            Passo {passo + 1} de {PASSOS.length}
          </span>
          <button type="button" className="tour-pular" onClick={encerrar}>
            Pular tour
          </button>
        </div>
        <h2 id="tour-titulo">{passo === 0 && sessao ? `${atual.titulo}, ${sessao.usuario.nome.split(' ')[0]}!` : atual.titulo}</h2>
        <p id="tour-texto">{atual.texto}</p>
        <div className="tour-pontos" aria-hidden="true">
          {PASSOS.map((_, i) => (
            <span key={i} className={i === passo ? 'ativo' : i < passo ? 'feito' : ''} />
          ))}
        </div>
        <div className="tour-botoes">
          {passo > 0 && (
            <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => setPasso(passo - 1)}>
              Anterior
            </button>
          )}
          <button
            ref={proximo}
            type="button"
            className="botao botao-primario botao-pequeno"
            onClick={() => (ultimo ? encerrar() : setPasso(passo + 1))}
          >
            {ultimo ? 'Começar a usar' : passo === 0 ? 'Mostrar' : 'Próximo'}
          </button>
        </div>
      </section>
    </div>
  );
}
