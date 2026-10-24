// Asaas FALSO, só para o ensaio de produção (docs/ensaio-producao.md). Nunca usar no servidor real.
//
// Imita as rotas da API v3 que o Apto Rural chama (clientes, cobranças, assinaturas, estorno)
// e mostra uma "fatura" com um botão que manda o webhook de pagamento para a API, do jeito
// que o Asaas manda (cabeçalho asaas-access-token, evento PAYMENT_RECEIVED). Também reenvia
// o mesmo evento, para conferir que o crédito não entra duas vezes.
// Sem dependências: roda com "node asaas-falso.mjs".
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const PORTA = Number(process.env.PORTA ?? 8099);
const ENDERECO = process.env.ENDERECO_PUBLICO ?? `http://localhost:${PORTA}`;
const WEBHOOK = process.env.WEBHOOK_URL ?? 'http://api:3333/v1/webhooks/asaas';
const TOKEN = process.env.ASAAS_WEBHOOK_TOKEN ?? '';
const VOLTAR = process.env.SITE_URL ?? 'https://localhost';

const cobrancas = new Map(); // id → { id, value, description, externalReference, subscription, eventos: [] }
const assinaturas = new Map();
const novoId = (prefixo) => `${prefixo}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;

function json(res, status, corpo) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(corpo));
}

async function lerCorpo(req) {
  let texto = '';
  for await (const parte of req) texto += parte;
  if (!texto) return {};
  try {
    return JSON.parse(texto);
  } catch {
    return Object.fromEntries(new URLSearchParams(texto));
  }
}

async function mandarWebhook(cobranca, evento = 'PAYMENT_RECEIVED', idEvento = novoId('evt')) {
  const corpo = {
    id: idEvento,
    event: evento,
    payment: { id: cobranca.id, value: cobranca.value, externalReference: cobranca.externalReference, subscription: cobranca.subscription },
  };
  const r = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'asaas-access-token': TOKEN },
    body: JSON.stringify(corpo),
  });
  const resposta = await r.text();
  cobranca.eventos.push({ idEvento, evento, status: r.status, resposta });
  console.log(`webhook ${evento} ${cobranca.id} → ${r.status} ${resposta}`);
  return { idEvento, status: r.status, resposta };
}

const escapar = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function pagina(cobranca) {
  const historico = cobranca.eventos
    .map((e) => `<li><code>${escapar(e.evento)}</code> (${escapar(e.idEvento)}) → HTTP ${e.status}: <code>${escapar(e.resposta)}</code></li>`)
    .join('');
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fatura de teste</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#111}
.aviso{background:#fff4db;border:1px solid #f2d27a;padding:10px 14px;border-radius:10px}
.caixa{border:1px solid #ddd;border-radius:12px;padding:18px;margin-top:16px}button{font:inherit;padding:10px 16px;border-radius:8px;border:0;background:#0b5;color:#fff;cursor:pointer;margin:6px 6px 0 0}
button.s{background:#eee;color:#111}code{font-size:.85em}</style>
<p class="aviso"><strong>Asaas FALSO do ensaio de produção.</strong> Nenhum dinheiro de verdade. No servidor real, esta tela é a fatura do Asaas.</p>
<div class="caixa"><p>${escapar(cobranca.description)}</p><p><strong>R$ ${Number(cobranca.value).toFixed(2).replace('.', ',')}</strong></p>
<form method="post" action="/fatura/${cobranca.id}/pagar"><button>Pagar com Pix (simulado)</button></form>
<form method="post" action="/fatura/${cobranca.id}/reenviar"><button class="s">Reenviar o mesmo aviso (teste de duplicidade)</button></form>
<form method="post" action="/fatura/${cobranca.id}/estornar"><button class="s">Simular estorno</button></form>
<p><a href="${escapar(VOLTAR)}/conta">Voltar ao Apto Rural</a></p></div>
${historico ? `<div class="caixa"><strong>Avisos enviados à API</strong><ul>${historico}</ul></div>` : ''}</html>`;
}

