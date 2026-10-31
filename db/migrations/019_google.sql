-- Entrar com a conta Google (docs/login-google.md).
-- google_sub: o identificador fixo da conta Google ("sub" do token). O Google recomenda usar
-- ele, e não o e-mail, porque o e-mail de uma conta Google pode mudar.
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS google_sub text UNIQUE;

-- Conta criada pelo Google não tem senha até a pessoa criar uma ("Esqueci minha senha").
ALTER TABLE usuario ALTER COLUMN senha_hash DROP NOT NULL;
