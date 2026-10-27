import type { ResultadoItem } from '@apto/regras';
import { useState } from 'react';
import { api, ErroApi, type ApoioDossie, type DocumentoConferido, type Rascunho, type TipoRascunho } from '../api';
import { lerDocumento, type DocumentoLido } from '../lerDocumento';
import { numeroBr } from '../textos';
import { Icone } from './Icones';

const SITUACAO_PONTO = {
  confere: 'Confere',
  diverge: 'Diverge',
  conferir: 'Conferir',
} as const;
const CAR_CITADO = {
  este: 'Cita o CAR deste imóvel.',
  outro: 'Cita OUTRO código de CAR: confira se é o documento certo.',
  nao_encontrado: 'Não achamos o código do CAR no documento.',
} as const;

/**
 * Apoio por IA em cada item do dossiê (docs/ia.md): conferir um documento com o que a
 * consulta encontrou e pedir rascunhos (carta ao banco, retificação do CAR, requerimento).
 * Fica só na tela: não sai na impressão do dossiê. Quem conclui é o técnico.
 */
export function ApoioItem({
  consultaId,
  item,
  apoio,
  aoMudar,
}: {
  consultaId: string;
  item: ResultadoItem;
  apoio: ApoioDossie;
  aoMudar: (a: ApoioDossie) => void;
}) {
  const documentos = apoio.documentos.filter((d) => d.regraId === item.regraId);
  const rascunhos = apoio.rascunhos.filter((r) => r.regraId === item.regraId);
  const tipos = apoio.rascunhosPorItem[item.regraId] ?? [];
  const [lendo, setLendo] = useState(false);
  const [gerando, setGerando] = useState<TipoRascunho | null>(null);
  const [comImagem, setComImagem] = useState<DocumentoLido | null>(null);
  const [erro, setErro] = useState('');

  async function enviarDocumento(doc: DocumentoLido) {
    setComImagem(null);
    setLendo(true);
    try {
      const d = await api.conferirDocumento(consultaId, {
        regraId: item.regraId,
        nomeArquivo: doc.nome,
        texto: doc.texto,
        imagens: doc.imagens,
      });
      aoMudar({ ...apoio, documentos: [d, ...apoio.documentos] });
    } catch (e) {
      setErro((e as ErroApi).message);
    } finally {
      setLendo(false);
    }
  }

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro('');
    setLendo(true);
    try {
      const doc = await lerDocumento(arquivo, { comImagens: true });
      setLendo(false);
      // Imagem vai como está (pode ter nomes e números): o técnico confirma antes.
      if (doc.imagens?.length) setComImagem(doc);
      else await enviarDocumento(doc);
    } catch (e) {
      setErro((e as Error).message);
      setLendo(false);
    }
  }

  async function pedirRascunho(tipo: TipoRascunho) {
    setErro('');
    setGerando(tipo);
    try {
      const r = await api.gerarRascunho(consultaId, item.regraId, tipo);
      aoMudar({ ...apoio, rascunhos: [r, ...apoio.rascunhos] });
    } catch (e) {
      setErro((e as ErroApi).message);
    } finally {
      setGerando(null);
    }
  }

  async function apagar(id: string) {
    try {
      await api.apagarApoio(consultaId, id);
      aoMudar({
        ...apoio,
        documentos: apoio.documentos.filter((d) => d.id !== id),
        rascunhos: apoio.rascunhos.filter((r) => r.id !== id),
      });
    } catch (e) {
      setErro((e as ErroApi).message);
    }
  }

  return (
    <div className="apoio nao-imprimir">
      <h3 className="dossie-sub">
        <Icone nome="olho" className="l-icone-p" /> Apoio para montar este item
      </h3>
      <p className="ajuda" style={{ marginTop: 0 }}>
        Só aparece na tela, não sai na impressão. A IA lê e escreve; quem confere e decide é você (e, depois, o banco).
      </p>

      <div className="apoio-bloco">
        <strong>Conferir um documento</strong>
        <span className="ajuda" style={{ marginTop: 0 }}>
          ASV, PRAD, TAC, termo de embargo, licença… A IA compara com o que a consulta encontrou. O arquivo não fica guardado.
        </span>
        {apoio.ia.documentos ? (
          <span className="ajuda">Indisponível agora: {apoio.ia.documentos}</span>
        ) : comImagem ? (
          <div className="apoio-confirmar" role="alertdialog" aria-label="Confirmar envio de imagem">
            <p>
              <strong>{comImagem.nome}</strong> é escaneado ou foto: vamos enviar{' '}
              {comImagem.imagens!.length === 1 ? 'a imagem' : `${comImagem.imagens!.length} páginas como imagem`} à OpenAI do jeito que
              está, com os nomes e números que aparecerem. Ela não guarda o envio. Prefira o PDF digital quando tiver.
            </p>
            <div className="apoio-acoes">
              <button type="button" className="botao botao-primario botao-pequeno" onClick={() => enviarDocumento(comImagem)}>
                Enviar mesmo assim
              </button>
              <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => setComImagem(null)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <label className="botao botao-secundario botao-pequeno apoio-arquivo">
            <input
              type="file"
              accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => escolher(e.target.files?.[0])}
              disabled={lendo}
            />
            <Icone nome="documento" className="l-icone-p" /> {lendo ? 'Lendo e conferindo…' : 'Escolher documento (PDF ou foto)'}
          </label>
        )}
        {documentos.map((d) => (
          <CartaoDocumento key={d.id} documento={d} aoApagar={() => apagar(d.id)} />
        ))}
      </div>

      {tipos.length > 0 && (
        <div className="apoio-bloco">
          <strong>Rascunhos</strong>
          <span className="ajuda" style={{ marginTop: 0 }}>
            {apoio.ia.rascunhos
              ? 'Sem IA agora: sai o modelo fixo, para você completar.'
              : 'Escritos com os fatos desta consulta. Revise antes de usar.'}
          </span>
          <div className="apoio-acoes">
            {tipos.map((t) => (
              <button
                key={t.tipo}
                type="button"
                className="botao botao-secundario botao-pequeno"
                onClick={() => pedirRascunho(t.tipo)}
                disabled={gerando != null}
              >
                {gerando === t.tipo ? 'Escrevendo…' : t.nome}
              </button>
            ))}
          </div>
          {rascunhos.map((r) => (
            <CartaoRascunho key={r.id} rascunho={r} aoApagar={() => apagar(r.id)} />
          ))}
        </div>
      )}

      {erro && (
        <p className="alerta alerta-erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}

function CartaoDocumento({ documento: d, aoApagar }: { documento: DocumentoConferido; aoApagar: () => void }) {
  const dados = [
    ['Órgão', d.orgao],
    ['Número', d.numero],
    ['Emissão', d.dataEmissao],
    ['Validade', d.validade],
    ['Área', d.areaHa == null ? null : `${numeroBr(d.areaHa, 2)} ha`],
  ].filter((x): x is [string, string] => x[1] != null);
  return (
    <div className="apoio-cartao">
      <div className="apoio-cartao-topo">
        <span>
          <strong>{d.tipoDocumento}</strong> <span className="fonte-suave">· {d.nomeArquivo}</span>
        </span>
        <button type="button" className="l-link" onClick={aoApagar}>
          Apagar
        </button>
      </div>
      {dados.length > 0 && (
        <dl className="apoio-dados">
          {dados.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {d.requisito && <p className="ajuda">Parece atender: {d.requisito}</p>}
      <p className={`verificacao ${d.car === 'este' ? 'sim' : d.car === 'outro' ? 'nao' : 'talvez'}`}>{CAR_CITADO[d.car]}</p>
      <ul className="apoio-pontos">
        {d.pontos.map((p) => (
          <li key={p.texto} className={`apoio-ponto-${p.situacao}`}>
            <span className="apoio-etiqueta">{SITUACAO_PONTO[p.situacao]}</span> {p.texto}
          </li>
        ))}
      </ul>
      {d.lidoDe === 'imagem' && <p className="ajuda">Lido de imagem: confira os números e as datas no documento.</p>}
    </div>
  );
}

function CartaoRascunho({ rascunho: r, aoApagar }: { rascunho: Rascunho; aoApagar: () => void }) {
  const [texto, setTexto] = useState(r.texto);
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sem permissão: o texto continua na caixa para copiar à mão */
    }
  }
  return (
    <div className="apoio-cartao">
      <div className="apoio-cartao-topo">
        <span>
          <strong>{r.titulo}</strong> <span className="fonte-suave">· {r.origem === 'ia' ? 'escrito pela IA' : 'modelo fixo'}</span>
        </span>
        <button type="button" className="l-link" onClick={aoApagar}>
          Apagar
        </button>
      </div>
      <textarea className="entrada apoio-texto" rows={12} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label={r.titulo} />
      <p className="ajuda">Complete o que está entre [colchetes]. As mudanças na caixa não ficam salvas: copie quando terminar.</p>
      <button type="button" className="botao botao-secundario botao-pequeno" onClick={copiar}>
        {copiado ? 'Copiado' : 'Copiar texto'}
      </button>
    </div>
  );
}
