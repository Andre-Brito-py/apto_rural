import { useEffect, useState, type FormEvent } from 'react';
import { api, type AnaliseNorma, type ConfigIA, type FuncoesIA, type PainelIA, type TarefaIA } from '../api';
import { Icone } from '../componentes/Icones';
import { numeroBr } from '../textos';
import { dataHora } from './Admin';

/** Modelos sugeridos (developers.openai.com/api/docs/pricing, 26/10/2026), do mais barato ao mais caro. */
const MODELOS = [
  { id: 'gpt-6-luna', rotulo: 'gpt-6-luna: o mais econômico (recomendado)' },
  { id: 'gpt-6.1-terra', rotulo: 'gpt-6.1-terra: rápido, cerca de 10 vezes o custo' },
  { id: 'gpt-6.1-sol', rotulo: 'gpt-6.1-sol: mais caprichado, cerca de 20 vezes o custo' },
];

/** As funções que a IA ajuda (docs/ia.md); cada uma liga e desliga sozinha. */
const FUNCOES: { chave: keyof FuncoesIA; nome: string; sem: string }[] = [
  { chave: 'explicacao', nome: 'Explicação para o produtor', sem: 'explicação montada pelas regras' },
  { chave: 'recibo', nome: 'Leitura do recibo do CAR', sem: 'só a leitura por padrões (código e situação)' },
  { chave: 'documentos', nome: 'Conferência de documentos do dossiê', sem: 'indisponível; o técnico confere pela lista' },
  { chave: 'rascunhos', nome: 'Rascunhos (carta, retificação, requerimento)', sem: 'modelo fixo para completar' },
  { chave: 'carteira', nome: 'Frase explicada no e-mail da carteira', sem: 'frase de modelo' },
  { chave: 'normas', nome: 'Análise de norma nova (só aqui no painel)', sem: 'indisponível' },
];

const NOME_TAREFA: Record<TarefaIA, string> = {
  explicacao: 'Explicações',
  recibo: 'Recibos do CAR',
  documento: 'Documentos conferidos',
  rascunho: 'Rascunhos',
  carteira: 'Frases da carteira',
  norma: 'Normas analisadas',
  teste: 'Testes da chave',
};

/**
 * Aba "Inteligência artificial" do painel (só administrador). A chave da OpenAI é
 * escrita aqui e some: a tela só mostra o final dela. Ver docs/ia.md.
 */
