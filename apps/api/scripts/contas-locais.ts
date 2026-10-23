/**
 * Contas de teste para ver as telas internas NO SEU COMPUTADOR (nunca em produção).
 *
 * Cria (ou reaproveita) duas contas e gera senhas novas a cada execução:
 *   - admin@apto.local   → administrador do painel e responsável por uma equipe
 *                          no plano Escritório, com fazendas reais na carteira e um dossiê;
 *   - tecnica@apto.local → técnica da mesma equipe (vê o site como um membro).
 * As senhas vão para o arquivo acesso-local.txt, na raiz do projeto (fora do Git).
 *
 * Uso (com o banco local rodando e as bases carregadas):
 *   npm run contas-locais -w @apto/api
 */
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { config } from '../src/config.js';
import { gerarHashSenha } from '../src/contas/senha.js';
import { EnviadorMemoria } from '../src/email/enviador.js';
import { criarContexto, criarServidor } from '../src/servidor.js';

if (config.producao || !config.demo) {
  console.error('Este script só roda no computador de desenvolvimento (APTO_DEMO=1, fora de produção).');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const ctx = criarContexto();
const caixa = new EnviadorMemoria();
ctx.email = caixa;
const app = criarServidor(ctx);

const CONTAS = {
  admin: { nome: 'Ana Administradora', email: 'admin@apto.local' },
  tecnica: { nome: 'Bia Técnica', email: 'tecnica@apto.local' },
};

/** Senha legível e forte, nova a cada execução. */
const novaSenha = () => `local-${randomBytes(6).toString('base64url')}-${randomBytes(6).toString('base64url')}`;
const cookieDe = (r: { headers: Record<string, unknown> }) => String(r.headers['set-cookie']).split(';')[0]!;

/** Cria a conta ou troca a senha da que já existe; deixa o e-mail confirmado. Devolve id e cookie de sessão. */
async function garantirConta(nome: string, email: string, senha: string) {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM usuario WHERE email = $1', [email]);
  if (!rows[0]) {
    const r = await app.inject({ method: 'POST', url: '/v1/conta', payload: { nome, email, senha, aceiteTermos: true } });
    if (r.statusCode !== 201) throw new Error(`Não consegui criar ${email}: ${r.body}`);
  } else {
    await pool.query('UPDATE usuario SET senha_hash = $2, bloqueado_em = NULL WHERE id = $1', [rows[0].id, await gerarHashSenha(senha)]);
  }
  await pool.query('UPDATE usuario SET email_confirmado_em = coalesce(email_confirmado_em, now()) WHERE email = $1', [email]);
  const login = await app.inject({ method: 'POST', url: '/v1/sessao', payload: { email, senha } });
  if (login.statusCode !== 200) throw new Error(`Não consegui entrar com ${email}: ${login.body}`);
  return { id: login.json().usuario.id as string, cookie: cookieDe(login) };
}

const pedir = (cookie: string, method: 'GET' | 'POST', url: string, payload?: object) =>
  app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

async function main() {
  const senhas = { admin: novaSenha(), tecnica: novaSenha() };
  const admin = await garantirConta(CONTAS.admin.nome, CONTAS.admin.email, senhas.admin);
  const tecnica = await garantirConta(CONTAS.tecnica.nome, CONTAS.tecnica.email, senhas.tecnica);
  await pool.query(`UPDATE usuario SET papel = 'admin' WHERE id = $1`, [admin.id]);

  // Plano Escritório com uma mensalidade paga (pagamento simulado): créditos e equipe.
  const atual = (await pedir(admin.cookie, 'GET', '/v1/assinatura')).json().assinatura;
  if (!atual || atual.status !== 'ativa') {
    const a = await pedir(admin.cookie, 'POST', '/v1/assinaturas', { plano: 'plano-escritorio' });
    const id = a.json().id ?? atual?.id;
    if (id) await pedir(admin.cookie, 'POST', `/v1/dev/assinaturas/${id}/pagar-mes`);
  }

  // Carteira com fazendas reais da amostra do MMA (uma com embargo, para o dossiê ter conteúdo).
  const carteira = (await pedir(admin.cookie, 'GET', '/v1/carteira')).json();
  if (carteira.imoveis.length === 0) {
    const { rows } = await pool.query(
      `(SELECT t.cod_car, t.geojson FROM teste_imovel_mma t
          WHERE EXISTS (SELECT 1 FROM ibama_embargo e WHERE e.ativo AND ST_Intersects(e.geom, t.geom)) ORDER BY md5(t.cod_car) LIMIT 1)
       UNION ALL
       (SELECT t.cod_car, t.geojson FROM teste_imovel_mma t WHERE t.status_car = 'AT' AND t.modulos_fiscais > 4 ORDER BY md5(t.cod_car) LIMIT 3)`,
    );
    if (rows.length === 0) console.warn('Aviso: a amostra de fazendas do MMA não está carregada; a carteira fica vazia.');
    const apelidos = ['Fazenda Santa Clara', 'Sítio Boa Esperança', 'Fazenda Três Irmãos', 'Fazenda Recanto Verde'];
    for (const [i, f] of rows.entries()) {
      const c = await pedir(admin.cookie, 'POST', '/v1/consultas', { car: f.cod_car, geometria: f.geojson });
      if (c.statusCode !== 201) continue;
      await pedir(admin.cookie, 'POST', '/v1/carteira', { consultaId: c.json().id, apelido: apelidos[i] });
      if (i === 0) await pedir(admin.cookie, 'POST', `/v1/consultas/${c.json().id}/dossie`);
    }
  }

  // A técnica entra na equipe da administradora (convite + aceite, como no site).
  const equipe = (await pedir(tecnica.cookie, 'GET', '/v1/eu')).json().equipe;
  if (!equipe) {
    const convite = await pedir(admin.cookie, 'POST', '/v1/equipe/convites', { email: CONTAS.tecnica.email, papel: 'tecnico' });
    const email = caixa.enviadas.find((m) => m.para === CONTAS.tecnica.email && m.assunto.includes('convidou'));
    const token = email && decodeURIComponent(/token=([^\s]+)/.exec(email.texto)![1]!);
    const aceite = token ? await pedir(tecnica.cookie, 'POST', '/v1/convites/aceitar', { token }) : null;
    if (aceite?.statusCode !== 200) console.warn(`Aviso: não deu para montar a equipe (${convite.body} ${aceite?.body ?? ''}).`);
  }

  const arquivo = resolve(import.meta.dirname, '../../../acesso-local.txt');
  writeFileSync(
    arquivo,
    [
      'ACESSO LOCAL DO APTO RURAL — só para o seu computador. Não envie a ninguém nem ao GitHub.',
      `Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Rodar o script de novo troca as senhas.`,
      '',
      `Site: ${config.webOrigin}`,
      '',
      'Administradora (painel /admin e responsável pela equipe do plano Escritório):',
      `  e-mail: ${CONTAS.admin.email}`,
      `  senha:  ${senhas.admin}`,
      '',
      'Técnica da equipe (vê o site como membro de equipe):',
      `  e-mail: ${CONTAS.tecnica.email}`,
      `  senha:  ${senhas.tecnica}`,
      '',
    ].join('\n'),
    'utf8',
  );
  console.log(`Contas prontas. E-mails e senhas em: ${arquivo}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    process.exit();
  });
