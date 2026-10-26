-- Explicação do resultado em linguagem simples, gerada por IA a partir do que as
-- regras já decidiram (docs/ia.md). A IA não decide nada: só reescreve.

-- Segredos editáveis pelo painel (ex.: chave da OpenAI). Guardados CIFRADOS
-- (AES-256-GCM) com a CHAVE_SEGREDOS, que fica só no .env do servidor: um vazamento
-- do banco ou de um backup não expõe a chave. O painel nunca mostra o valor.
CREATE TABLE IF NOT EXISTS segredo (
  nome           text PRIMARY KEY,
  valor_cifrado  text NOT NULL,          -- base64(iv | tag | texto cifrado)
  final          text NOT NULL,          -- últimos 4 caracteres, para o painel mostrar "sk-…a1B2"
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES usuario (id)
);

-- A explicação fica guardada com a consulta: gerada uma vez, aberta quantas vezes quiser.
ALTER TABLE consulta ADD COLUMN IF NOT EXISTS explicacao jsonb;

-- Cada chamada à IA (para o limite diário e o uso do mês no painel). Sem texto e sem
-- dado da consulta: só quando, o modelo, os tokens e o que aconteceu.
CREATE TABLE IF NOT EXISTS ia_uso (
  id             bigserial PRIMARY KEY,
  quando         timestamptz NOT NULL DEFAULT now(),
  modelo         text NOT NULL,
  tokens_entrada integer NOT NULL DEFAULT 0,
  tokens_saida   integer NOT NULL DEFAULT 0,
  -- ok: texto aceito | rejeitado: barrado pela conferência | erro: falha na chamada
  resultado      text NOT NULL CHECK (resultado IN ('ok', 'rejeitado', 'erro'))
);
CREATE INDEX IF NOT EXISTS ia_uso_quando ON ia_uso (quando);