export function IAPainel() {
  const [dados, setDados] = useState<PainelIA | null>(null);
  const [config, setConfig] = useState<ConfigIA | null>(null);
  const [chave, setChave] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [teste, setTeste] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [ocupado, setOcupado] = useState<'' | 'chave' | 'config' | 'teste' | 'apagar'>('');

  async function carregar() {
    try {
      const d = await api.admin.ia();
      setDados(d);
      setConfig(d.configuracao);
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message });
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  async function acao(qual: typeof ocupado, fazer: () => Promise<string>) {
    setOcupado(qual);
    setAviso(null);
    try {
      setAviso({ tipo: 'ok', texto: await fazer() });
      await carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message });
    } finally {
      setOcupado('');
    }
  }

  function salvarChave(ev: FormEvent) {
    ev.preventDefault();
    void acao('chave', async () => {
      const r = await api.admin.salvarChaveIA(chave);
      setChave('');
      setTeste(null);
      return `Chave salva (termina em ${r.chave.final}). Use "Testar a chave" para conferir.`;
    });
  }

  function salvarConfig(ev: FormEvent) {
    ev.preventDefault();
    if (!config) return;
    void acao('config', async () => {
      await api.admin.salvarConfiguracao('ia', config);
      return config.ativo ? 'Configuração salva. As funções marcadas já usam a IA.' : 'Configuração salva. A IA está desligada.';
    });
  }

  async function testar() {
    setOcupado('teste');
    setTeste(null);
    try {
      setTeste(await api.admin.testarIA());
      await carregar();
    } catch (e) {
      setTeste({ ok: false, mensagem: (e as Error).message });
    } finally {
      setOcupado('');
    }
  }

  if (!dados || !config) return <p className="ajuda">{aviso?.texto ?? 'Carregando…'}</p>;
  const { chave: info, uso } = dados;
  const ligada = dados.configuracao.ativo && info.definida;
  const outroModelo = !MODELOS.some((m) => m.id === config.modelo);

  return (
    <div className="pilha ia-painel">
      <section className="cartao ia-situacao">
        <span className="l-icone-caixa" aria-hidden="true">
          <Icone nome="conversa" />
        </span>
        <div>
          <h2 className="secao-titulo">Apoio por IA</h2>
          <p className="ajuda" style={{ marginTop: 2 }}>
            A IA explica, lê documentos e escreve rascunhos a partir do que as regras decidiram. Ela nunca muda o resultado da
            consulta, e toda resposta passa por uma conferência automática; sem ela, cada função tem um plano B.
          </p>
        </div>
        <span className={`selo ${ligada ? 's-sem_impedimento' : 's-nao_verificado'}`}>
          {ligada ? 'IA ligada' : !info.definida ? 'Sem chave' : 'IA desligada'}
        </span>
      </section>

      {aviso && <p className={`alerta ${aviso.tipo === 'erro' ? 'alerta-erro' : 'alerta-ok'}`}>{aviso.texto}</p>}

      <div className="ia-grade">
        <section className="cartao pilha-p">
          <h3 className="ia-h3">
            <Icone nome="chave" className="l-icone-p" /> Chave da OpenAI
          </h3>
          {info.definida ? (
            <p className="ia-chave-atual">
              <span className="mono">sk-…{info.final}</span>
              <span className="fonte-suave">cadastrada em {dataHora(info.atualizadaEm ?? null)}</span>
            </p>
          ) : (
            <p className="ajuda" style={{ marginTop: 0 }}>
              Nenhuma chave cadastrada. Crie uma em platform.openai.com, em API keys, e cole aqui.
            </p>
          )}
          <form onSubmit={salvarChave} className="pilha-p">
            <label className="campo" style={{ marginTop: 0 }}>
              <span className="rotulo">{info.definida ? 'Trocar a chave' : 'Colar a chave'}</span>
              <input
                className="entrada mono"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={chave}
                onChange={(e) => setChave(e.target.value)}
                placeholder="sk-…"
              />
              <span className="ajuda">
                Guardada cifrada no banco. Depois de salva, ninguém vê a chave inteira: nem nesta tela, nem na auditoria.
              </span>
            </label>
            <div className="ia-botoes">
              <button type="submit" className="botao botao-primario botao-auto" disabled={!chave.trim() || ocupado !== ''}>
                {ocupado === 'chave' ? 'Salvando…' : 'Salvar chave'}
              </button>
              {info.definida && (
                <>
                  <button type="button" className="botao botao-secundario botao-auto" onClick={testar} disabled={ocupado !== ''}>
                    {ocupado === 'teste' ? 'Testando…' : 'Testar a chave'}
                  </button>
                  <button
                    type="button"
                    className="link-botao link-perigo"
                    disabled={ocupado !== ''}
                    onClick={() =>
                      window.confirm('Apagar a chave da OpenAI? O botão de explicação passa a usar só a explicação montada pelas regras.') &&
                      void acao('apagar', async () => (await api.admin.apagarChaveIA(), 'Chave apagada.'))
                    }
                  >
                    Apagar chave
                  </button>
                </>
              )}
            </div>
          </form>
          {teste && <p className={`alerta ${teste.ok ? 'alerta-ok' : 'alerta-erro'}`}>{teste.mensagem}</p>}
        </section>

        <section className="cartao pilha-p">
          <h3 className="ia-h3">Como usar</h3>
          <form onSubmit={salvarConfig} className="pilha-p">
            <label className="marcar">
              <input type="checkbox" checked={config.ativo} onChange={(e) => setConfig({ ...config, ativo: e.target.checked })} />
              <span>Ligar a IA</span>
            </label>
            <fieldset className="campo ia-funcoes" disabled={!config.ativo}>
              <legend className="rotulo">Funções</legend>
              {FUNCOES.map((f) => (
                <label key={f.chave} className="marcar">
                  <input
                    type="checkbox"
                    checked={config.funcoes[f.chave]}
                    onChange={(e) => setConfig({ ...config, funcoes: { ...config.funcoes, [f.chave]: e.target.checked } })}
                  />
                  <span>
                    {f.nome}
                    <br />
                    <span className="fonte-suave">Desligada: {f.sem}.</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="campo">
              <span className="rotulo">Modelo</span>
              <select
                className="entrada"
                value={outroModelo ? 'outro' : config.modelo}
                onChange={(e) => setConfig({ ...config, modelo: e.target.value === 'outro' ? '' : e.target.value })}
              >
                {MODELOS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.rotulo}
                  </option>
                ))}
                <option value="outro">Outro (digitar o nome)</option>
              </select>
              {outroModelo && (
                <input
                  className="entrada mono"
                  style={{ marginTop: 8 }}
                  value={config.modelo}
                  onChange={(e) => setConfig({ ...config, modelo: e.target.value })}
                  placeholder="nome do modelo, como a OpenAI escreve"
                />
              )}
            </label>
            <label className="campo">
              <span className="rotulo">Limite de chamadas por dia (todas as funções)</span>
              <input
                className="entrada"
                type="number"
                min={0}
                max={100000}
                style={{ maxWidth: 160 }}
                value={config.limiteDiario}
                onChange={(e) => setConfig({ ...config, limiteDiario: Number(e.target.value) })}
              />
              <span className="ajuda">Passou do limite, cada função usa o seu plano B até o dia seguinte.</span>
            </label>
            <button type="submit" className="botao botao-primario botao-auto" disabled={ocupado !== ''}>
              {ocupado === 'config' ? 'Salvando…' : 'Salvar'}
            </button>
          </form>
        </section>
      </div>

      <section className="cartao">
        <h3 className="ia-h3">Uso</h3>
        <div className="ia-numeros">
          <div>
            <span className="painel-rotulo">Hoje</span>
            <span className="painel-valor">
              {uso.hoje} <small>de {dados.configuracao.limiteDiario}</small>
            </span>
          </div>
          <div>
            <span className="painel-rotulo">Neste mês</span>
            <span className="painel-valor">{uso.mes.chamadas}</span>
            <span className="fonte-suave ia-detalhe">
              {uso.mes.ok} aceitas · {uso.mes.rejeitadas} barradas pela conferência · {uso.mes.erros} com erro
            </span>
            {Object.keys(uso.mes.porTarefa ?? {}).length > 0 && (
              <span className="fonte-suave ia-detalhe">
                {(Object.entries(uso.mes.porTarefa) as [TarefaIA, number][])
                  .map(([t, n]) => `${NOME_TAREFA[t] ?? t}: ${n}`)
                  .join(' · ')}
              </span>
            )}
          </div>
          <div>
            <span className="painel-rotulo">Custo estimado no mês</span>
            <span className="painel-valor">
              {uso.mes.custoEstimadoUsd == null ? '—' : `US$ ${numeroBr(uso.mes.custoEstimadoUsd, uso.mes.custoEstimadoUsd < 1 ? 4 : 2)}`}
            </span>
            <span className="fonte-suave ia-detalhe">
              {numeroBr(uso.mes.tokensEntrada, 0)} tokens enviados · {numeroBr(uso.mes.tokensSaida, 0)} recebidos. O valor cobrado de
              verdade está no painel da OpenAI.
            </span>
          </div>
        </div>
      </section>

      <section className="cartao pilha-p ia-privacidade">
        <h3 className="ia-h3">O que vai para a OpenAI</h3>
        <p>
          Nas explicações, rascunhos e frases da carteira: só o que as regras decidiram (a situação de cada item, o resumo, os detalhes e
          as saídas previstas na norma). No recibo do CAR e nos documentos em PDF digital: o texto do arquivo. Antes do envio, o site
          tira CPF, CNPJ, código do CAR e e-mail. Documento escaneado ou foto vai como imagem, do jeito que está, e só depois de o técnico
          confirmar. Os arquivos não ficam guardados no site, o desenho do imóvel nunca é enviado, e o pedido vai marcado para a OpenAI
          não guardar a conversa.
        </p>
      </section>

      <NormasNovas disponivel={ligada && dados.configuracao.funcoes.normas} />
    </div>
  );
}

