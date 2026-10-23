-- Direitos do titular (LGPD, art. 18): exclusão da conta pelo próprio usuário.
--
-- A linha do usuário não é apagada: pedidos e créditos ficam guardados pelo
-- prazo legal (CTN, art. 195, parágrafo único) e continuam apontando para ela.
-- Em vez disso, nome, e-mail, WhatsApp, profissão e senha são apagados e a
-- conta fica marcada como excluída.
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS excluida_em timestamptz;

-- E-mails de contas excluídas, só como código irreversível (HMAC): impede que
-- a mesma pessoa apague e recrie a conta para ganhar a amostra grátis de novo.
CREATE TABLE IF NOT EXISTS email_excluido (
  email_hash  text PRIMARY KEY,
  excluido_em timestamptz NOT NULL DEFAULT now()
);
