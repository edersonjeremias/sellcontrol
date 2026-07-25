-- Adicionar campo modo_promocao na tabela configuracoes
-- Permite ativar/desativar coluna de preços promocionais na tela de vendas

-- Adicionar coluna se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'configuracoes'
    AND column_name = 'modo_promocao'
  ) THEN
    ALTER TABLE configuracoes
    ADD COLUMN modo_promocao BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Comentário da coluna
COMMENT ON COLUMN configuracoes.modo_promocao IS
  'Ativa coluna de preços promocionais na tela de vendas. Quando true, permite definir preço promocional por item da live.';
