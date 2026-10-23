import { Component, type ReactNode } from 'react';

/** Se uma tela quebrar, o técnico vê uma saída em vez de uma página em branco. */
export class LimiteErro extends Component<{ children: ReactNode }, { erro: boolean }> {
  state = { erro: false };

  static getDerivedStateFromError() {
    return { erro: true };
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="pagina pilha">
        <p className="alerta alerta-erro" role="alert">
          Algo deu errado nesta tela.
        </p>
        <a className="botao botao-secundario" href="/">
          Voltar para a consulta
        </a>
      </div>
    );
  }
}