createServer(async (req, res) => {
  const url = new URL(req.url, ENDERECO);
  const caminho = url.pathname;
  try {
    // Rotas da API v3 (o que o Apto Rural chama). Exige a chave, como o Asaas.
    if (caminho.startsWith('/v3/')) {
      if (!req.headers.access_token) return json(res, 401, { errors: [{ description: 'Sem access_token' }] });
      const corpo = req.method === 'POST' ? await lerCorpo(req) : {};
      if (req.method === 'POST' && caminho === '/v3/customers') {
        if (!corpo.name || !corpo.cpfCnpj) return json(res, 400, { errors: [{ description: 'name e cpfCnpj são obrigatórios' }] });
        return json(res, 200, { id: novoId('cus'), name: corpo.name });
      }
      if (req.method === 'POST' && caminho === '/v3/payments') {
        const c = { id: novoId('pay'), value: corpo.value, description: corpo.description, externalReference: corpo.externalReference, eventos: [] };
        cobrancas.set(c.id, c);
        return json(res, 200, { id: c.id, invoiceUrl: `${ENDERECO}/fatura/${c.id}` });
      }
      if (req.method === 'POST' && caminho === '/v3/subscriptions') {
        const s = { id: novoId('sub'), value: corpo.value, description: corpo.description };
        assinaturas.set(s.id, s);
        return json(res, 200, { id: s.id });
      }
      let m = /^\/v3\/subscriptions\/([^/]+)\/payments$/.exec(caminho);
      if (req.method === 'GET' && m && assinaturas.has(m[1])) {
        const s = assinaturas.get(m[1]);
        let c = [...cobrancas.values()].find((x) => x.subscription === s.id);
        if (!c) {
          c = { id: novoId('pay'), value: s.value, description: `${s.description} (1ª mensalidade)`, subscription: s.id, eventos: [] };
          cobrancas.set(c.id, c);
        }
        return json(res, 200, { data: [{ id: c.id, invoiceUrl: `${ENDERECO}/fatura/${c.id}` }] });
      }
      m = /^\/v3\/payments\/([^/]+)\/refund$/.exec(caminho);
      if (req.method === 'POST' && m && cobrancas.has(m[1])) {
        await mandarWebhook(cobrancas.get(m[1]), 'PAYMENT_REFUNDED');
        return json(res, 200, { id: m[1], status: 'REFUNDED' });
      }
      if (req.method === 'DELETE') return json(res, 200, { deleted: true });
      return json(res, 404, { errors: [{ description: `Rota não imitada: ${req.method} ${caminho}` }] });
    }

    // Fatura (o que a pessoa vê no navegador).
    const f = /^\/fatura\/([^/]+)(?:\/(pagar|reenviar|estornar))?$/.exec(caminho);
    const cobranca = f && cobrancas.get(f[1]);
    if (!cobranca) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Fatura não encontrada (o Asaas falso guarda as faturas só na memória).');
    }
    if (req.method === 'POST' && f[2] === 'pagar') await mandarWebhook(cobranca);
    if (req.method === 'POST' && f[2] === 'reenviar') {
      const ultimo = cobranca.eventos.at(-1);
      if (ultimo) await mandarWebhook(cobranca, ultimo.evento, ultimo.idEvento);
    }
    if (req.method === 'POST' && f[2] === 'estornar') await mandarWebhook(cobranca, 'PAYMENT_REFUNDED');
    if (req.method === 'POST') {
      res.writeHead(303, { Location: `/fatura/${cobranca.id}` });
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(pagina(cobranca));
  } catch (e) {
    console.error(e);
    json(res, 500, { errors: [{ description: String(e) }] });
  }
}).listen(PORTA, () => console.log(`Asaas falso em ${ENDERECO} (webhook → ${WEBHOOK})`));
