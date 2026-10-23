import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { api, type Saude } from './api';
import { LimiteErro } from './componentes/LimiteErro';
import { Carteira } from './paginas/Carteira';
import { Consulta } from './paginas/Consulta';
import { Conta } from './paginas/Conta';
import { Dossie } from './paginas/Dossie';
import { Entrar } from './paginas/Entrar';
import { Fontes } from './paginas/Fontes';
import { Privacidade, Termos } from './paginas/Legal';
import { PagamentoSimulado } from './paginas/PagamentoSimulado';
import { Planos } from './paginas/Planos';
import { Resultado } from './paginas/Resultado';
import { AvisoConfirmarEmail, ConfirmarEmail, EsqueciSenha, RedefinirSenha } from './paginas/Senha';
import { useSessao } from './sessao';
import { contagem } from './textos';

export function App() {
  const [saude, setSaude] = useState<Saude | null>(null);
  const { sessao, carregando } = useSessao();

  useEffect(() => {
    api.saude().then(setSaude).catch(() => setSaude(null));
  }, []);

  return (
    <>
      <header className="cabecalho">
        <div className="cabecalho-dentro">
          <Link to="/" className="marca">
            <img src="/icone.svg" alt="" />
            Apto Rural
          </Link>
          <nav className="nav" aria-label="Principal">
            <NavLink to="/" end className="so-largo">
              Consultar
            </NavLink>
            {sessao && (
              <NavLink to="/carteira" className="so-largo">
                Carteira
              </NavLink>
            )}
            <NavLink to="/planos">Planos</NavLink>
            {!carregando &&
              (sessao ? (
                <NavLink to="/conta" className="saldo" title="Sua conta e seus créditos">
                  {contagem(sessao.saldo.consulta, 'consulta', 'consultas')}
                </NavLink>
              ) : (
                <NavLink to="/entrar">Entrar</NavLink>
              ))}
          </nav>
        </div>
      </header>

      {saude?.demo && (
        <div className="faixa-demo" role="note">
          <div className="pagina">
            <strong>Modo demonstração.</strong> Os CARs de exemplo usam dados fictícios. Nunca use este modo com clientes.
          </div>
        </div>
      )}

      <AvisoConfirmarEmail />

      <main>
        <LimiteErro>
          <Routes>
            <Route path="/" element={<Consulta saude={saude} />} />
            <Route path="/consulta/:id" element={<Resultado />} />
            <Route path="/consulta/:id/dossie" element={<Dossie />} />
            <Route path="/fontes" element={<Fontes />} />
            <Route path="/entrar" element={<Entrar />} />
            <Route path="/conta" element={<Conta />} />
            <Route path="/carteira" element={<Carteira />} />
            <Route path="/planos" element={<Planos />} />
            <Route path="/pagamento-simulado/:id" element={<PagamentoSimulado />} />
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
                  <p>
                    <Link to="/">Voltar para a consulta</Link>
                  </p>
                </div>
              }
            />
          </Routes>
        </LimiteErro>
      </main>

      <footer className="rodape">
        <p>Pré-checagem com bases públicas. Não substitui a análise da instituição financeira.</p>
        <p className="rodape-links">
          <Link to="/fontes">Regras e fontes</Link> · <Link to="/termos">Termos</Link> · <Link to="/privacidade">Privacidade</Link>
        </p>
      </footer>
    </>
  );
}
