import { describe, expect, it } from 'vitest';

process.env.APTO_DEMO = '1';
process.env.LOG_LEVEL = 'silent';
delete process.env.DATABASE_URL;

const { criarVigia, conferirSite } = await import('../src/vigia.js');
const { criarServidor, criarContexto } = await import('../src/servidor.js');

/** Site e serviço de alerta falsos: o teste decide se o site está no ar e guarda os sinais. */
function cenario() {
  const estado = { noAr: true, sinais: [] as string[], erros: [] as string[], registros: 0 };
  const buscar = (async (url: string | URL) => {
    const u = String(url);
    if (u.startsWith('https://alerta.exemplo/')) {
      estado.sinais.push(u.endsWith('/fail') ? 'falha' : 'ok');
      return new Response('OK');
    }
    if (!estado.noAr) throw Object.assign(new Error('conexão recusada'), { name: 'TypeError' });
    return Response.json({ ok: true, banco: true });
  }) as typeof fetch;
  const ctx = {
    erros: { registrar: async (e: { mensagem: string }) => void estado.erros.push(e.mensagem) },
    admin: { registrarVigia: async () => void estado.registros++ },
  } as never;
  const rodada = criarVigia(ctx, { endereco: 'https://site.exemplo', urlAviso: 'https://alerta.exemplo/abc', intervaloMs: 1, buscar });
  return { estado, rodada };
}

describe('vigia do site', () => {
  it('site no ar: manda o sinal de "deu certo" e registra a conferência', async () => {
    const { estado, rodada } = cenario();
    expect((await rodada()).ok).toBe(true);
    expect(estado.sinais).toEqual(['ok']);
    expect(estado.registros).toBe(1);
  });

  it('uma falha isolada não alarma; duas seguidas mandam a falha; o erro entra no registro uma vez só', async () => {
    const { estado, rodada } = cenario();
    estado.noAr = false;
    await rodada();
    expect(estado.sinais).toEqual([]);
    await rodada();
    await rodada();
    expect(estado.sinais).toEqual(['falha', 'falha']);
    expect(estado.erros).toHaveLength(1);
    expect(estado.erros[0]).toContain('fora do ar');
  });

  it('quando o site volta, o sinal de "deu certo" volta a sair', async () => {
    const { estado, rodada } = cenario();
    estado.noAr = false;
    await rodada();
    await rodada();
    estado.noAr = true;
    await rodada();
    expect(estado.sinais).toEqual(['falha', 'ok']);
  });

  it('sinal do backup: manda uma vez por backup (sucesso ou falha) e marca como enviado', async () => {
    const sinais: string[] = [];
    const pendentes = [
      { id: '1', ok: true, mensagem: 'Backup ok' },
      { id: '2', ok: false, mensagem: 'Cópia fora do servidor falhou' },
    ];
    const marcados: string[] = [];
    const ctx = {
      erros: { registrar: async () => undefined },
      admin: {
        registrarVigia: async () => undefined,
        backupsSemSinal: async () => pendentes.filter((p) => !marcados.includes(p.id)),
        marcarSinalBackup: async (id: string) => void marcados.push(id),
      },
    } as never;
    const buscar = (async (url: string | URL) => {
      const u = String(url);
      if (u.startsWith('https://alerta.exemplo/')) sinais.push(u.replace('https://alerta.exemplo/', ''));
      return u.startsWith('https://alerta.exemplo/') ? new Response('OK') : Response.json({ ok: true, banco: true });
    }) as typeof fetch;
    const rodada = criarVigia(ctx, { endereco: 'https://site.exemplo', urlBackup: 'https://alerta.exemplo/backup', intervaloMs: 1, buscar });
    await rodada();
    await rodada();
    expect(sinais).toEqual(['backup', 'backup/fail']);
    expect(marcados).toEqual(['1', '2']);
  });

  it('API no ar, mas sem banco, conta como falha', async () => {
    const buscar = (async () => Response.json({ ok: false, banco: false }, { status: 503 })) as unknown as typeof fetch;
    expect(await conferirSite('https://site.exemplo', buscar)).toMatchObject({ ok: false, mensagem: expect.stringContaining('503') });
  });
});

describe('/v1/saude confere o banco de verdade', () => {
  it('banco fora do ar: 503 (o Docker e o vigia percebem)', async () => {
    const ctx = criarContexto();
    ctx.bancoResponde = async () => false;
    const r = await criarServidor(ctx).inject({ method: 'GET', url: '/v1/saude' });
    expect(r.statusCode).toBe(503);
    expect(r.json()).toMatchObject({ ok: false, banco: false });
  });

  it('banco respondendo: 200 com banco: true', async () => {
    const ctx = criarContexto();
    ctx.bancoResponde = async () => true;
    const r = await criarServidor(ctx).inject({ method: 'GET', url: '/v1/saude' });
    expect(r.json()).toMatchObject({ ok: true, banco: true });
  });
});
