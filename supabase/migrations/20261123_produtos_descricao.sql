-- ============================================================================
-- DESCRIÇÃO DA PEÇA
-- ============================================================================
-- Campo livre para o que a foto não mostra: caimento, medidas, detalhe de uso,
-- marca na etiqueta. Em brechó é o que responde a pergunta que a cliente
-- mandaria no direct antes de comprar.
--
-- Idempotente.
-- ============================================================================

ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS descricao text;

COMMENT ON COLUMN produtos.descricao IS
  'Descrição livre da peça. Aparece na página dela na loja pública.';
