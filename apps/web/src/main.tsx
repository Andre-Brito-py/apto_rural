import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { capturarErrosGlobais } from './relatarErro';
import { ProvedorSessao } from './sessao';
// Fonte Inter (licença OFL) servida pelo próprio site: sem Google Fonts, a política de segurança continua "só o próprio site".
// O navegador baixa só o trecho de caracteres usado (latim, com acentos).
import '@fontsource-variable/inter';
import './estilo.css';

capturarErrosGlobais();

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <BrowserRouter>
      <ProvedorSessao>
        <App />
      </ProvedorSessao>
    </BrowserRouter>
  </StrictMode>,
);
