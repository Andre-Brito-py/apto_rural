import { useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { abrirAjuda } from './ajuda/eventos';
import { api, type Saude } from './api';
import { Cabecalho } from './componentes/Cabecalho';
import { CentralAjuda } from './componentes/CentralAjuda';
import { FaixaPersonificacao } from './componentes/FaixaPersonificacao';
import { LimiteErro } from './componentes/LimiteErro';
import { Marca } from './componentes/Marca';
import { Tour } from './componentes/Tour';
import { Admin } from './paginas/Admin';
import { Ajuda } from './paginas/Ajuda';
import { AdminUsuario } from './paginas/AdminUsuario';
import { Carteira } from './paginas/Carteira';
import { Consulta } from './paginas/Consulta';
import { Lote } from './paginas/Lote';
import { Conta } from './paginas/Conta';
import { Convite } from './paginas/Convite';
import { Dossie } from './paginas/Dossie';
import { Entrar } from './paginas/Entrar';
import { Equipe } from './paginas/Equipe';
import { Fontes } from './paginas/Fontes';
import { Landing } from './paginas/Landing';
import { Privacidade, Termos } from './paginas/Legal';
import { MensalidadeSimulada, PagamentoSimulado } from './paginas/PagamentoSimulado';
import { Planos } from './paginas/Planos';
import { Resultado } from './paginas/Resultado';
import { AvisoConfirmarEmail, ConfirmarEmail, EsqueciSenha, RedefinirSenha } from './paginas/Senha';
import { useSessao } from './sessao';

/**
 * Tela nova abre do topo. Sem isso, um link do rodapé abria a tela seguinte já rolada até
 * o fim. Voltar e avançar do navegador (POP) mantêm a posição de onde a pessoa estava.
 */
function TelaNovaNoTopo() {
  const { pathname, hash } = useLocation();
  const tipo = useNavigationType();
  useEffect(() => {
    // Com #, a própria tela rola até o trecho pedido (ex.: /ajuda#quilombolas).
    if (tipo !== 'POP' && !hash) window.scrollTo(0, 0);
    // Só quando a tela muda: trocar o filtro (?aba=) ou o # não volta ao topo.
  }, [pathname]);
  return null;
}

export function App() {
  const [saude, setSaude] = useState<Saude | null>(null);
  const { sessao, carregando } = useSessao();

  useEffect(() => {
    api.saude().then(setSaude).catch(() => setSaude(null));
  }, []);

  return (
    <>
      <TelaNovaNoTopo />
      <FaixaPersonificacao />

      <Cabecalho />

      {saude?.demo && (
        <div className="faixa-demo" role="note">
          <div className="pagina">
            <strong>Modo demonstração.</strong> Os CARs de exemplo usam dados fictícios. Nunca use este modo com clientes.
          </div>
        </div>
      )}

      {saude?.aviso && (
        <div className={`faixa-aviso faixa-aviso-${saude.aviso.tipo}`} role="status">
          <div className="pagina">{saude.aviso.texto}</div>
        </div>
      )}

      <AvisoConfirmarEmail />

      <main>
        <LimiteErro>
          <Routes>
            {/* Visitante vê a página de vendas; quem tem conta vai direto para a consulta. */}
            <Route path="/" element={carregando ? null : sessao ? <Consulta saude={saude} /> : <Landing />} />
            <Route path="/consultar" element={<Consulta saude={saude} />} />
            <Route path="/lote" element={<Lote saude={saude} />} />
            <Route path="/consulta/:id" element={<Resultado />} />
            <Route path="/consulta/:id/dossie" element={<Dossie />} />
            <Route path="/fontes" element={<Fontes />} />
            <Route path="/ajuda" element={<Ajuda />} />
            <Route path="/entrar" element={<Entrar saude={saude} />} />
            <Route path="/conta" element={<Conta />} />
            <Route path="/carteira" element={<Carteira />} />
            <Route path="/equipe" element={<Equipe />} />
            <Route path="/convite" element={<Convite />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/usuarios/:id" element={<AdminUsuario />} />
            <Route path="/planos" element={<Planos />} />
            <Route path="/pagamento-simulado/:id" element={<PagamentoSimulado />} />
            <Route path="/pagamento-simulado/assinatura/:id" element={<MensalidadeSimulada />} />
            <Route path="/confirmar-email" element={<ConfirmarEmail />} />
            <Route path="/esqueci-senha" element={<EsqueciSenha />} />
            <Route path="/redefinir-senha" element={<RedefinirSenha />} />
            <Route path="/termos" element={<Termos />} />
            <Route path="/privacidade" element={<Privacidade />} />
            <Route
              path="*"
              element={
                <div className="pagina">
                  <h1 className="titulo-pagina">Página não encontrada</h1>
                  <p className="subtitulo" style={{ marginTop: 8 }}>
                    O endereço pode ter mudado ou estar incompleto.
                  </p>
                  <div className="botoes" style={{ marginTop: 20 }}>
                    <Link to="/consultar" className="botao botao-primario">
                      Fazer uma consulta
                    </Link>
                    <Link to="/ajuda" className="botao botao-secundario">
                      Central de ajuda
                    </Link>
                  </div>
                </div>
              }
            />
          </Routes>
        </LimiteErro>
      </main>

      <footer className="rodape">
        <div className="rodape-dentro">
          <div className="rodape-marca">
            <Link to="/" className="marca" aria-label="Apto Rural, página inicial">
              <Marca />
            </Link>
            <p className="rodape-slogan">Do vermelho ao verde.</p>
            <p>Pré-checagem dos impedimentos socioambientais do crédito rural (MCR 2-9), com as bases oficiais que o banco usa.</p>
          </div>
          <nav className="rodape-colunas" aria-label="Rodapé">
            <div>
              <h2>Produto</h2>
              <Link to="/consultar">Consultar imóvel</Link>
              <Link to="/lote">Consulta em lote</Link>
              <Link to="/planos">Planos e preços</Link>
              <Link to="/fontes">Regras e fontes</Link>
            </div>
            <div>
              <h2>Conta</h2>
              {sessao ? (
                <>
                  <Link to="/conta">Minha conta</Link>
                  <Link to="/carteira">Carteira</Link>
                  <Link to="/equipe">Equipe</Link>
                </>
              ) : (
                <>
                  <Link to="/entrar">Entrar</Link>
                  <Link to="/entrar?modo=criar">Criar conta</Link>
                </>
              )}
            </div>
            <div>
              <h2>Ajuda</h2>
              <Link to="/ajuda">Central de ajuda</Link>
              <button type="button" className="rodape-link" onClick={() => abrirAjuda()}>
                Tirar uma dúvida agora
              </button>
              <Link to="/termos">Termos de uso</Link>
              <Link to="/privacidade">Privacidade</Link>
            </div>
          </nav>
        </div>
        <div className="rodape-base">
          <p>
            © {new Date().getFullYear()} Apto Rural · Pré-checagem com bases públicas. Não substitui a análise da instituição financeira.
          </p>
        </div>
      </footer>

      <CentralAjuda />
      <Tour />
    </>
  );
}
