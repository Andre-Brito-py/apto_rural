import { useEffect, useState, type FormEvent } from 'react';
import { api, type ConfigIA, type PainelIA } from '../api';
import { Icone } from '../componentes/Icones';
import { numeroBr } from '../textos';
import { dataHora } from './Admin';

/** Modelos sugeridos (developers.openai.com/api/docs/pricing, 26/10/2026), do mais barato ao mais caro. */
const MODELOS = [
  { id: 'gpt-6-luna', rotulo: 'gpt-6-luna: o mais econômico (recomendado)' },
  { id: 'gpt-6.1-terra', rotulo: 'gpt-6.1-terra: rápido, cerca de 10 vezes o custo' },
  { id: 'gpt-6.1-sol', rotulo: 'gpt-6.1-sol: mais caprichado, cerca de 20 vezes o custo' },
];

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
      return config.ativo ? 'Configuração salva. O botão "Explicar para o produtor" já usa a IA.' : 'Configuração salva. A IA está desligada.';
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
          <h2 className="secao-titulo">Explicação para o produtor</h2>
          <p className="ajuda" style={{ marginTop: 2 }}>
            O botão no resultado da consulta reescreve em palavras simples o que as regras decidiram. A IA não decide nada; sem ela,
            o site usa uma explicação montada direto das regras.
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
              <span>Usar a IA no botão "Explicar para o produtor"</span>
            </label>
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
              <span className="rotulo">Limite de explicações por dia</span>
              <input
                className="entrada"
                type="number"
                min={0}
                max={100000}
                style={{ maxWidth: 160 }}
                value={config.limiteDiario}
                onChange={(e) => setConfig({ ...config, limiteDiario: Number(e.target.value) })}
              />
              <span className="ajuda">Passou do limite, o site usa a explicação montada pelas regras até o dia seguinte.</span>
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
          Só o que as regras decidiram: a situação de cada item, o resumo, os detalhes e as saídas previstas na norma. Antes do envio, o
          site tira CPF, CNPJ, código do CAR e e-mail. Nome, contato e o desenho do imóvel nunca são enviados, e o pedido vai marcado
          para a OpenAI não guardar a conversa.
        </p>
      </section>
    </div>
  );
}
