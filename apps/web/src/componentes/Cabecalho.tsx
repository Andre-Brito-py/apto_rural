import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { abrirAjuda } from '../ajuda/eventos';
import { useSessao } from '../sessao';
import { contagem } from '../textos';
import { Icone, type NomeIcone } from './Icones';
import { Marca } from './Marca';

/**
 * Cabeçalho fixo. No computador, os links principais ficam à vista; em telas menores, eles
 * vão para o botão "Menu", que abre a lista completa de telas, agrupada pelo que a pessoa
 * quer fazer. O saldo (ou Entrar / Criar conta) fica sempre à vista.
 */
export function Cabecalho() {
  const { sessao, carregando, sair } = useSessao();
  const { pathname, search } = useLocation();
  const navegar = useNavigate();
  const [menuAberto, setMenuAberto] = useState(false);
  const botaoMenu = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);

  // Trocou de tela: o menu fecha.
  useEffect(() => setMenuAberto(false), [pathname, search]);

  useEffect(() => {
    if (!menuAberto) return;
    painel.current?.querySelector<HTMLElement>('a, button')?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuAberto(false);
        botaoMenu.current?.focus();
      }
    };
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (!painel.current?.contains(alvo) && !botaoMenu.current?.contains(alvo)) setMenuAberto(false);
    };
    window.addEventListener('keydown', tecla);
    document.addEventListener('mousedown', fora);
    return () => {
      window.removeEventListener('keydown', tecla);
      document.removeEventListener('mousedown', fora);
    };
  }, [menuAberto]);

  const grupos: { titulo: string; itens: { para?: string; rotulo: string; icone: NomeIcone; acao?: () => void; resumo?: string }[] }[] = [
    {
      titulo: 'Consultar',
      itens: [
        { para: '/consultar', rotulo: 'Consultar imóvel', icone: 'busca', resumo: 'Um imóvel pelo código do CAR' },
        { para: '/lote', rotulo: 'Consulta em lote', icone: 'camadas', resumo: 'Vários imóveis com uma planilha' },
      ],
    },
    ...(sessao
      ? [
          {
            titulo: 'Acompanhar',
            itens: [
              { para: '/carteira', rotulo: 'Carteira', icone: 'sino' as NomeIcone, resumo: 'Imóveis reconferidos todo dia' },
              { para: '/equipe', rotulo: 'Equipe', icone: 'pessoas' as NomeIcone, resumo: 'Pessoas do escritório' },
            ],
          },
        ]
      : []),
    {
      titulo: 'Conta',
      itens: sessao
        ? [
            { para: '/conta', rotulo: 'Minha conta', icone: 'chave', resumo: contagem(sessao.saldo.consulta, 'consulta disponível', 'consultas disponíveis') },
            { para: '/planos', rotulo: 'Planos e créditos', icone: 'banco' },
            ...(sessao.nivelAdmin || sessao.bloqueioPainel ? [{ para: '/admin', rotulo: 'Painel administrativo', icone: 'escudo' as NomeIcone }] : []),
            { rotulo: 'Sair', icone: 'sair' as NomeIcone, acao: () => void sair().then(() => navegar('/')) },
          ]
        : [
            { para: '/entrar', rotulo: 'Entrar', icone: 'chave' },
            { para: '/entrar?modo=criar', rotulo: 'Criar conta grátis', icone: 'check' },
            { para: '/planos', rotulo: 'Planos e preços', icone: 'banco' },
          ],
    },
    {
      titulo: 'Ajuda',
      itens: [
        { rotulo: 'Tirar uma dúvida agora', icone: 'conversa', acao: () => abrirAjuda(), resumo: 'Respostas prontas, na hora' },
        { para: '/ajuda', rotulo: 'Perguntas frequentes', icone: 'ajuda' },
        { para: '/fontes', rotulo: 'Regras e fontes', icone: 'documento' },
      ],
    },
  ];

  return (
    <header className="cabecalho">
      <div className="cabecalho-dentro">
        <Link to="/" className="marca" aria-label="Apto Rural, página inicial">
          <Marca />
        </Link>
        <nav className="nav" aria-label="Principal">
          <NavLink to="/consultar" className="so-largo">
            Consultar
          </NavLink>
          <NavLink to="/lote" className="so-largo">
            Em lote
          </NavLink>
          {sessao && (
            <NavLink to="/carteira" className="so-largo" data-tour="carteira">
              Carteira
            </NavLink>
          )}
          {sessao?.equipe && (
            <NavLink to="/equipe" className="so-largo">
              Equipe
            </NavLink>
          )}
          <NavLink to="/planos" className="so-largo">
            Planos
          </NavLink>
          <NavLink to="/ajuda" className="so-largo">
            Ajuda
          </NavLink>
          {/* Só para administração e suporte. */}
          {(sessao?.nivelAdmin || sessao?.bloqueioPainel) && (
            <NavLink to="/admin" className="so-largo nav-painel">
              Painel
            </NavLink>
          )}
          {!carregando &&
            (sessao ? (
              <NavLink to="/conta" className="saldo" title="Sua conta e seus créditos" data-tour="saldo">
                {contagem(sessao.saldo.consulta, 'consulta', 'consultas')}
              </NavLink>
            ) : (
              <>
                <NavLink to="/entrar" end className="so-largo-ou-medio">
                  Entrar
                </NavLink>
                <Link to="/entrar?modo=criar" className="nav-cta">
                  Criar conta
                </Link>
              </>
            ))}
          <button
            ref={botaoMenu}
            type="button"
            className="nav-menu"
            aria-expanded={menuAberto}
            aria-controls="menu-telas"
            aria-label="Menu com todas as telas"
            onClick={() => setMenuAberto((a) => !a)}
            data-tour="carteira"
          >
            <Icone nome={menuAberto ? 'fechar' : 'menu'} />
            <span>Menu</span>
          </button>
        </nav>
      </div>

      {menuAberto && (
        <div className="menu-telas" id="menu-telas" ref={painel}>
          <nav className="menu-telas-dentro" aria-label="Todas as telas">
            {grupos.map((g) => (
              <div key={g.titulo} className="menu-grupo">
                <h2>{g.titulo}</h2>
                {g.itens.map((i) =>
                  i.para ? (
                    <NavLink key={i.rotulo} to={i.para} end className="menu-item">
                      <Icone nome={i.icone} className="menu-item-icone" />
                      <span>
                        <strong>{i.rotulo}</strong>
                        {i.resumo && <small>{i.resumo}</small>}
                      </span>
                    </NavLink>
                  ) : (
                    <button
                      key={i.rotulo}
                      type="button"
                      className="menu-item"
                      onClick={() => {
                        setMenuAberto(false);
                        i.acao?.();
                      }}
                    >
                      <Icone nome={i.icone} className="menu-item-icone" />
                      <span>
                        <strong>{i.rotulo}</strong>
                        {i.resumo && <small>{i.resumo}</small>}
                      </span>
                    </button>
                  ),
                )}
              </div>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
