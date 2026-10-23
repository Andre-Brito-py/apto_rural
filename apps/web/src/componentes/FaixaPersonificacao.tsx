import { api } from '../api';
import { useSessao } from '../sessao';

/** Aviso fixo no modo "entrar como": deixa claro que é só leitura e como sair. */
export function FaixaPersonificacao() {
  const { sessao } = useSessao();
  if (!sessao?.personificadoPor) return null;

  async function voltar() {
    const r = await api.admin.voltar();
    window.location.assign(r.voltarPara);
  }

  return (
    <div className="faixa-personificacao" role="status">
      <div className="pagina">
        <strong>Modo visualização:</strong> você ({sessao.personificadoPor.email}) está vendo a conta de <strong>{sessao.usuario.nome}</strong>. Nada
        pode ser alterado.{' '}
        <button type="button" className="botao botao-claro" onClick={voltar}>
          Voltar ao painel
        </button>
      </div>
    </div>
  );
}
