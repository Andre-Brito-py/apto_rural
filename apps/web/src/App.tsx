import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { api, type Saude } from './api';
import { FaixaPersonificacao } from './componentes/FaixaPersonificacao';
import { LimiteErro } from './componentes/LimiteErro';
import { Admin } from './paginas/Admin';
import { AdminUsuario } from './paginas/AdminUsuario';
import { Carteira } from './paginas/Carteira';
import { Consulta } from './paginas/Consulta';
import { Conta } from './paginas/Conta';
import { Dossie } from './paginas/Dossie';
import { Entrar } from './paginas/Entrar';
import { Fontes } from './paginas/Fontes';
import { Landing } from './paginas/Landing';
import { Privacidade, Termos } from './paginas/Legal';
import { MensalidadeSimulada, PagamentoSimulado } from './paginas/PagamentoSimulado';
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
      <FaixaPersonificacao />

      <header className="cabecalho">
        <div className="cabecalho-dentro">
          <Link to="/" className="marca">
            <img src="/icone.svg" alt="" />
            Apto Rural
          </Link>
          <nav className="nav" aria-label="Principal">
            <NavLink to="/consultar" className="so-largo">
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
            <Route path="/consulta/:id" element={<Resultado />} />
            <Route path="/consulta/:id/dossie" element={<Dossie />} />
            <Route path="/fontes" element={<Fontes />} />
            <Route path="/entrar" element={<Entrar />} />
            <Route path="/conta" element={<Conta />} />
            <Route path="/carteira" element={<Carteira />} />
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
