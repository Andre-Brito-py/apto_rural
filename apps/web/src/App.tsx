import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { api, type Saude } from './api';
import { LimiteErro } from './componentes/LimiteErro';
import { Consulta } from './paginas/Consulta';
import { Dossie } from './paginas/Dossie';
import { Fontes } from './paginas/Fontes';
import { Resultado } from './paginas/Resultado';

export function App() {
  const [saude, setSaude] = useState<Saude | null>(null);

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
            <NavLink to="/" end>
              Consultar
            </NavLink>
            <NavLink to="/fontes">Regras</NavLink>
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

      <main>
        <LimiteErro>
          <Routes>
            <Route path="/" element={<Consulta saude={saude} />} />
            <Route path="/consulta/:id" element={<Resultado />} />
            <Route path="/consulta/:id/dossie" element={<Dossie />} />
            <Route path="/fontes" element={<Fontes />} />
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
        Pré-checagem com bases públicas. Não substitui a análise da instituição financeira.
      </footer>
    </>
  );
}
