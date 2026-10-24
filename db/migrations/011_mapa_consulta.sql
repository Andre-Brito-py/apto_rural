-- Mapa do entorno de cada consulta: o recorte das bases públicas (UC, terra
-- indígena, quilombo, floresta pública, embargo) numa janela em volta do imóvel.
--
-- É uma "fotografia" do dia da consulta, guardada junto com o resultado: o mapa
-- do relatório e do dossiê mostra exatamente o que foi checado, mesmo que as
-- bases mudem depois. Só dados públicos; nada do produtor.
-- Consultas antigas ficam sem mapa (o site mostra só o contorno).
ALTER TABLE consulta ADD COLUMN IF NOT EXISTS mapa jsonb;
