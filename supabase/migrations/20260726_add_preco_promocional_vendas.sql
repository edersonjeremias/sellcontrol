-- Adicionar coluna preco_promocional na tabela vendas
-- Permite definir preço promocional por item da venda

-- Adicionar coluna se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendas'
    AND column_name = 'preco_promocional'
  ) THEN
    ALTER TABLE vendas
    ADD COLUMN preco_promocional NUMERIC(10,2);
  END IF;
END $$;

-- Comentário da coluna
COMMENT ON COLUMN vendas.preco_promocional IS
  'Preço promocional do item. Quando preenchido, é usado no lugar do preço normal nas cobranças.';
