-- ================================================================
-- DOCUMENTOS DO FUNCIONARIO
--
-- Contrato de trabalho assinado, RG, CPF, exame admissional: papeis
-- que hoje ficam na pasta fisica e somem quando precisam. Ficam no
-- cadastro, no mesmo bucket privado dos comprovantes de pagamento.
--
-- Cada documento guarda caminho, nome dado por quem anexou e data,
-- em vez de so o caminho: "contrato assinado" e "aditivo 2026"
-- precisam se distinguir na lista.
--
-- O limite do bucket sobe para 10 MB: contrato digitalizado com
-- varias paginas nao cabe em 5 MB.
--
-- Rodar inteiro no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE funcionarios
  ADD COLUMN IF NOT EXISTS documentos JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN funcionarios.documentos IS
  'Lista de {caminho, nome, enviado_em} no bucket rh-comprovantes';

UPDATE funcionarios SET documentos = '[]'::jsonb WHERE documentos IS NULL;

UPDATE storage.buckets
   SET file_size_limit = 10485760
 WHERE id = 'rh-comprovantes';