/**
 * Norma nova (resolução do CMN, portaria…): o administrador cola o texto e a IA aponta o que
 * mudou e quais regras do site conferir. Não muda nenhuma regra: é o ponto de partida da revisão.
 */
function NormasNovas({ disponivel }: { disponivel: boolean }) {
  const [analises, setAnalises] = useState<AnaliseNorma[]>([]);
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [analisando, setAnalisando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api.admin
      .normas()
      .then((r) => setAnalises(r.analises))
      .catch(() => setAnalises([]));
  }, []);

  async function analisar(ev: FormEvent) {
    ev.preventDefault();
    setErro('');
    setAnalisando(true);
    try {
      const r = await api.admin.analisarNorma(titulo, texto);
      setAnalises([r.analise, ...analises]);
      setTitulo('');
      setTexto('');
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setAnalisando(false);
    }
  }

  return (
    <section className="cartao pilha-p">
      <h3 className="ia-h3">
        <Icone nome="documento" className="l-icone-p" /> Normas novas
      </h3>
      <p className="ajuda" style={{ marginTop: 0 }}>
        Cole o texto de uma resolução ou portaria nova: a IA resume o que mudou e aponta quais regras do site conferir. Nada muda
        sozinho; a revisão das regras continua com você.
      </p>
      {disponivel ? (
        <form onSubmit={analisar} className="pilha-p">
          <label className="campo" style={{ marginTop: 0 }}>
            <span className="rotulo">Nome da norma</span>
            <input className="entrada" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Resolução CMN 5.400/2027" />
          </label>
          <label className="campo">
            <span className="rotulo">Texto da norma</span>
            <textarea className="entrada" rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </label>
          <button type="submit" className="botao botao-primario botao-auto" disabled={analisando || !titulo.trim() || !texto.trim()}>
            {analisando ? 'Analisando…' : 'Analisar'}
          </button>
        </form>
      ) : (
        <p className="ajuda">Ligue a IA e a função "Análise de norma nova" acima para usar.</p>
      )}
      {erro && (
        <p className="alerta alerta-erro" role="alert">
          {erro}
        </p>
      )}
      {analises.map((a) => (
        <article key={a.id} className="apoio-cartao">
          <div className="apoio-cartao-topo">
            <strong>{a.titulo}</strong>
            <span className="fonte-suave">{dataHora(a.geradaEm)}</span>
          </div>
          <p style={{ margin: 0 }}>{a.resumo}</p>
          {a.vigencia && <p className="ajuda">Vigência: {a.vigencia}</p>}
          {a.semRelacao ? (
            <p className="verificacao sim">Não parece mexer nos impedimentos do MCR 2-9 que o site confere.</p>
          ) : (
            <ul className="apoio-pontos">
              {a.mudancas.map((m) => (
                <li key={m.oQueMudou}>
                  <strong>{m.oQueMudou}</strong>
                  {m.regras.length > 0 && <span className="fonte-suave mono"> · {m.regras.join(', ')}</span>}
                  <br />
                  <span className="fonte-suave">Conferir: {m.oQueConferir}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </section>
  );
}
